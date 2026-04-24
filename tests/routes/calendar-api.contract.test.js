import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const freeBusy = jest.fn(async () => []);
const makeJwtAuth = jest.fn(() => ({ authorize: jest.fn(async () => {}) }));
const insertEvent = jest.fn(async () => ({ id: 'evt_insert', htmlLink: '', status: 'confirmed' }));

const gcalEventsInsert = jest.fn(async () => ({
  data: { id: 'evt1', htmlLink: 'https://example.test/e', status: 'confirmed' },
}));

jest.unstable_mockModule('../../gcal.js', () => ({
  freeBusy,
  makeJwtAuth,
  insertEvent,
}));

jest.unstable_mockModule('googleapis', () => ({
  google: {
    calendar: () => ({
      events: {
        insert: (...args) => gcalEventsInsert(...args),
      },
    }),
  },
}));

describe('routes/calendar-api', () => {
  beforeEach(() => {
    freeBusy.mockReset().mockResolvedValue([]);
    gcalEventsInsert.mockReset().mockResolvedValue({
      data: { id: 'evt1', htmlLink: 'https://example.test/e', status: 'confirmed' },
    });
  });

  test('failure: POST /api/calendar/find-slots returns 400 when tenant missing', async () => {
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => null,
        pickTimezone: () => 'Europe/London',
        pickCalendarId: () => 'cal1',
        getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
        makeJwtAuth: () => ({ authorize: async () => {} }),
        freeBusy: async () => [],
      }),
    );

    const res = await request(app).post('/api/calendar/find-slots').send({ service: 'checkup' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('happy: POST /api/calendar/find-slots returns slots', async () => {
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1', booking: { defaultDurationMin: 30 } }),
        pickTimezone: () => 'Europe/London',
        pickCalendarId: () => 'cal1',
        servicesFor: () => [{ id: 'checkup', durationMin: 30 }],
        getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
        makeJwtAuth: () => ({ authorize: async () => {} }),
        freeBusy: async () => [],
        now: () => new Date('2030-01-01T09:00:00.000Z').getTime(),
      }),
    );

    const res = await request(app).post('/api/calendar/find-slots').send({ service: 'checkup', stepMinutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  test('failure: POST /api/calendar/book-slot returns 400 for missing service', async () => {
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1', booking: { defaultDurationMin: 30 } }),
        pickTimezone: () => 'Europe/London',
        pickCalendarId: () => 'cal1',
        getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
        smsConfig: () => ({ configured: false }),
        renderTemplate: (_t, _v) => '',
        scheduleAppointmentReminders: async () => {},
        appendToSheet: async () => {},
      }),
    );

    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({ lead: { name: 'A', phone: '+15551234567' }, start: '2030-01-01T10:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  test('happy: POST /api/calendar/book-slot returns 201 and event', async () => {
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1', displayName: 'Clinic', booking: { defaultDurationMin: 30 } }),
        pickTimezone: () => 'Europe/London',
        pickCalendarId: () => 'cal1',
        getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
        smsConfig: () => ({ configured: false }),
        renderTemplate: (_t, _v) => '',
        scheduleAppointmentReminders: async () => {},
        appendToSheet: async () => {},
      }),
    );

    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({
        service: 'checkup',
        lead: { name: 'A', phone: '+15551234567' },
        start: '2030-01-01T10:00:00.000Z',
        durationMin: 30,
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.event).toEqual(expect.objectContaining({ id: 'evt1' }));
  });

  test('failure: POST /api/calendar/cancel returns 400 when eventId missing', async () => {
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1' }),
        makeJwtAuth: () => ({ authorize: async () => {} }),
        GOOGLE_CLIENT_EMAIL: 'svc@example.com',
        GOOGLE_PRIVATE_KEY: 'k',
        google: { calendar: () => ({ events: { delete: async () => {} } }) },
        pickCalendarId: () => 'cal1',
        pickTimezone: () => 'Europe/London',
        smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => ({}) } } }),
      }),
    );

    await request(app).post('/api/calendar/cancel').send({}).expect(400);
  });

  test('happy: POST /api/calendar/cancel returns ok true', async () => {
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1' }),
        makeJwtAuth: () => ({ authorize: async () => {} }),
        GOOGLE_CLIENT_EMAIL: 'svc@example.com',
        GOOGLE_PRIVATE_KEY: 'k',
        google: { calendar: () => ({ events: { delete: async () => {} } }) },
        pickCalendarId: () => 'cal1',
        pickTimezone: () => 'Europe/London',
        smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => ({}) } } }),
      }),
    );

    const res = await request(app).post('/api/calendar/cancel').send({ eventId: 'evt1' }).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('failure: POST /api/calendar/book-slot returns 409 when slot is busy', async () => {
    freeBusy.mockResolvedValueOnce([
      { start: '2030-01-01T10:00:00.000Z', end: '2030-01-01T11:00:00.000Z' },
    ]);
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1', displayName: 'Clinic', booking: { defaultDurationMin: 30 } }),
        pickTimezone: () => 'Europe/London',
        pickCalendarId: () => 'cal1',
        getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
        smsConfig: () => ({ configured: false }),
        renderTemplate: (_t, _v) => '',
        scheduleAppointmentReminders: async () => {},
        appendToSheet: async () => {},
      }),
    );

    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({
        service: 'checkup',
        lead: { name: 'A', phone: '+15551234567' },
        start: '2030-01-01T10:00:00.000Z',
        durationMin: 30,
      })
      .expect(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/busy/i);
    expect(gcalEventsInsert).not.toHaveBeenCalled();
  });

  test('failure: POST /api/calendar/book-slot returns 500 when Google insert fails', async () => {
    gcalEventsInsert.mockRejectedValueOnce(new Error('Google Calendar unavailable'));
    const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/calendar',
      createCalendarApiRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1', displayName: 'Clinic', booking: { defaultDurationMin: 30 } }),
        pickTimezone: () => 'Europe/London',
        pickCalendarId: () => 'cal1',
        getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y' }),
        smsConfig: () => ({ configured: false }),
        renderTemplate: (_t, _v) => '',
        scheduleAppointmentReminders: async () => {},
        appendToSheet: async () => {},
      }),
    );

    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({
        service: 'checkup',
        lead: { name: 'A', phone: '+15551234567' },
        start: '2030-01-01T14:00:00.000Z',
        durationMin: 30,
      })
      .expect(500);
    expect(res.body.ok).toBe(false);
  });
});

