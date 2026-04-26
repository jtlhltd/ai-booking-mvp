import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.BASE_URL;
});

describe('lib/follow-up-sequences', () => {
  test('getFollowUpSequence maps outcomes', async () => {
    const { getFollowUpSequence } = await import('../../../lib/follow-up-sequences.js');
    expect(getFollowUpSequence('no-answer').name).toMatch(/No Answer/i);
    expect(getFollowUpSequence('voicemail').name).toMatch(/Voicemail/i);
    expect(getFollowUpSequence('declined').name).toMatch(/Not Interested/i);
  });

  test('scheduleFollowUps returns [] when opted out or already booked', async () => {
    jest.unstable_mockModule('../../../lib/lead-deduplication.js', () => ({
      isOptedOut: jest.fn(async () => true),
    }));
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({ displayName: 'Acme', timezone: 'UTC' })),
      query: jest.fn(async () => ({ rows: [{ count: 0 }] })),
      cancelPendingFollowUps: jest.fn(async () => {}),
      addToRetryQueue: jest.fn(async () => {}),
    }));

    const { scheduleFollowUps } = await import('../../../lib/follow-up-sequences.js');
    const out = await scheduleFollowUps({
      clientKey: 'c1',
      leadPhone: '+1',
      leadName: 'L',
      outcome: 'interested',
      callId: 'call1',
    });
    expect(out).toEqual([]);

    // Not opted out; booked => []
    jest.resetModules();
    jest.unstable_mockModule('../../../lib/lead-deduplication.js', () => ({
      isOptedOut: jest.fn(async () => false),
    }));
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({ displayName: 'Acme', timezone: 'UTC' })),
      query: jest.fn(async () => ({ rows: [{ count: 1 }] })),
      cancelPendingFollowUps: jest.fn(async () => {}),
      addToRetryQueue: jest.fn(async () => {}),
    }));
    const { scheduleFollowUps: schedule2 } = await import('../../../lib/follow-up-sequences.js');
    const out2 = await schedule2({ clientKey: 'c1', leadPhone: '+1', outcome: 'interested', callId: 'call1' });
    expect(out2).toEqual([]);
  });

  test('scheduleFollowUps same_week_weekdays schedules retry queue calls', async () => {
    const addToRetryQueue = jest.fn(async () => {});
    jest.unstable_mockModule('../../../lib/lead-deduplication.js', () => ({
      isOptedOut: jest.fn(async () => false),
    }));
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({ displayName: 'Acme', timezone: 'UTC', booking: { timezone: 'UTC' } })),
      query: jest.fn(async () => ({ rows: [{ count: 0 }] })),
      cancelPendingFollowUps: jest.fn(async () => {}),
      addToRetryQueue,
    }));
    jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
      computeSameWeekWeekdayFollowUpSlots: () => [
        new Date('2026-01-01T10:00:00.000Z'),
        new Date('2026-01-02T10:00:00.000Z'),
      ],
    }));

    const { scheduleFollowUps } = await import('../../../lib/follow-up-sequences.js');
    const out = await scheduleFollowUps({
      clientKey: 'c1',
      leadPhone: '+1',
      leadName: 'L',
      outcome: 'no_answer',
      callId: 'call1',
    });
    expect(out).toHaveLength(2);
    expect(addToRetryQueue).toHaveBeenCalledTimes(2);
  });
});

