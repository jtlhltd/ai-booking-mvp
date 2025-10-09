// lib/phone-validation.js
// Phone number validation using Twilio Lookup API

import twilio from 'twilio';

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

/**
 * Validate a phone number using Twilio Lookup API
 * Returns detailed information about the number including carrier, line type, and risk assessment
 * 
 * Cost: ~$0.005 per lookup (0.5 cents)
 * 
 * @param {string} phone - Phone number to validate (E.164 format recommended)
 * @returns {Object} - Validation result
 */
export async function validatePhoneNumber(phone) {
  if (!twilioClient) {
    console.log('[PHONE VALIDATION] Twilio not configured - skipping validation');
    return {
      valid: null, // Unknown
      validated: false,
      reason: 'twilio_not_configured',
      phone
    };
  }
  
  try {
    console.log(`[PHONE VALIDATION] Validating ${phone}...`);
    
    // Use Twilio Lookup V2 API with line type intelligence
    const lookup = await twilioClient.lookups.v2.phoneNumbers(phone)
      .fetch({
        fields: 'line_type_intelligence' // Get carrier and line type info
      });
    
    const lineType = lookup.lineTypeIntelligence?.type; // 'mobile', 'landline', 'voip', 'unknown'
    const carrierName = lookup.lineTypeIntelligence?.carrierName;
    const mobileCountryCode = lookup.lineTypeIntelligence?.mobileCountryCode;
    const mobileNetworkCode = lookup.lineTypeIntelligence?.mobileNetworkCode;
    
    // Calculate risk score (0-1 scale, 0 = low risk, 1 = high risk)
    const riskScore = calculateRiskScore({
      lineType,
      carrierName,
      valid: lookup.valid,
      countryCode: lookup.countryCode
    });
    
    const result = {
      valid: lookup.valid,
      validated: true,
      phone: lookup.phoneNumber,
      nationalFormat: lookup.nationalFormat,
      countryCode: lookup.countryCode,
      lineType,
      carrier: carrierName,
      mobileCountryCode,
      mobileNetworkCode,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      recommended: riskScore < 0.5 && lineType === 'mobile', // Only recommend if low risk and mobile
      validatedAt: new Date().toISOString()
    };
    
    console.log(`[PHONE VALIDATION] ${phone} → ${lineType} (risk: ${riskScore.toFixed(2)}, recommended: ${result.recommended})`);
    
    return result;
    
  } catch (error) {
    console.error(`[PHONE VALIDATION ERROR] ${phone}:`, error.message);
    
    // If lookup fails, return basic validation
    return {
      valid: false,
      validated: true,
      error: error.message,
      phone,
      riskScore: 1.0, // High risk if validation failed
      riskLevel: 'high',
      recommended: false
    };
  }
}

/**
 * Calculate risk score for a phone number
 * @param {Object} lookupData - Data from Twilio lookup
 * @returns {number} - Risk score from 0-1
 */
function calculateRiskScore(lookupData) {
  let risk = 0;
  
  // Higher risk for VOIP (could be disposable numbers or spam)
  if (lookupData.lineType === 'voip') {
    risk += 0.4;
  }
  
  // Higher risk for landlines (if we're specifically looking for mobiles)
  if (lookupData.lineType === 'landline') {
    risk += 0.2;
  }
  
  // Higher risk for unknown line types
  if (!lookupData.lineType || lookupData.lineType === 'unknown') {
    risk += 0.3;
  }
  
  // Higher risk if no carrier name (suspicious)
  if (!lookupData.carrierName) {
    risk += 0.2;
  }
  
  // Lower risk if it's a real mobile from valid UK carrier
  if (lookupData.lineType === 'mobile' && lookupData.countryCode === 'GB') {
    risk -= 0.3;
  }
  
  // Higher risk if number is not valid
  if (!lookupData.valid) {
    risk += 0.5;
  }
  
  // Clamp between 0-1
  return Math.max(0, Math.min(1, risk));
}

/**
 * Get risk level label from risk score
 * @param {number} score - Risk score 0-1
 * @returns {string} - Risk level
 */
function getRiskLevel(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Batch validate multiple phone numbers
 * @param {Array<string>} phones - Array of phone numbers
 * @param {Object} options - Validation options
 * @returns {Array} - Validation results
 */
export async function validatePhoneNumbers(phones, options = {}) {
  const {
    maxConcurrent = 5, // Max concurrent validations to avoid rate limits
    delay = 100, // Delay between validations (ms)
    filterMobileOnly = true // Only return mobile numbers
  } = options;
  
  console.log(`[PHONE VALIDATION BATCH] Validating ${phones.length} numbers...`);
  
  const results = [];
  const chunks = [];
  
  // Split into chunks for concurrent processing
  for (let i = 0; i < phones.length; i += maxConcurrent) {
    chunks.push(phones.slice(i, i + maxConcurrent));
  }
  
  for (const chunk of chunks) {
    // Validate chunk concurrently
    const chunkResults = await Promise.all(
      chunk.map(phone => validatePhoneNumber(phone))
    );
    
    results.push(...chunkResults);
    
    // Small delay between chunks to avoid rate limits
    if (delay > 0 && chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Filter results if requested
  let filtered = results;
  if (filterMobileOnly) {
    filtered = results.filter(r => r.lineType === 'mobile' && r.recommended);
    console.log(`[PHONE VALIDATION BATCH] Filtered to ${filtered.length}/${results.length} mobile numbers`);
  }
  
  const stats = {
    total: results.length,
    valid: results.filter(r => r.valid).length,
    mobile: results.filter(r => r.lineType === 'mobile').length,
    landline: results.filter(r => r.lineType === 'landline').length,
    voip: results.filter(r => r.lineType === 'voip').length,
    recommended: results.filter(r => r.recommended).length,
    lowRisk: results.filter(r => r.riskLevel === 'low').length,
    mediumRisk: results.filter(r => r.riskLevel === 'medium').length,
    highRisk: results.filter(r => r.riskLevel === 'high').length
  };
  
  console.log(`[PHONE VALIDATION BATCH] Complete:`, stats);
  
  return {
    results: filtered,
    allResults: results,
    stats
  };
}

/**
 * Check if phone validation is configured
 * @returns {boolean}
 */
export function isPhoneValidationEnabled() {
  return !!twilioClient;
}

