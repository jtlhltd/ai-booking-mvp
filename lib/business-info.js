// lib/business-info.js
// Business information and FAQ management for AI assistant

import { query } from '../db.js';

/**
 * Get business information for a client
 * @param {string} clientKey
 * @returns {Promise<Object>}
 */
export async function getBusinessInfo(clientKey) {
  try {
    const result = await query(`
      SELECT 
        hours_json,
        services_json,
        policies_json,
        location_json
      FROM business_info
      WHERE client_key = $1
    `, [clientKey]);

    if (result.rows.length === 0) {
      // Return default structure if not found
      return getDefaultBusinessInfo();
    }

    const row = result.rows[0];
    return {
      hours: row.hours_json || {},
      services: row.services_json || [],
      policies: row.policies_json || {},
      location: row.location_json || {}
    };

  } catch (error) {
    console.error('[BUSINESS INFO] Error getting business info:', error);
    return getDefaultBusinessInfo();
  }
}

/**
 * Update business information
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function updateBusinessInfo({
  clientKey,
  hours = null,
  services = null,
  policies = null,
  location = null
}) {
  try {
    // Get existing info
    const existing = await getBusinessInfo(clientKey);

    const updatedHours = hours || existing.hours;
    const updatedServices = services || existing.services;
    const updatedPolicies = policies || existing.policies;
    const updatedLocation = location || existing.location;

    await query(`
      INSERT INTO business_info (
        client_key,
        hours_json,
        services_json,
        policies_json,
        location_json,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (client_key) DO UPDATE SET
        hours_json = EXCLUDED.hours_json,
        services_json = EXCLUDED.services_json,
        policies_json = EXCLUDED.policies_json,
        location_json = EXCLUDED.location_json,
        updated_at = NOW()
    `, [
      clientKey,
      JSON.stringify(updatedHours),
      JSON.stringify(updatedServices),
      JSON.stringify(updatedPolicies),
      JSON.stringify(updatedLocation)
    ]);

    console.log('[BUSINESS INFO] ✅ Business info updated for:', clientKey);

    return {
      success: true,
      info: {
        hours: updatedHours,
        services: updatedServices,
        policies: updatedPolicies,
        location: updatedLocation
      }
    };

  } catch (error) {
    console.error('[BUSINESS INFO] Error updating business info:', error);
    throw error;
  }
}

/**
 * Get formatted business hours string
 * @param {string} clientKey
 * @returns {Promise<string>}
 */
export async function getBusinessHoursString(clientKey) {
  try {
    const info = await getBusinessInfo(clientKey);
    const hours = info.hours;

    if (!hours || Object.keys(hours).length === 0) {
      return 'Our business hours are Monday to Friday, 9 AM to 5 PM.';
    }

    // Format hours nicely
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const formatted = [];

    if (hours.days && Array.isArray(hours.days)) {
      // Day-based format
      const dayNames = days.filter((_, i) => hours.days.includes(i + 1));
      const timeRange = `${hours.start || 9}:00 ${hours.end ? `to ${hours.end}:00` : 'AM'}`;
      return `We're open ${dayNames.join(', ')} from ${timeRange}.`;
    } else if (hours.monday || hours.tuesday) {
      // Day-specific format
      for (const day of days) {
        const dayKey = day.toLowerCase();
        if (hours[dayKey]) {
          formatted.push(`${day}: ${hours[dayKey]}`);
        }
      }
      return formatted.length > 0 
        ? `Our hours are:\n${formatted.join('\n')}`
        : 'Please call us for our current hours.';
    }

    return 'Please call us for our current hours.';

  } catch (error) {
    console.error('[BUSINESS INFO] Error getting hours string:', error);
    return 'Please call us for our current hours.';
  }
}

/**
 * Get services list
 * @param {string} clientKey
 * @returns {Promise<string>}
 */
export async function getServicesList(clientKey) {
  try {
    const info = await getBusinessInfo(clientKey);
    const services = info.services;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return 'We offer a variety of services. Please call us for more information.';
    }

    if (services.length === 1) {
      return `We offer ${services[0]}.`;
    }

    const servicesList = services.slice(0, -1).join(', ') + ', and ' + services[services.length - 1];
    return `We offer: ${servicesList}.`;

  } catch (error) {
    console.error('[BUSINESS INFO] Error getting services:', error);
    return 'We offer a variety of services. Please call us for more information.';
  }
}

/**
 * Answer a question using FAQ database
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function answerQuestion({ clientKey, question }) {
  try {
    if (!question || question.length < 3) {
      return {
        found: false,
        answer: null
      };
    }

    // Simple keyword matching (you can enhance with AI/NLP later)
    const lowerQuestion = question.toLowerCase();

    // Get all FAQs for this client
    const result = await query(`
      SELECT 
        question,
        answer,
        category,
        priority
      FROM business_faqs
      WHERE client_key = $1
      ORDER BY priority DESC, id ASC
    `, [clientKey]);

    // Simple keyword matching
    for (const faq of result.rows) {
      const keywords = faq.question.toLowerCase().split(/\s+/);
      const matchCount = keywords.filter(keyword => 
        lowerQuestion.includes(keyword) && keyword.length > 3
      ).length;

      // If 50% of keywords match, consider it a match
      if (matchCount >= keywords.length * 0.5 && keywords.length > 0) {
        return {
          found: true,
          answer: faq.answer,
          question: faq.question,
          category: faq.category
        };
      }
    }

    // Check common questions
    const commonAnswers = getCommonQuestionAnswers(lowerQuestion, clientKey);
    if (commonAnswers.found) {
      return commonAnswers;
    }

    return {
      found: false,
      answer: null
    };

  } catch (error) {
    console.error('[BUSINESS INFO] Error answering question:', error);
    return {
      found: false,
      answer: null
    };
  }
}

/**
 * Handle common questions
 * @param {string} question
 * @param {string} clientKey
 * @returns {Promise<Object>}
 */
async function getCommonQuestionAnswers(question, clientKey) {
  // Hours questions
  if (question.includes('hour') || question.includes('open') || question.includes('closed') || question.includes('when')) {
    const hours = await getBusinessHoursString(clientKey);
    return {
      found: true,
      answer: hours,
      category: 'hours'
    };
  }

  // Services questions
  if (question.includes('service') || question.includes('offer') || question.includes('do you')) {
    const services = await getServicesList(clientKey);
    return {
      found: true,
      answer: services,
      category: 'services'
    };
  }

  // Location questions
  if (question.includes('where') || question.includes('location') || question.includes('address')) {
    const info = await getBusinessInfo(clientKey);
    const location = info.location;
    
    if (location.address) {
      return {
        found: true,
        answer: `We're located at ${location.address}. ${location.instructions || ''}`,
        category: 'location'
      };
    }
  }

  // Price/cost questions
  if (question.includes('price') || question.includes('cost') || question.includes('how much')) {
    const info = await getBusinessInfo(clientKey);
    if (info.policies.pricing) {
      return {
        found: true,
        answer: info.policies.pricing,
        category: 'pricing'
      };
    }
  }

  // Cancellation policy
  if (question.includes('cancel') || question.includes('refund')) {
    const info = await getBusinessInfo(clientKey);
    if (info.policies.cancellation) {
      return {
        found: true,
        answer: info.policies.cancellation,
        category: 'policy'
      };
    }
  }

  return {
    found: false,
    answer: null
  };
}

/**
 * Add or update FAQ
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function upsertFAQ({
  clientKey,
  question,
  answer,
  category = null,
  priority = 0
}) {
  try {
    await query(`
      INSERT INTO business_faqs (
        client_key,
        question,
        answer,
        category,
        priority,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT DO NOTHING
    `, [clientKey, question, answer, category, priority]);

    // If no conflict, try update by question match
    await query(`
      UPDATE business_faqs
      SET 
        answer = $3,
        category = $4,
        priority = $5,
        updated_at = NOW()
      WHERE client_key = $1 AND LOWER(question) = LOWER($2)
    `, [clientKey, question, answer, category, priority]);

    console.log('[BUSINESS INFO] ✅ FAQ upserted:', { clientKey, question });

    return {
      success: true
    };

  } catch (error) {
    console.error('[BUSINESS INFO] Error upserting FAQ:', error);
    throw error;
  }
}

/**
 * Get default business info structure
 * @returns {Object}
 */
function getDefaultBusinessInfo() {
  return {
    hours: {
      start: 9,
      end: 17,
      days: [1, 2, 3, 4, 5] // Monday to Friday
    },
    services: [],
    policies: {},
    location: {}
  };
}




