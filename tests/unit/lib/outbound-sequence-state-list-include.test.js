import { describe, expect, test } from '@jest/globals';
import { shouldIncludeLeadInSequenceStateList } from '../../../lib/outbound-sequence-state-list-include.js';

describe('shouldIncludeLeadInSequenceStateList', () => {
  test('includes opted-in leads regardless of terminal status', () => {
    expect(shouldIncludeLeadInSequenceStateList({ sequenceOptedIn: true, status: 'abandoned' })).toBe(true);
  });

  test('includes active sequence rows even if opt-in flag is stale', () => {
    expect(shouldIncludeLeadInSequenceStateList({ sequenceOptedIn: false, status: 'active' })).toBe(true);
  });

  test('excludes terminal rows when not opted in', () => {
    expect(shouldIncludeLeadInSequenceStateList({ sequenceOptedIn: false, status: 'abandoned' })).toBe(false);
    expect(shouldIncludeLeadInSequenceStateList({ sequenceOptedIn: false, status: 'completed' })).toBe(false);
  });
});
