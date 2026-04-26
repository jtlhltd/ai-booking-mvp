import { describe, expect, test } from '@jest/globals';
import { isAnsweredHeuristic } from '../../../lib/call-outcome-heuristics.js';

describe('call-outcome-heuristics', () => {
  test('positive outcomes count as answered', () => {
    expect(isAnsweredHeuristic({ outcome: 'booked' })).toBe(true);
    expect(isAnsweredHeuristic({ outcome: 'INTERESTED' })).toBe(true);
  });

  test('no-pickup outcomes are not answered', () => {
    expect(isAnsweredHeuristic({ outcome: 'no-answer' })).toBe(false);
    expect(isAnsweredHeuristic({ outcome: 'voicemail' })).toBe(false);
  });

  test('duration + status heuristics', () => {
    expect(isAnsweredHeuristic({ outcome: '', status: 'ended', duration: 25 })).toBe(true);
    expect(isAnsweredHeuristic({ outcome: '', status: 'ringing', duration: 45 })).toBe(true);
    expect(isAnsweredHeuristic({ outcome: '', status: 'ended', duration: 5 })).toBe(false);
  });

  test('transcript or recording implies answered when outcome unknown', () => {
    expect(isAnsweredHeuristic({ transcript: 'x'.repeat(50) })).toBe(true);
    expect(isAnsweredHeuristic({ recordingUrl: 'https://x' })).toBe(true);
  });
});
