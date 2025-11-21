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
  console.log('[CALL CONTEXT CACHE] ==================== STORING ====================');
  console.log('[CALL CONTEXT CACHE] 📥 Input params:', {
    callId: callId,
    phone: phone,
    customerName: customerName,
    callData: callData
  });
  
  if (!callId) {
    console.log('[CALL CONTEXT CACHE] ❌ No callId, aborting storage');
    return;
  }
  
  const contextToStore = {
    phone: phone || '',
    customerName: customerName || '',
    timestamp: Date.now(),
    ...callData
  };
  
  console.log('[CALL CONTEXT CACHE] 💾 Storing context object:', JSON.stringify(contextToStore, null, 2));
  
  callContextCache.set(callId, contextToStore);
  
  console.log('[CALL CONTEXT CACHE] ✅✅✅ STORED SUCCESSFULLY');
  console.log('[CALL CONTEXT CACHE] 📊 Post-storage stats:', {
    totalCacheSize: callContextCache.size,
    canRetrieve: callContextCache.has(callId),
    storedPhone: contextToStore.phone,
    storedTenantKey: contextToStore.tenantKey
  });
  
  // Verify storage immediately
  const verify = callContextCache.get(callId);
  console.log('[CALL CONTEXT CACHE] ✔️ Immediate verification:', {
    retrieved: !!verify,
    phoneMatches: verify?.phone === phone,
    tenantKeyMatches: verify?.tenantKey === callData.tenantKey,
    fullContext: verify
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
  console.log('[CALL CONTEXT CACHE] ==================== MOST RECENT LOOKUP ====================');
  console.log('[CALL CONTEXT CACHE] 🔍 Looking for tenantKey:', tenantKey);
  console.log('[CALL CONTEXT CACHE] 📊 Total entries in cache:', callContextCache.size);
  
  if (!tenantKey) {
    console.log('[CALL CONTEXT CACHE] ❌ No tenantKey provided for recent lookup');
    return null;
  }
  
  // Debug: show all cache entries
  console.log('[CALL CONTEXT CACHE] 📋 ALL CACHE ENTRIES:');
  let entryCount = 0;
  for (const [callId, context] of callContextCache.entries()) {
    entryCount++;
    console.log(`[CALL CONTEXT CACHE] Entry ${entryCount}:`, {
      callId: callId.substring(0, 20) + '...',
      phone: context.phone,
      name: context.name,
      'metadata.tenantKey': context.metadata?.tenantKey,
      'metadata.status': context.metadata?.status,
      timestamp: context.metadata?.timestamp,
      age: Date.now() - (context.metadata?.timestamp || 0) + 'ms'
    });
  }
  
  let mostRecent = null;
  let mostRecentCallId = null;
  let latestTimestamp = 0;
  let matchCount = 0;
  
  console.log('[CALL CONTEXT CACHE] 🔍 Searching for matches...');
  for (const [callId, context] of callContextCache.entries()) {
    const contextTenantKey = context.metadata?.tenantKey;
    const matches = contextTenantKey === tenantKey;
    
    console.log(`[CALL CONTEXT CACHE] Checking:`, {
      callId: callId.substring(0, 20),
      contextTenantKey: contextTenantKey,
      searchTenantKey: tenantKey,
      matches: matches
    });
    
    if (matches) {
      matchCount++;
      const timestamp = context.metadata?.timestamp || 0;
      console.log(`[CALL CONTEXT CACHE] ✅ MATCH #${matchCount}! Timestamp:`, timestamp, 'vs current latest:', latestTimestamp);
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        mostRecent = context;
        mostRecentCallId = callId;
        console.log('[CALL CONTEXT CACHE] 🎯 This is now the most recent! CallId:', callId);
      }
    }
  }
  
  console.log('[CALL CONTEXT CACHE] 📊 Search complete:', {
    totalMatches: matchCount,
    foundMostRecent: !!mostRecent,
    mostRecentPhone: mostRecent?.phone
  });
  
  if (mostRecent) {
    console.log('[CALL CONTEXT CACHE] ✅✅✅ FOUND MOST RECENT:', {
      callId: mostRecentCallId,
      tenantKey: tenantKey,
      phone: mostRecent.phone,
      name: mostRecent.name,
      age: Date.now() - latestTimestamp + 'ms'
    });
    // Return with callId included
    return {
      callId: mostRecentCallId,
      ...mostRecent
    };
  } else {
    console.log('[CALL CONTEXT CACHE] ❌❌❌ NO MATCH FOUND FOR TENANT:', tenantKey);
  }
  
  return null;
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

