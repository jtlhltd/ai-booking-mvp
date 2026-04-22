import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../../helpers/contract-harness.js';

describe('booking HTTP: calendar-api reschedule', () => {
  test('POST /api/calendar/reschedule returns 201 when insertEvent succeeds (no external SMS)', async () => {
    const insertEvent = jest.fn(async () => ({
      id: 'evt_new',
      htmlLink: 'https://calendar.example/e',
      status: 'confirmed'
    }));
    const deps = {
      getClientFromHeader: async () => ({
        clientKey: 'c1',
        booking: { defaultDurationMin: 30 },
        locale: 'en-GB'
      }),
      makeJwtAuth: () => ({ authorize: async () => {} }),
      GOOGLE_CLIENT_EMAIL: 'svc@example.com',
      GOOGLE_PRIVATE_KEY: 'k',
      GOOGLE_PRIVATE_KEY_B64: undefined,
      google: { calendar: () => ({ events: { delete: async () => {} } }) },
      pickCalendarId: () => 'cal_primary',
      insertEvent,
      pickTimezone: () => 'Europe/London',
      smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => ({}) } } })
    };
    const { createCalendarApiRouter } = await import('../../../routes/calendar-api.js');
    const app = createContractApp({
      mounts: [{ path: '/api/calendar', router: () => createCalendarApiRouter(deps) }]
    });

    const res = await request(app)
      .post('/api/calendar/reschedule')
      .send({
        oldEventId: 'old_evt',
        newStartISO: '2026-06-01T14:00:00.000Z',
        service: 'Haircut',
        lead: { phone: '+441234567890', name: 'Alex' }
      })
      .expect(201);

    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        event: expect.objectContaining({ id: 'evt_new', status: 'confirmed' })
      })
    );
    expect(insertEvent).toHaveBeenCalled();
  });

  test('POST /api/calendar/reschedule returns 400 when required fields missing', async () => {
    const deps = {
      getClientFromHeader: async () => ({ clientKey: 'c1', booking: { defaultDurationMin: 30 } }),
      makeJwtAuth: () => ({ authorize: async () => {} }),
      GOOGLE_CLIENT_EMAIL: 'x',
      GOOGLE_PRIVATE_KEY: 'k',
      google: { calendar: () => ({ events: { delete: async () => {} } }) },
      pickCalendarId: () => 'cal',
      insertEvent: jest.fn(),
      pickTimezone: () => 'Europe/London',
      smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => ({}) } } })
    };
    const { createCalendarApiRouter } = await import('../../../routes/calendar-api.js');
    const app = createContractApp({
      mounts: [{ path: '/api/calendar', router: () => createCalendarApiRouter(deps) }]
    });
    const res = await request(app).post('/api/calendar/reschedule').send({ oldEventId: 'x' }).expect(400);
    expect(res.body.ok).toBe(false);
  });
});
