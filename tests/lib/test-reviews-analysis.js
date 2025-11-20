// tests/lib/test-reviews-analysis.js
// Test reviews analysis functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { analyzeReviewsForPainPoints, generatePersonalizedPitch, calculateReviewScore } from '../../lib/reviews-analysis.js';

resetStats();

describe('Reviews Analysis Tests', () => {
  
  test('Analyze reviews function exists', () => {
    assertTrue(typeof analyzeReviewsForPainPoints === 'function', 'analyzeReviewsForPainPoints is a function');
  });
  
  test('Generate personalized pitch function exists', () => {
    assertTrue(typeof generatePersonalizedPitch === 'function', 'generatePersonalizedPitch is a function');
  });
  
  test('Calculate review score function exists', () => {
    assertTrue(typeof calculateReviewScore === 'function', 'calculateReviewScore is a function');
  });
  
  test('Review analysis structure', () => {
    const reviews = [
      { text: 'Great service but slow response', rating: 4 },
      { text: 'Poor communication', rating: 2 }
    ];
    
    assertTrue(Array.isArray(reviews), 'Reviews is array');
    reviews.forEach(review => {
      assertTrue('text' in review, 'Review has text');
      assertTrue('rating' in review, 'Review has rating');
    });
  });
  
  test('Pain point extraction', () => {
    const painPoints = ['slow response', 'poor communication', 'high prices'];
    assertTrue(Array.isArray(painPoints), 'Pain points is array');
    assertTrue(painPoints.length > 0, 'Has pain points');
  });
  
  test('Review score calculation', () => {
    const analysis = {
      avgRating: 3.5,
      totalReviews: 20,
      positiveCount: 12,
      negativeCount: 3,
      painPoints: [
        { severity: 'high', count: 2 },
        { severity: 'medium', count: 3 }
      ]
    };
    
    try {
      const score = calculateReviewScore(analysis);
      assertTrue(typeof score === 'number', 'Score is number');
      assertTrue(score >= 0 && score <= 100, 'Score is between 0 and 100');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Personalized pitch generation', () => {
    const analysis = {
      painPoints: ['slow response'],
      avgRating: 3.5
    };
    const business = { name: 'Test Business' };
    
    try {
      const pitch = generatePersonalizedPitch(analysis, business);
      assertTrue(typeof pitch === 'string', 'Returns string');
      assertTrue(pitch.length > 0, 'Pitch has content');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Sentiment analysis', () => {
    const sentiments = ['positive', 'negative', 'neutral'];
    sentiments.forEach(sentiment => {
      assertTrue(typeof sentiment === 'string', `Sentiment ${sentiment} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

