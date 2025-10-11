// lib/lead-deduplication.js
// Lead deduplication, phone validation, and opt-out management

import { query } from '../db.js';

// UK Do Not Call list (placeholder - integrate with real DNC registry)
const DNC_LIST = new Set();

// Opt-out list (stored in database)
let optOutCache = new Set();
let lastOptOutLoad = null;
const OPT_OUT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Validate UK phone number
 * @param {string} phone - Phone number to validate
 * @returns {Object} - Validation result
 */
export function validateUKPhone(phone) {
  if (!phone) {
    return { valid: false, reason: 'empty' };
  }
  
  const cleaned = phone.replace(/\s+/g, '').replace(/[()]/g, '');
  
  // UK mobile numbers (07xxx xxxxxx)
  const ukMobileRegex = /^(\+44|0)7\d{9}$/;
  
  // UK landline numbers (01xxx, 02xxx, etc.)
  const ukLandlineRegex = /^(\+44|0)(1|2)\d{8,9}$/;
  
  // Check if it matches UK patterns
  if (ukMobileRegex.test(cleaned)) {
    return {
      valid: true,
      type: 'mobile',
      normalized: cleaned.startsWith('+44') ? cleaned : '+44' + cleaned.substring(1)
    };
  }
  
  if (ukLandlineRegex.test(cleaned)) {
    return {
      valid: true,
      type: 'landline',
      normalized: cleaned.startsWith('+44') ? cleaned : '+44' + cleaned.substring(1)
    };
  }
  
  // Check if it's international (starting with +)
  if (cleaned.startsWith('+') && cleaned.length >= 10) {
    return {
      valid: true,
      type: 'international',
      normalized: cleaned,
      warning: 'Non-UK number'
    };
  }
  
  return {
    valid: false,
    reason: 'invalid_format',
    original: phone
  };
}

/**
 * Check if lead is a duplicate
 * @param {string} clientKey - Client identifier
 * @param {string} phone - Normalized phone number
 * @param {Object} options - Check options
 * @returns {Promise<Object>} - Duplicate check result
 */
export async function checkDuplicate(clientKey, phone, options = {}) {
  const {
    checkDays = 30, // Check for duplicates in last 30 days
    checkAllTime = false
  } = options;
  
  try {
    let sql;
    let params;
    
    if (checkAllTime) {
      sql = `
        SELECT 
          id, 
          name, 
          phone, 
          created_at,
          status
        FROM leads
        WHERE client_key = $1 
        AND phone = $2
        ORDER BY created_at DESC
        LIMIT 5
      `;
      params = [clientKey, phone];
    } else {
      sql = `
        SELECT 
          id, 
          name, 
          phone, 
          created_at,
          status
        FROM leads
        WHERE client_key = $1 
        AND phone = $2
        AND created_at >= NOW() - INTERVAL '${checkDays} days'
        ORDER BY created_at DESC
        LIMIT 5
      `;
      params = [clientKey, phone];
    }
    
    const result = await query(sql, params);
    
    if (result.rows.length > 0) {
      const mostRecent = result.rows[0];
      const daysSince = Math.floor((Date.now() - new Date(mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        isDuplicate: true,
        existingLeads: result.rows,
        mostRecentId: mostRecent.id,
        daysSinceLastContact: daysSince,
        shouldSkip: daysSince < 7, // Don't call again within 7 days
        warning: daysSince < 7 
          ? `Lead was contacted ${daysSince} days ago` 
          : `Lead was contacted ${daysSince} days ago - proceed with caution`
      };
    }
    
    return {
      isDuplicate: false,
      shouldSkip: false
    };
    
  } catch (error) {
    console.error('[DUPLICATE CHECK ERROR]', error);
    return {
      isDuplicate: false,
      shouldSkip: false,
      error: error.message
    };
  }
}

/**
 * Check if phone number is on opt-out list
 * @param {string} phone - Normalized phone number
 * @returns {Promise<boolean>} - True if opted out
 */
export async function isOptedOut(phone) {
  try {
    // Refresh cache if stale
    if (!lastOptOutLoad || (Date.now() - lastOptOutLoad) > OPT_OUT_CACHE_TTL) {
      await loadOptOutCache();
    }
    
    return optOutCache.has(phone);
    
  } catch (error) {
    console.error('[OPT-OUT CHECK ERROR]', error);
    return false; // Fail open (don't block if check fails)
  }
}

/**
 * Load opt-out list into cache
 */
async function loadOptOutCache() {
  try {
    const result = await query(`
      SELECT phone 
      FROM opt_out_list
      WHERE active = true
    `);
    
    optOutCache = new Set(result.rows.map(r => r.phone));
    lastOptOutLoad = Date.now();
    
    console.log(`[OPT-OUT] Loaded ${optOutCache.size} opted-out numbers`);
    
  } catch (error) {
    // Table might not exist yet
    console.error('[OPT-OUT LOAD ERROR]', error);
  }
}

/**
 * Add phone number to opt-out list
 * @param {string} phone - Normalized phone number
 * @param {string} reason - Opt-out reason
 * @returns {Promise<Object>} - Result
 */
export async function addToOptOut(phone, reason = 'user_request') {
  try {
    await query(`
      INSERT INTO opt_out_list (phone, reason, opted_out_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (phone) 
      DO UPDATE SET active = true, opted_out_at = NOW(), reason = $2
    `, [phone, reason]);
    
    // Update cache
    optOutCache.add(phone);
    
    console.log(`[OPT-OUT] Added ${phone} to opt-out list`);
    
    return { success: true, phone };
    
  } catch (error) {
    console.error('[OPT-OUT ADD ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove phone number from opt-out list
 * @param {string} phone - Normalized phone number
 * @returns {Promise<Object>} - Result
 */
export async function removeFromOptOut(phone) {
  try {
    await query(`
      UPDATE opt_out_list 
      SET active = false, updated_at = NOW()
      WHERE phone = $1
    `, [phone]);
    
    // Update cache
    optOutCache.delete(phone);
    
    console.log(`[OPT-OUT] Removed ${phone} from opt-out list`);
    
    return { success: true, phone };
    
  } catch (error) {
    console.error('[OPT-OUT REMOVE ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process lead for import - full validation pipeline
 * @param {Object} lead - Lead data
 * @param {string} clientKey - Client identifier
 * @returns {Promise<Object>} - Processing result
 */
export async function processLeadForImport(lead, clientKey) {
  const result = {
    valid: false,
    shouldImport: false,
    issues: [],
    warnings: []
  };
  
  // 1. Validate phone number
  const phoneValidation = validateUKPhone(lead.phone);
  if (!phoneValidation.valid) {
    result.issues.push(`Invalid phone number: ${phoneValidation.reason}`);
    return result;
  }
  
  const normalizedPhone = phoneValidation.normalized;
  result.normalizedPhone = normalizedPhone;
  result.phoneType = phoneValidation.type;
  
  if (phoneValidation.warning) {
    result.warnings.push(phoneValidation.warning);
  }
  
  // 2. Check opt-out list
  const optedOut = await isOptedOut(normalizedPhone);
  if (optedOut) {
    result.issues.push('Phone number is on opt-out list');
    return result;
  }
  
  // 3. Check duplicates
  const duplicateCheck = await checkDuplicate(clientKey, normalizedPhone);
  if (duplicateCheck.isDuplicate) {
    result.isDuplicate = true;
    result.existingLeads = duplicateCheck.existingLeads;
    
    if (duplicateCheck.shouldSkip) {
      result.issues.push(duplicateCheck.warning);
      return result;
    } else {
      result.warnings.push(duplicateCheck.warning);
    }
  }
  
  // 4. All checks passed
  result.valid = true;
  result.shouldImport = true;
  
  return result;
}

/**
 * Bulk process leads for import
 * @param {Array} leads - Array of lead objects
 * @param {string} clientKey - Client identifier
 * @returns {Promise<Object>} - Processing summary
 */
export async function bulkProcessLeads(leads, clientKey) {
  const results = {
    total: leads.length,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    optedOut: 0,
    validLeads: [],
    invalidLeads: [],
    warnings: []
  };
  
  for (const lead of leads) {
    const processed = await processLeadForImport(lead, clientKey);
    
    if (processed.shouldImport) {
      results.valid++;
      results.validLeads.push({
        ...lead,
        phone: processed.normalizedPhone,
        phoneType: processed.phoneType
      });
      
      if (processed.warnings.length > 0) {
        results.warnings.push({
          lead: lead.phone,
          warnings: processed.warnings
        });
      }
    } else {
      results.invalid++;
      results.invalidLeads.push({
        ...lead,
        issues: processed.issues
      });
      
      if (processed.issues.some(i => i.includes('opt-out'))) {
        results.optedOut++;
      } else if (processed.isDuplicate) {
        results.duplicates++;
      }
    }
  }
  
  console.log(`[BULK PROCESS] Processed ${results.total} leads: ${results.valid} valid, ${results.invalid} invalid (${results.duplicates} duplicates, ${results.optedOut} opted out)`);
  
  return results;
}

export default {
  validateUKPhone,
  checkDuplicate,
  isOptedOut,
  addToOptOut,
  removeFromOptOut,
  processLeadForImport,
  bulkProcessLeads
};

