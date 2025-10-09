// lib/reviews-analysis.js
// Google Reviews pain point analysis for hyper-personalized outreach

/**
 * Analyze Google reviews to identify pain points and opportunities
 * @param {Array} reviews - Array of Google review objects
 * @returns {Object} - Analysis results with pain points and opportunities
 */
export function analyzeReviewsForPainPoints(reviews) {
  if (!reviews || reviews.length === 0) {
    return {
      painPoints: [],
      opportunities: [],
      sentiment: 'unknown',
      avgRating: 0,
      totalReviews: 0
    };
  }
  
  console.log(`[REVIEWS ANALYSIS] Analyzing ${reviews.length} reviews...`);
  
  const painPoints = new Set();
  const opportunities = new Set();
  let totalRating = 0;
  let negativeReviews = 0;
  let positiveReviews = 0;
  
  // Pain point patterns to detect
  const painPointPatterns = {
    booking_difficulty: {
      patterns: [
        /hard to book/i,
        /difficult to schedule/i,
        /couldn'?t get an appointment/i,
        /no one answers/i,
        /can'?t reach/i,
        /never picked up/i,
        /impossible to book/i,
        /phone always busy/i,
        /tried calling/i
      ],
      severity: 'high',
      pitch: "I noticed some reviews mention difficulty booking appointments. Our system automates this completely."
    },
    
    long_wait_times: {
      patterns: [
        /long wait/i,
        /waited forever/i,
        /slow service/i,
        /takes too long/i,
        /waiting room/i,
        /had to wait/i
      ],
      severity: 'medium',
      pitch: "Some reviews mention wait times. Our system optimizes scheduling to reduce waiting."
    },
    
    no_reminders: {
      patterns: [
        /forgot my appointment/i,
        /no reminder/i,
        /didn'?t remind/i,
        /wish they'?d reminded/i
      ],
      severity: 'medium',
      pitch: "We send automatic SMS reminders to reduce no-shows by 50%."
    },
    
    poor_communication: {
      patterns: [
        /poor communication/i,
        /didn'?t respond/i,
        /no follow.?up/i,
        /never heard back/i,
        /didn'?t call back/i
      ],
      severity: 'high',
      pitch: "Your reviews mention communication issues. Our system ensures every inquiry gets a response within minutes."
    },
    
    phone_system_issues: {
      patterns: [
        /phone system/i,
        /answering service/i,
        /voicemail/i,
        /left a message/i,
        /never called back/i
      ],
      severity: 'high',
      pitch: "We replace frustrating phone systems with AI that answers instantly, 24/7."
    },
    
    booking_system_missing: {
      patterns: [
        /need online booking/i,
        /wish they had online/i,
        /should have website booking/i,
        /can'?t book online/i
      ],
      severity: 'high',
      pitch: "Reviews suggest customers want online booking. Our system provides that instantly."
    },
    
    no_shows: {
      patterns: [
        /no.?show/i,
        /didn'?t show up/i,
        /missed appointment/i,
        /forgot to come/i
      ],
      severity: 'medium',
      pitch: "Our automated reminder system reduces no-shows by 50%."
    }
  };
  
  // Positive opportunity patterns
  const opportunityPatterns = {
    high_demand: {
      patterns: [
        /always busy/i,
        /fully booked/i,
        /hard to get in/i,
        /popular/i,
        /in demand/i
      ],
      pitch: "You're in high demand! Our system helps you handle more bookings efficiently."
    },
    
    growing: {
      patterns: [
        /getting better/i,
        /improving/i,
        /new management/i,
        /under new/i,
        /recently renovated/i
      ],
      pitch: "Great time to optimize! Our system scales with your growth."
    },
    
    great_service: {
      patterns: [
        /excellent service/i,
        /amazing/i,
        /fantastic/i,
        /highly recommend/i,
        /best in/i
      ],
      pitch: "Your service is great! Let's make booking as excellent as your service."
    }
  };
  
  // Analyze each review
  reviews.forEach(review => {
    const text = review.text || '';
    const rating = review.rating || 0;
    
    totalRating += rating;
    
    if (rating <= 2) negativeReviews++;
    if (rating >= 4) positiveReviews++;
    
    // Check for pain points
    Object.entries(painPointPatterns).forEach(([key, config]) => {
      if (config.patterns.some(pattern => pattern.test(text))) {
        painPoints.add(key);
      }
    });
    
    // Check for opportunities
    Object.entries(opportunityPatterns).forEach(([key, config]) => {
      if (config.patterns.some(pattern => pattern.test(text))) {
        opportunities.add(key);
      }
    });
  });
  
  const avgRating = reviews.length > 0 ? (totalRating / reviews.length) : 0;
  const sentiment = avgRating >= 4 ? 'positive' : avgRating >= 3 ? 'neutral' : 'negative';
  
  // Build pain point details
  const painPointDetails = Array.from(painPoints).map(key => ({
    type: key,
    severity: painPointPatterns[key].severity,
    pitch: painPointPatterns[key].pitch,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));
  
  // Build opportunity details
  const opportunityDetails = Array.from(opportunities).map(key => ({
    type: key,
    pitch: opportunityPatterns[key].pitch,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));
  
  console.log(`[REVIEWS ANALYSIS] Found ${painPointDetails.length} pain points, ${opportunityDetails.length} opportunities`);
  
  return {
    painPoints: painPointDetails,
    opportunities: opportunityDetails,
    sentiment,
    avgRating: avgRating.toFixed(1),
    totalReviews: reviews.length,
    negativeReviews,
    positiveReviews,
    reviewsAnalyzed: true
  };
}

/**
 * Generate personalized pitch based on review analysis
 * @param {Object} analysis - Review analysis results
 * @param {Object} business - Business details
 * @returns {string} - Personalized pitch
 */
export function generatePersonalizedPitch(analysis, business) {
  if (!analysis.reviewsAnalyzed || analysis.painPoints.length === 0) {
    // Generic pitch if no pain points found
    return `We help businesses like ${business.name} automate their booking process and get 30% more appointments.`;
  }
  
  // Use top pain point for pitch
  const topPainPoint = analysis.painPoints
    .sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })[0];
  
  return `Hi, I'm calling ${business.name}. ${topPainPoint.pitch} Would you like to see how it works?`;
}

/**
 * Calculate review score (0-100) for lead prioritization
 * @param {Object} analysis - Review analysis results
 * @returns {number} - Score from 0-100
 */
export function calculateReviewScore(analysis) {
  let score = 50; // Start at 50
  
  // High pain points = more opportunity
  score += analysis.painPoints.filter(p => p.severity === 'high').length * 15;
  score += analysis.painPoints.filter(p => p.severity === 'medium').length * 10;
  
  // Positive opportunities
  score += analysis.opportunities.length * 5;
  
  // Good rating but has pain points = ideal prospect
  if (analysis.avgRating >= 4 && analysis.painPoints.length > 0) {
    score += 10; // Good business with fixable problems
  }
  
  // Too many negative reviews = risky prospect
  if (analysis.negativeReviews > analysis.totalReviews * 0.5) {
    score -= 20; // Might be a problem client
  }
  
  // Not enough reviews = harder to convert
  if (analysis.totalReviews < 5) {
    score -= 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

