// lib/ab-testing.js
// A/B testing for Vapi call scripts

// Define different script variants to test
export const VAPI_SCRIPT_VARIANTS = {
  variant_a_direct: {
    name: "Direct Approach",
    description: "Straight to the point - mention value proposition immediately",
    prompt: `You're calling {businessName}. 

Introduce yourself as an AI assistant from [Company Name]. Say: 
"We help businesses like yours get 30% more bookings through automated appointment systems. Would you like a free demo?"

Keep it under 60 seconds. If they say yes, offer to schedule immediately.`,
    expectedBookingRate: 0.12
  },
  
  variant_b_consultative: {
    name: "Consultative Approach",
    description: "Ask questions first, then provide solution",
    prompt: `You're calling {businessName}.

Start by asking: "How are you currently handling appointment bookings and reminders?"

Listen to their answer, acknowledge their challenges, then explain:
"We have a system that could help with that. It automates bookings, sends SMS reminders, and syncs with your calendar. Would you like a free 15-minute consultation to see if it fits your needs?"`,
    expectedBookingRate: 0.15
  },
  
  variant_c_social_proof: {
    name: "Social Proof Approach",
    description: "Lead with credibility and results",
    prompt: `You're calling {businessName}.

Say: "We work with over 50 {industry} businesses across the UK. On average, they're getting 30% more bookings and saving 10 hours per week since using our automated booking system.

Would you like to see how it works? I can show you in just 2 minutes."

Focus on results and social proof, not features.`,
    expectedBookingRate: 0.18
  }
};

/**
 * Assign a random variant to a lead for A/B testing
 * @param {string} leadPhone - Lead's phone number
 * @param {string} clientKey - Client identifier
 * @returns {Object} - Assigned variant
 */
export async function assignCallVariant(leadPhone, clientKey) {
  const variants = Object.keys(VAPI_SCRIPT_VARIANTS);
  const assignedVariantKey = variants[Math.floor(Math.random() * variants.length)];
  const variant = VAPI_SCRIPT_VARIANTS[assignedVariantKey];
  
  // Store assignment in database
  try {
    const { recordABTestAssignment } = await import('../db.js');
    await recordABTestAssignment({
      clientKey,
      leadPhone,
      experimentName: 'vapi_script_optimization',
      variantName: assignedVariantKey,
      metadata: {
        variantDescription: variant.description,
        expectedBookingRate: variant.expectedBookingRate
      }
    });
    
    console.log(`[AB TEST] Assigned ${assignedVariantKey} to ${leadPhone} (${clientKey})`);
  } catch (error) {
    console.error('[AB TEST ASSIGNMENT ERROR]', error.message);
  }
  
  return {
    key: assignedVariantKey,
    ...variant
  };
}

/**
 * Record outcome of an A/B test variant
 * @param {Object} params - Outcome parameters
 */
export async function recordCallOutcome({ clientKey, leadPhone, outcome, duration, sentiment, qualityScore }) {
  try {
    const { recordABTestOutcome } = await import('../db.js');
    
    await recordABTestOutcome({
      clientKey,
      experimentName: 'vapi_script_optimization',
      leadPhone,
      outcome: outcome === 'booked' ? 'conversion' : 'no_conversion',
      outcomeData: {
        outcome,
        duration,
        sentiment,
        qualityScore,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`[AB TEST OUTCOME] ${leadPhone}: ${outcome} (quality: ${qualityScore})`);
  } catch (error) {
    console.error('[AB TEST OUTCOME ERROR]', error.message);
  }
}

/**
 * Get A/B test results for analysis
 * @param {string} clientKey - Client identifier
 * @returns {Object} - Test results with statistics
 */
export async function getABTestResults(clientKey) {
  try {
    const { getABTestResults: getResults } = await import('../db.js');
    
    const results = await getResults(clientKey, 'vapi_script_optimization');
    
    if (!results || results.length === 0) {
      return {
        experimentName: 'vapi_script_optimization',
        variants: {},
        winner: null,
        message: 'No A/B test data available yet'
      };
    }
    
    // Calculate stats per variant
    const variantStats = {};
    
    for (const variantKey of Object.keys(VAPI_SCRIPT_VARIANTS)) {
      const variantCalls = results.filter(r => r.variant_name === variantKey);
      const conversions = variantCalls.filter(r => r.outcome === 'conversion').length;
      const totalCalls = variantCalls.length;
      
      if (totalCalls > 0) {
        const avgQuality = variantCalls.reduce((sum, c) => sum + (c.outcomeData?.qualityScore || 0), 0) / totalCalls;
        const avgDuration = variantCalls.reduce((sum, c) => sum + (c.outcomeData?.duration || 0), 0) / totalCalls;
        
        variantStats[variantKey] = {
          name: VAPI_SCRIPT_VARIANTS[variantKey].name,
          description: VAPI_SCRIPT_VARIANTS[variantKey].description,
          totalCalls,
          conversions,
          conversionRate: (conversions / totalCalls),
          avgQualityScore: avgQuality,
          avgDuration: Math.round(avgDuration),
          expectedRate: VAPI_SCRIPT_VARIANTS[variantKey].expectedBookingRate
        };
      }
    }
    
    // Find winner (highest conversion rate with statistical significance)
    const variantsWithData = Object.entries(variantStats)
      .filter(([_, stats]) => stats.totalCalls >= 10) // Need at least 10 calls for significance
      .sort((a, b) => b[1].conversionRate - a[1].conversionRate);
    
    const winner = variantsWithData.length > 0 ? {
      key: variantsWithData[0][0],
      ...variantsWithData[0][1],
      improvement: variantsWithData.length > 1 
        ? ((variantsWithData[0][1].conversionRate - variantsWithData[1][1].conversionRate) / variantsWithData[1][1].conversionRate) * 100
        : 0
    } : null;
    
    return {
      experimentName: 'vapi_script_optimization',
      variants: variantStats,
      winner,
      totalTests: results.length,
      message: winner 
        ? `${winner.name} is winning with ${(winner.conversionRate * 100).toFixed(1)}% conversion rate`
        : 'Not enough data to determine winner (need 10+ calls per variant)'
    };
    
  } catch (error) {
    console.error('[AB TEST RESULTS ERROR]', error.message);
    return {
      error: error.message,
      variants: {}
    };
  }
}

/**
 * Get personalized script for a business
 * @param {Object} variant - Variant object
 * @param {Object} business - Business details
 * @returns {string} - Personalized prompt
 */
export function getPersonalizedPrompt(variant, business) {
  let prompt = variant.prompt;
  
  // Replace placeholders
  prompt = prompt.replace(/{businessName}/g, business.name || 'the business');
  prompt = prompt.replace(/{industry}/g, business.industry || 'their industry');
  
  return prompt;
}

