import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const assertFree = jest.fn(async () => {});
const createEvent = jest.fn(async () => ({ id: 'evt_1' }));
jest.unstable_mockModule('../../../gcal.js', () => ({
  assertFree,
  createEvent
}));

const getTenant = jest.fn(async () => ({ calendarId: 'cal_1' }));
const findExistingBooking = jest.fn(async () => null);
const markBooked = jest.fn(async () => {});
jest.unstable_mockModule('../../../db.js', () => ({
  getTenant,
  findExistingBooking,
  markBooked
}));

const confirmations = jest.fn(async () => {});
jest.unstable_mockModule('../../../lib/notify.js', () => ({
  confirmations
}));

describe('booking invariants', () => {
  beforeEach(() => {
    jest.resetModules();
    assertFree.mockClear();
    createEvent.mockClear();
    getTenant.mockClear();
    findExistingBooking.mockClear();
    markBooked.mockClear();
    confirmations.mockClear();
  });

  test('handleVapiBooking rejects payloads missing required fields', async () => {
    const booking = await import('../../../lib/booking.js');
    await expect(booking.handleVapiBooking({})).rejects.toThrow(/missing required fields/i);
    await expect(booking.handleVapiBooking({ metadata: { clientKey: 'x' } })).rejects.toThrow(
      /missing required fields/i
    );
  });

  test('handleVapiBooking happy path calls gcal/db/notify in order', async () => {
    const booking = await import('../../../lib/booking.js');

    const payload = {
      metadata: { clientKey: 'tenant_1', service: 'haircut', lead: { id: 99, phone: '+447700900000' } },
      booking: { slot: { start: '2026-04-22T10:00:00.000Z', end: '2026-04-22T10:30:00.000Z' } }
    };

    const res = await booking.handleVapiBooking(payload);
    expect(res).toEqual({ ok: true, eventId: 'evt_1' });

    expect(getTenant).toHaveBeenCalledWith('tenant_1');
    expect(findExistingBooking).toHaveBeenCalledWith({
      tenantKey: 'tenant_1',
      leadId: 99,
      slot: payload.booking.slot
    });
    expect(assertFree).toHaveBeenCalledWith({
      calendarId: 'cal_1',
      slot: payload.booking.slot
    });
    expect(createEvent).toHaveBeenCalledWith({
      tenant: { calendarId: 'cal_1' },
      lead: { id: 99, phone: '+447700900000' },
      service: 'haircut',
      slot: payload.booking.slot
    });
    expect(markBooked).toHaveBeenCalledWith({
      tenantKey: 'tenant_1',
      leadId: 99,
      eventId: 'evt_1',
      slot: payload.booking.slot
    });
    expect(confirmations).toHaveBeenCalled();
  });

  test('handleVapiBooking is idempotent for same lead+slot: returns existing booking without side effects', async () => {
    findExistingBooking.mockResolvedValueOnce({
      id: 1,
      client_key: 'tenant_1',
      lead_id: 99,
      gcal_event_id: 'evt_existing',
      start_iso: '2026-04-22T10:00:00.000Z',
      end_iso: '2026-04-22T10:30:00.000Z',
      status: 'booked'
    });

    const booking = await import('../../../lib/booking.js');
    const payload = {
      metadata: { clientKey: 'tenant_1', service: 'haircut', lead: { id: 99, phone: '+447700900000' } },
      booking: { slot: { start: '2026-04-22T10:00:00.000Z', end: '2026-04-22T10:30:00.000Z' } }
    };

    const res = await booking.handleVapiBooking(payload);
    expect(res).toEqual({ ok: true, eventId: 'evt_existing', deduped: true });

    expect(assertFree).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
    expect(markBooked).not.toHaveBeenCalled();
    expect(confirmations).not.toHaveBeenCalled();
  });
});

