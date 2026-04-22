import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const findSlots = jest.fn(async () => []);
jest.unstable_mockModule('../../../gcal.js', () => ({
  findSlots
}));

describe('slots invariants', () => {
  beforeEach(() => {
    jest.resetModules();
    findSlots.mockClear();
  });

  test('getTop3 uses service durationMin with fallbacks and passes timezone', async () => {
    findSlots.mockResolvedValueOnce([1, 2, 3, 4, 5]);
    const slots = await import('../../../lib/slots.js');

    const tenant = {
      calendarId: 'cal_1',
      timezone: 'Europe/London',
      booking: { defaultDurationMin: 45 },
      serviceMap: { haircut: { durationMin: 60 } }
    };

    const out = await slots.getTop3({ tenant, service: 'haircut' });
    expect(out).toEqual([1, 2, 3]);

    expect(findSlots).toHaveBeenCalledWith({
      calendarId: 'cal_1',
      durationMin: 60,
      timezone: 'Europe/London'
    });
  });

  test('getTop3 falls back to tenant.booking.defaultDurationMin then 30', async () => {
    const slots = await import('../../../lib/slots.js');

    const tenant = {
      calendarId: 'cal_1',
      timezone: 'Europe/London',
      booking: { defaultDurationMin: 40 },
      serviceMap: {}
    };

    await slots.getTop3({ tenant, service: 'unknown' });
    expect(findSlots).toHaveBeenCalledWith({
      calendarId: 'cal_1',
      durationMin: 40,
      timezone: 'Europe/London'
    });

    findSlots.mockClear();
    const tenant2 = { calendarId: 'cal_2', timezone: 'Europe/London', serviceMap: {}, booking: {} };
    await slots.getTop3({ tenant: tenant2, service: 'unknown' });
    expect(findSlots).toHaveBeenCalledWith({
      calendarId: 'cal_2',
      durationMin: 30,
      timezone: 'Europe/London'
    });
  });
});

