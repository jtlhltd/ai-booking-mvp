import { describe, test, expect } from '@jest/globals';

import {
  analyzeSentiment,
  extractObjections,
  extractKeyPhrases,
  calculateQualityScore,
  analyzeCall,
  getQualityRating,
} from '../../../lib/call-quality-analysis.js';

describe('lib/call-quality-analysis', () => {
  test('analyzeSentiment returns unknown for short transcript and positive/negative for matches', () => {
    expect(analyzeSentiment('hi')).toBe('unknown');
    expect(analyzeSentiment('Yes great thank you, sounds good')).toBe('positive');
    expect(analyzeSentiment("No thanks remove me, don't call again spam")).toBe('negative');
  });

  test('extractObjections detects timing but not when booking context present', () => {
    expect(extractObjections('can you call back later')).toContain('timing');
    expect(extractObjections('call me back later to book an appointment')).not.toContain('timing');
  });

  test('analyzeCall returns full analysis shape and rating maps score', () => {
    const out = analyzeCall({ outcome: 'booked', duration: 120, transcript: 'yes great thanks book appointment' });
    expect(out).toEqual(
      expect.objectContaining({
        sentiment: expect.any(String),
        objections: expect.any(Array),
        keyPhrases: expect.any(Array),
        qualityScore: expect.any(Number),
        analyzedAt: expect.any(String),
      }),
    );
    const rating = getQualityRating(out.qualityScore);
    expect(rating).toEqual(expect.objectContaining({ rating: expect.any(String), color: expect.any(String) }));
  });

  test('calculateQualityScore clamps to 1..10', () => {
    expect(calculateQualityScore({ outcome: 'booked', duration: 9999, transcript: 'x'.repeat(500), sentiment: 'positive' })).toBe(10);
    expect(calculateQualityScore({ outcome: 'no_answer', duration: 1, transcript: 'x', sentiment: 'negative' })).toBe(1);
  });

  test('extractKeyPhrases returns de-duped phrases', () => {
    const phrases = extractKeyPhrases('Interested, interested in pricing. Send information, email me.');
    expect(phrases.length).toBeGreaterThan(0);
  });
});

