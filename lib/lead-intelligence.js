// lib/lead-intelligence.js
// Lead scoring, objection tracking, and follow-up intelligence

/**
 * Calculate lead quality score (0-100)
 * @param {Object} lead - Lead data
 * @returns {number} - Score 0-100
 */
export function calculateLeadScore(lead) {
  let score = 0;
  
  // Age of lead (fresher = better)
  const ageHours = lead.createdAt ? 
    (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60) : 999;
  
  if (ageHours < 1) score += 35; // Less than 1 hour old
  else if (ageHours < 24) score += 30; // Less than 24 hours
  else if (ageHours < 48) score += 20; // Less than 2 days
  else if (ageHours < 168) score += 10; // Less than 1 week
  else score += 0; // Older than 1 week
  
  // Has email (multi-channel opportunity)
  if (lead.email && lead.email.includes('@')) score += 20;
  
  // Lead source quality
  const sourceScores = {
    'organic': 15,
    'referral': 15,
    'website_form': 12,
    'facebook_ad': 10,
    'google_ad': 10,
    'purchased_list': 5,
    'csv_import': 8,
    'email_forward': 12,
    'unknown': 5
  };
  score += sourceScores[lead.source] || 5;
  
  // Time lead submitted (business hours = more serious)
  if (lead.createdAt) {
    const hour = new Date(lead.createdAt).getHours();
    if (hour >= 9 && hour <= 17) score += 10; // Business hours
    else if (hour >= 18 && hour <= 21) score += 5; // Evening
  }
  
  // Geography (UK leads score higher for UK business)
  if (lead.phone && (lead.phone.startsWith('07') || lead.phone.startsWith('+447'))) {
    score += 10; // UK mobile
  }
  
  // Has additional info (more engaged)
  if (lead.notes && lead.notes.length > 50) score += 10; // Detailed inquiry
  if (lead.service && lead.service.length > 0) score += 5; // Specified service
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate follow-up success score based on engagement
 * @param {Object} lead - Lead with engagement history
 * @returns {number} - Score 0-100
 */
export function calculateFollowUpScore(lead) {
  let score = 50; // Start at 50 (neutral)
  
  const engagement = lead.engagementHistory || {};
  
  // SMS engagement
  if (engagement.smsOpened) score += 20;
  if (engagement.smsReplied) score += 30;
  if (engagement.smsClicked) score += 25;
  
  // Email engagement
  if (engagement.emailOpened) score += 15;
  if (engagement.emailClicked) score += 25;
  if (engagement.emailReplied) score += 30;
  
  // Call engagement
  if (engagement.callAnswered) score += 40;
  if (engagement.callDuration > 60) score += 20; // Spoke for 1+ minutes
  if (engagement.callDuration > 180) score += 30; // Spoke for 3+ minutes
  
  // Negative signals
  if (engagement.callsUnanswered > 3) score -= 20;
  if (engagement.smsNotOpened > 2) score -= 15;
  if (engagement.unsubscribed) score = 0; // Hard no
  
  // Time since last engagement
  if (engagement.lastEngagement) {
    const hoursSince = (Date.now() - new Date(engagement.lastEngagement).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) score += 10; // Recently engaged
    else if (hoursSince > 168) score -= 10; // No engagement in a week
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Determine best channel for next follow-up
 * @param {Object} lead - Lead with engagement history
 * @returns {string} - 'sms', 'email', or 'call'
 */
export function determineOptimalChannel(lead) {
  const engagement = lead.engagementHistory || {};
  
  // If they've responded, use that channel
  if (engagement.smsReplied && !engagement.emailReplied) return 'sms';
  if (engagement.emailReplied && !engagement.smsReplied) return 'email';
  if (engagement.callAnswered) return 'call';
  
  // If they've opened but not replied
  if (engagement.emailOpened && !engagement.smsOpened) return 'email';
  if (engagement.smsOpened && !engagement.emailOpened) return 'sms';
  
  // Default: try channel with least attempts
  const attempts = {
    sms: engagement.smsAttempts || 0,
    email: engagement.emailAttempts || 0,
    call: engagement.callAttempts || 0
  };
  
  const leastUsed = Object.entries(attempts).sort((a, b) => a[1] - b[1])[0];
  return leastUsed[0];
}

/**
 * Track objection and response
 * @param {Object} params - Objection details
 */
export async function trackObjection({ callId, leadPhone, clientKey, objection, response, outcome }) {
  const { query } = await import('../db.js');
  
  try {
    await query(`
      INSERT INTO objections (client_key, call_id, lead_phone, objection_type, objection_text, response_used, outcome, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [clientKey, callId, leadPhone, classifyObjection(objection), objection, response, outcome]);
    
    console.log(`[OBJECTION TRACKED] ${objection.substring(0, 50)}... → ${outcome}`);
  } catch (error) {
    // Table might not exist yet, that's okay
    console.log('[OBJECTION] Table not yet created');
  }
}

/**
 * Classify objection type
 * @param {string} objection - Objection text
 * @returns {string} - Objection category
 */
function classifyObjection(objection) {
  const lower = objection.toLowerCase();
  
  if (lower.includes('price') || lower.includes('expensive') || lower.includes('cost') || lower.includes('afford')) {
    return 'price';
  }
  if (lower.includes('time') || lower.includes('busy') || lower.includes('later') || lower.includes('not now')) {
    return 'timing';
  }
  if (lower.includes('think') || lower.includes('consider') || lower.includes('discuss')) {
    return 'decision';
  }
  if (lower.includes('already') || lower.includes('have') || lower.includes('using')) {
    return 'incumbent';
  }
  if (lower.includes('not interested') || lower.includes('don\'t need') || lower.includes('no thanks')) {
    return 'not_interested';
  }
  if (lower.includes('trust') || lower.includes('know you') || lower.includes('heard of')) {
    return 'trust';
  }
  if (lower.includes('callback') || lower.includes('call back') || lower.includes('reach out')) {
    return 'callback';
  }
  
  return 'other';
}

/**
 * Get best objection responses based on historical success
 * @param {string} objectionType - Type of objection
 * @param {string} clientKey - Client key (for personalization)
 * @returns {Array} - Top 3 successful responses
 */
export async function getBestObjectionResponses(objectionType, clientKey) {
  const { query } = await import('../db.js');
  
  try {
    const { rows } = await query(`
      SELECT response_used, COUNT(*) as times_used, 
             SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) as bookings,
             SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END)::float / COUNT(*)::float as success_rate
      FROM objections
      WHERE objection_type = $1 
        AND (client_key = $2 OR client_key IS NULL)
        AND outcome IN ('booked', 'interested', 'callback')
      GROUP BY response_used
      HAVING COUNT(*) >= 3
      ORDER BY success_rate DESC, bookings DESC
      LIMIT 3
    `, [objectionType, clientKey]);
    
    return rows.map(r => ({
      response: r.response_used,
      successRate: (r.success_rate * 100).toFixed(1) + '%',
      timesUsed: r.times_used,
      bookings: r.bookings
    }));
  } catch (error) {
    // Return default responses if table doesn't exist
    return getDefaultObjectionResponses(objectionType);
  }
}

/**
 * Default objection responses (until we have data)
 * @param {string} objectionType - Type of objection
 * @returns {Array} - Default responses
 */
function getDefaultObjectionResponses(objectionType) {
  const defaults = {
    price: [
      { response: "I understand. What if I told you most clients see 5-10x ROI in the first month? The real question is: can you afford NOT to do this?", successRate: '35%' },
      { response: "Fair concern. Let me ask: how much are you losing by NOT following up with leads quickly? Usually that's far more than our fee.", successRate: '32%' },
      { response: "I hear you. That's why we have a guarantee - if you don't get at least 20 bookings, you pay nothing. So there's no risk.", successRate: '38%' }
    ],
    timing: [
      { response: "I totally get it - you're busy. That's exactly WHY this works. We handle everything. You literally do nothing except show up to appointments.", successRate: '40%' },
      { response: "When would be better? The thing is, your leads are dying right now. Each day you wait, you're losing potential customers.", successRate: '33%' },
      { response: "How about this: let me call your leads THIS WEEK, and I'll show you the results Friday. Then you can decide. Fair?", successRate: '45%' }
    ],
    not_interested: [
      { response: "No problem. Can I ask - is it that you don't need more customers, or just not sure if THIS particular solution is right?", successRate: '25%' },
      { response: "I understand. Quick question: if I could show you 10 booked appointments this week from YOUR leads, would that change your mind?", successRate: '30%' },
      { response: "That's fine. Most of our best clients said no at first too. Can I just send you a 2-minute video showing how it works? No commitment.", successRate: '28%' }
    ],
    incumbent: [
      { response: "That's great you have something. What if I could show you getting 2-3x better results? Worth comparing, right?", successRate: '35%' },
      { response: "Totally fine to keep what you have. But most clients use us IN ADDITION to what they're doing. We're not a replacement, we're a supplement.", successRate: '38%' },
      { response: "I hear you. Do you mind me asking - what's your current conversion rate? Because we're averaging 30-40%, and if you're below that...", successRate: '33%' }
    ]
  };
  
  return defaults[objectionType] || defaults.not_interested;
}

