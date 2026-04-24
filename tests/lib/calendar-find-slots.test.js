import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleCalendarFindSlots } from '../../lib/calendar-find-slots.js';

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('lib/calendar-find-slots', () => {
  let nowSpy;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    nowSpy?.mockRestore();
  });

  test('400 when tenant missing', async () => {
    const req = { body: {}, get: () => null };
    const res = mockRes();

    await handleCalendarFindSlots(req, res, {
      getClientFromHeader: async () => null,
      getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'Unknown tenant (missing X-Client-Key)' });
  });

  test('400 when Google creds missing', async () => {
    const req = { body: {}, get: () => 'c1' };
    const res = mockRes();

    await handleCalendarFindSlots(req, res, {
      getClientFromHeader: async () => ({ clientKey: 'c1', booking: { timezone: 'UTC' } }),
      pickTimezone: () => 'UTC',
      pickCalendarId: () => 'cal',
      getGoogleCredentials: () => ({ clientEmail: null, privateKey: null, privateKeyB64: null }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'Google env missing' });
  });

  test('returns up to 30 slots within business hours when calendar is free', async () => {
    const req = { body: { service: 's1', stepMinutes: 60 }, get: () => 'c1' };
    const res = mockRes();

    const client = {
      clientKey: 'c1',
      booking: {
        timezone: 'UTC',
        hours: { thu: ['09:00-11:00'] },
        minNoticeMin: 0,
        maxAdvanceDays: 1,
        defaultDurationMin: 60,
      },
      services: [{ id: 's1', durationMin: 60, bufferMin: 0, slotStepMin: 60 }],
      calendarId: 'cal',
    };

    const authorize = jest.fn(async () => {});
    const freeBusy = jest.fn(async () => []);

    await handleCalendarFindSlots(req, res, {
      getClientFromHeader: async () => client,
      pickTimezone: (c) => c.booking.timezone,
      pickCalendarId: (c) => c.calendarId,
      getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
      makeJwtAuth: () => ({ authorize }),
      freeBusy,
      now: () => Date.now(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.slots)).toBe(true);
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.slots.length).toBeLessThanOrEqual(30);
    expect(res.body.params).toEqual({ durationMin: 60, bufferMin: 0, stepMinutes: 60 });
    expect(authorize).toHaveBeenCalled();
    expect(freeBusy).toHaveBeenCalled();
  });

  test('excludes slots that overlap busy blocks', async () => {
    const req = { body: { service: 's1', stepMinutes: 60 }, get: () => 'c1' };
    const res = mockRes();

    const client = {
      clientKey: 'c1',
      booking: {
        timezone: 'UTC',
        hours: { thu: ['09:00-12:00'] },
        minNoticeMin: 0,
        maxAdvanceDays: 1,
        defaultDurationMin: 60,
      },
      services: [{ id: 's1', durationMin: 60, bufferMin: 0, slotStepMin: 60 }],
      calendarId: 'cal',
    };

    const authorize = jest.fn(async () => {});
    const busy = [
      { start: '2026-01-01T09:00:00.000Z', end: '2026-01-01T10:00:00.000Z' },
    ];

    await handleCalendarFindSlots(req, res, {
      getClientFromHeader: async () => client,
      pickTimezone: (c) => c.booking.timezone,
      pickCalendarId: (c) => c.calendarId,
      getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
      makeJwtAuth: () => ({ authorize }),
      freeBusy: async () => busy,
      now: () => Date.now(),
    });

    const starts = res.body.slots.map((s) => s.start);
    expect(starts).not.toContain('2026-01-01T09:00:00.000Z');
  });
});

