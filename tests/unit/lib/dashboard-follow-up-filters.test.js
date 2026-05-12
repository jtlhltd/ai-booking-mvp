import { describe, expect, test } from '@jest/globals';

import {
  getDashboardCohortMeta,
  matchesDashboardCohort,
  normalizeDashboardCohortFilter,
} from '../../../lib/dashboard-follow-up-filters.js';

describe('lib/dashboard-follow-up-filters', () => {
  test('normalizeDashboardCohortFilter clamps unknown values to all', () => {
    expect(normalizeDashboardCohortFilter('sequence')).toBe('sequence');
    expect(normalizeDashboardCohortFilter('ABANDONED')).toBe('abandoned');
    expect(normalizeDashboardCohortFilter('STOPPED')).toBe('stopped');
    expect(normalizeDashboardCohortFilter('weird')).toBe('all');
  });

  test('without cutover, missing sequence artifact is classic and artifact is sequence', () => {
    expect(
      getDashboardCohortMeta({
        hasSequenceState: false,
        leadCreatedAt: '2026-05-01T09:00:00.000Z',
        tenantTimezone: 'Europe/London',
      }).cohort
    ).toBe('classic');

    expect(
      getDashboardCohortMeta({
        hasSequenceState: true,
        leadCreatedAt: '2026-05-01T09:00:00.000Z',
        tenantTimezone: 'Europe/London',
      }).cohort
    ).toBe('sequence');
  });

  test('with cutover, classic is before cutover and sequence is on/after cutover with artifact', () => {
    expect(
      getDashboardCohortMeta({
        hasSequenceState: false,
        leadCreatedAt: '2026-05-09T09:00:00.000Z',
        classicFollowUpCutoverDate: '2026-05-10',
        tenantTimezone: 'Europe/London',
      }).cohort
    ).toBe('classic');

    expect(
      getDashboardCohortMeta({
        hasSequenceState: true,
        leadCreatedAt: '2026-05-10T09:00:00.000Z',
        classicFollowUpCutoverDate: '2026-05-10',
        tenantTimezone: 'Europe/London',
      }).cohort
    ).toBe('sequence');

    expect(
      getDashboardCohortMeta({
        hasSequenceState: false,
        leadCreatedAt: '2026-05-10T09:00:00.000Z',
        classicFollowUpCutoverDate: '2026-05-10',
        tenantTimezone: 'Europe/London',
      }).cohort
    ).toBe('unclassified');
  });

  test('abandoned handoff source wins the abandoned cohort', () => {
    const meta = getDashboardCohortMeta({
      handoffSource: 'vapi_webhook.sequence_abandoned',
      hasSequenceState: true,
      leadCreatedAt: '2026-05-12T09:00:00.000Z',
      classicFollowUpCutoverDate: '2026-05-10',
      tenantTimezone: 'Europe/London',
    });
    expect(meta.cohort).toBe('abandoned');
    expect(matchesDashboardCohort(meta, 'abandoned')).toBe(true);
    expect(matchesDashboardCohort(meta, 'sequence')).toBe(false);
  });

  test('operator stop source lands in the stopped cohort', () => {
    const meta = getDashboardCohortMeta({
      handoffSource: 'operator.sequence_stopped',
      hasSequenceState: true,
      leadCreatedAt: '2026-05-12T09:00:00.000Z',
      classicFollowUpCutoverDate: '2026-05-10',
      tenantTimezone: 'Europe/London',
    });
    expect(meta.cohort).toBe('stopped');
    expect(matchesDashboardCohort(meta, 'stopped')).toBe(true);
    expect(matchesDashboardCohort(meta, 'abandoned')).toBe(false);
  });

  test('dismissed abandoned salvage leaves abandoned filter but stays in all', () => {
    const meta = getDashboardCohortMeta({
      handoffSource: 'vapi_webhook.sequence_abandoned',
      salvageDismissedAt: '2026-05-12T10:00:00.000Z',
      hasSequenceState: true,
      leadCreatedAt: '2026-05-12T09:00:00.000Z',
      tenantTimezone: 'Europe/London',
    });
    expect(meta.cohort).toBe('dismissed_abandoned');
    expect(matchesDashboardCohort(meta, 'abandoned')).toBe(false);
    expect(matchesDashboardCohort(meta, 'all')).toBe(true);
  });
});
