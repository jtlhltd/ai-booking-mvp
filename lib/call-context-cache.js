// Global cache for call context from VAPI webhooks
// Stores { callId: { phone, customerName, timestamp, ...callData } }
const callContextCache = new Map();
const CALL_CONTEXT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Store call context from webhook for later retrieval
 * @param {string} callId - VAPI call ID
 * @param {string} phone - Customer phone number (E.164 format)
 * @param {string} customerName - Customer name
 * @param {object} callData - Additional call data to store
 */
export function storeCallContext(callId, phone, customerName, callData = {}) {
  if (!callId) return;
  
  console.log('[CALL CONTEXT CACHE] 📝 Storing:', { 
    callId: callId.substring(0, 16) + '...', 
    phone, 
    customerName: customerName || '(none)' 
  });
  
  callContextCache.set(callId, {
    phone: phone || '',
    customerName: customerName || '',
    timestamp: Date.now(),
    ...callData
  });
  
  // Auto-cleanup after TTL
  setTimeout(() => {
    if (callContextCache.has(callId)) {
      console.log('[CALL CONTEXT CACHE] 🧹 Cleaning up expired:', callId.substring(0, 16) + '...');
      callContextCache.delete(callId);
    }
  }, CALL_CONTEXT_TTL);
}

/**
 * Retrieve call context by call ID
 * @param {string} callId - VAPI call ID
 * @returns {object|null} - Call context or null if not found/expired
 */
export function getCallContext(callId) {
  if (!callId) {
    console.log('[CALL CONTEXT CACHE] ⚠️  No callId provided');
    return null;
  }
  
  const context = callContextCache.get(callId);
  if (!context) {
    console.log('[CALL CONTEXT CACHE] ❌ Not found:', callId.substring(0, 16) + '...');
    console.log('[CALL CONTEXT CACHE] 📊 Cache size:', callContextCache.size);
    console.log('[CALL CONTEXT CACHE] 📋 Available call IDs:', 
      Array.from(callContextCache.keys()).map(id => id.substring(0, 16) + '...').join(', ')
    );
    return null;
  }
  
  // Check if expired
  if (Date.now() - context.timestamp > CALL_CONTEXT_TTL) {
    console.log('[CALL CONTEXT CACHE] ⏰ Expired:', callId.substring(0, 16) + '...');
    callContextCache.delete(callId);
    return null;
  }
  
  console.log('[CALL CONTEXT CACHE] ✅ Retrieved:', { 
    callId: callId.substring(0, 16) + '...', 
    phone: context.phone,
    age: Math.round((Date.now() - context.timestamp) / 1000) + 's'
  });
  return context;
}

/**
 * Get the most recent call context for a tenant
 * Useful when callId is not available but we need phone number
 */
export function getMostRecentCallContext(tenantKey) {
  if (!tenantKey) {
    console.log('[CALL CONTEXT CACHE] ⚠️  No tenantKey provided for recent lookup');
    return null;
  }
  
  let mostRecent = null;
  let latestTimestamp = 0;
  
  for (const [callId, context] of callContextCache.entries()) {
    if (context.metadata?.tenantKey === tenantKey) {
      const timestamp = context.metadata?.timestamp || 0;
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        mostRecent = context;
      }
    }
  }
  
  if (mostRecent) {
    console.log('[CALL CONTEXT CACHE] ✅ Found most recent call for tenant:', tenantKey, 'Phone:', mostRecent.phone);
  } else {
    console.log('[CALL CONTEXT CACHE] ❌ No recent call found for tenant:', tenantKey);
  }
  
  return mostRecent;
}

/**
 * Clear all cached call contexts (useful for testing)
 */
export function clearCallContextCache() {
  const size = callContextCache.size;
  callContextCache.clear();
  console.log('[CALL CONTEXT CACHE] 🗑️  Cleared all contexts:', size);
}

/**
 * Get cache statistics
 */
export function getCallContextCacheStats() {
  return {
    size: callContextCache.size,
    callIds: Array.from(callContextCache.keys()),
    oldestEntry: Array.from(callContextCache.values())
      .reduce((oldest, ctx) => !oldest || ctx.timestamp < oldest ? ctx.timestamp : oldest, null)
  };
}

