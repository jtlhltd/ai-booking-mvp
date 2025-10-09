// lib/call-quality-analysis.js
// AI Call Quality Analysis - Sentiment, Objections, and Scoring

/**
 * Analyze sentiment from call transcript
 * @param {string} transcript - Full call transcript
 * @returns {string} - 'positive', 'neutral', 'negative', or 'unknown'
 */
export function analyzeSentiment(transcript) {
  if (!transcript || transcript.length < 10) return 'unknown';
  
  const positive = [
    /\b(interested|yes|great|perfect|sounds good|let'?s do it|absolutely|definitely|amazing)\b/gi,
    /\b(love it|excited|fantastic|wonderful|excellent|awesome|brilliant)\b/gi,
    /\b(thank you|thanks|appreciate|helpful|useful)\b/gi
  ];
  
  const negative = [
    /\b(not interested|no thanks|remove|stop|busy|don'?t call|never call)\b/gi,
    /\b(annoyed|frustrated|waste of time|too expensive|can'?t afford|scam)\b/gi,
    /\b(spam|suspicious|harass|bother|leave me alone)\b/gi
  ];
  
  const positiveMatches = positive.reduce((sum, regex) => {
    return sum + (transcript.match(regex) || []).length;
  }, 0);
  
  const negativeMatches = negative.reduce((sum, regex) => {
    return sum + (transcript.match(regex) || []).length;
  }, 0);
  
  // Need at least 2 matches to be confident
  if (positiveMatches > negativeMatches && positiveMatches >= 2) return 'positive';
  if (negativeMatches > positiveMatches && negativeMatches >= 2) return 'negative';
  if (positiveMatches >= 1 && negativeMatches === 0) return 'positive';
  if (negativeMatches >= 1 && positiveMatches === 0) return 'negative';
  
  return 'neutral';
}

/**
 * Extract objections from call transcript
 * @param {string} transcript - Full call transcript
 * @returns {Array<string>} - Array of objection types
 */
export function extractObjections(transcript) {
  if (!transcript) return [];
  
  const objectionPatterns = {
    price: /\b(too expensive|cost|price|afford|budget|cheap|pricey|expensive)\b/gi,
    timing: /\b(not now|later|busy|bad time|call back|next week|next month|not ready)\b/gi,
    incumbent: /\b(already have|current provider|happy with|satisfied with|existing)\b/gi,
    no_need: /\b(don'?t need|not necessary|no use|irrelevant|not looking)\b/gi,
    trust: /\b(scam|spam|suspicious|trust|legitimate|real|verify)\b/gi,
    decision_maker: /\b(need to ask|check with|not my decision|boss|manager|owner)\b/gi,
    features: /\b(missing|lack|doesn'?t have|need more|not enough|limited)\b/gi,
    competition: /\b(competitor|alternative|other option|comparison|versus)\b/gi
  };
  
  const objections = [];
  for (const [type, pattern] of Object.entries(objectionPatterns)) {
    if (pattern.test(transcript)) {
      objections.push(type);
    }
  }
  
  return objections;
}

/**
 * Extract key phrases from call transcript
 * @param {string} transcript - Full call transcript
 * @returns {Array<string>} - Array of key phrases found
 */
export function extractKeyPhrases(transcript) {
  if (!transcript) return [];
  
  const phrasePatterns = [
    /\b(interested in|want to know|tell me more|sounds interesting|curious about)\b/gi,
    /\b(call back later|reach out again|try again|contact me|get back to)\b/gi,
    /\b(send information|email me|more details|website|link)\b/gi,
    /\b(book|appointment|meeting|schedule|demo|consultation)\b/gi,
    /\b(price|pricing|cost|how much|rates|fees)\b/gi,
    /\b(trial|test|try it out|see how it works|demo)\b/gi,
    /\b(features|capabilities|functionality|what can it do)\b/gi,
    /\b(testimonial|review|reference|case study|example)\b/gi
  ];
  
  const phrases = new Set();
  for (const pattern of phrasePatterns) {
    const matches = transcript.match(pattern) || [];
    matches.forEach(match => phrases.add(match.toLowerCase().trim()));
  }
  
  return Array.from(phrases).slice(0, 10); // Limit to top 10
}

/**
 * Calculate overall call quality score (1-10)
 * @param {Object} callData - Call data including outcome, duration, transcript, etc.
 * @returns {number} - Quality score from 1-10
 */
export function calculateQualityScore(callData) {
  const {
    outcome,
    duration = 0,
    transcript = '',
    sentiment,
    metrics = {}
  } = callData;
  
  let score = 5; // Start at baseline 5/10
  
  // 1. Outcome scoring (most important - worth up to +/-4 points)
  if (outcome === 'booked' || outcome === 'booking') {
    score += 4; // Best possible outcome
  } else if (outcome === 'interested') {
    score += 2; // Very good outcome
  } else if (outcome === 'callback_requested' || outcome === 'follow_up') {
    score += 1; // Neutral outcome - didn't close but kept door open
  } else if (outcome === 'not_interested' || outcome === 'declined') {
    score -= 2; // Poor outcome but got an answer
  } else if (outcome === 'no-answer' || outcome === 'no_answer' || outcome === 'voicemail') {
    score -= 3; // Didn't connect
  } else if (outcome === 'busy' || outcome === 'failed') {
    score -= 3; // Technical failure
  }
  
  // 2. Duration scoring (sweet spot: 1-5 minutes = +/-2 points)
  if (duration >= 60 && duration <= 300) {
    score += 1; // Good conversation length
  } else if (duration < 30 && outcome !== 'no-answer') {
    score -= 2; // Hung up too quickly (bad sign)
  } else if (duration > 600) {
    score -= 1; // Too long (inefficient, possible confusion)
  }
  
  // 3. Sentiment scoring (+/-2 points)
  if (sentiment === 'positive') {
    score += 2;
  } else if (sentiment === 'negative') {
    score -= 2;
  }
  
  // 4. Engagement metrics (if available, +/-1 point each)
  if (metrics.talk_time_ratio !== undefined) {
    // Ideal: prospect talks 60-70% of the time
    if (metrics.talk_time_ratio >= 0.60 && metrics.talk_time_ratio <= 0.70) {
      score += 1; // Great engagement
    } else if (metrics.talk_time_ratio < 0.30) {
      score -= 1; // AI talking too much (monologue)
    }
  }
  
  if (metrics.interruptions !== undefined) {
    if (metrics.interruptions <= 2) {
      score += 1; // Natural, flowing conversation
    } else if (metrics.interruptions > 5) {
      score -= 1; // Too many interruptions (awkward)
    }
  }
  
  if (metrics.response_time_avg !== undefined) {
    if (metrics.response_time_avg <= 1.5) {
      score += 1; // Fast, natural responses
    } else if (metrics.response_time_avg > 3) {
      score -= 1; // Slow responses (poor experience)
    }
  }
  
  // 5. Transcript quality bonus (+1 if substantial conversation)
  if (transcript && transcript.length > 200) {
    score += 1; // Had a real conversation (not just "not interested, bye")
  }
  
  // Clamp score between 1-10
  return Math.max(1, Math.min(10, Math.round(score)));
}

/**
 * Analyze complete call and return all quality metrics
 * @param {Object} callData - Call data from Vapi webhook
 * @returns {Object} - Analysis results
 */
export function analyzeCall(callData) {
  const transcript = callData.transcript || callData.summary || '';
  const sentiment = analyzeSentiment(transcript);
  const objections = extractObjections(transcript);
  const keyPhrases = extractKeyPhrases(transcript);
  const qualityScore = calculateQualityScore({
    ...callData,
    sentiment,
    transcript
  });
  
  return {
    sentiment,
    objections,
    keyPhrases,
    qualityScore,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Get human-readable quality rating
 * @param {number} score - Quality score (1-10)
 * @returns {Object} - Rating info
 */
export function getQualityRating(score) {
  if (score >= 9) return { rating: 'Excellent', emoji: '🌟', color: '#28a745' };
  if (score >= 7) return { rating: 'Good', emoji: '👍', color: '#28a745' };
  if (score >= 5) return { rating: 'Average', emoji: '😐', color: '#ffc107' };
  if (score >= 3) return { rating: 'Poor', emoji: '👎', color: '#fd7e14' };
  return { rating: 'Very Poor', emoji: '😞', color: '#dc3545' };
}

