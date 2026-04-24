import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

const googleInsertCalls = [];
jest.unstable_mockModule('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      events: {
        insert: jest.fn(async (args) => {
          googleInsertCalls.push(args);
          return { data: { id: 'evt_1', htmlLink: 'https://cal.example/evt_1', status: 'confirmed' } };
        })
      }
    }))
  }
}));

jest.unstable_mockModule('../../gcal.js', () => ({
  makeJwtAuth: jest.fn(() => ({ authorize: jest.fn(async () => {}) })),
  freeBusy: jest.fn(async () => [])
}));

function deps(overrides = {}) {
  return {
    getClientFromHeader: jest.fn(async () => ({ clientKey: 'acme', booking: { defaultDurationMin: 30 } })),
    pickTimezone: jest.fn(() => 'Europe/London'),
    pickCalendarId: jest.fn(() => 'primary'),
    getGoogleCredentials: jest.fn(() => ({ clientEmail: 'svc@example.com', privateKey: 'k', privateKeyB64: '' })),
    smsConfig: jest.fn(() => ({ configured: false, smsClient: null, messagingServiceSid: null, fromNumber: null })),
    renderTemplate: jest.fn((_t, v) => `Hi ${v.name}`),
    scheduleAppointmentReminders: jest.fn(async () => ({})),
    appendToSheet: jest.fn(async () => ({})),
    ...overrides
  };
}

async function appFor(d) {
  const { handleCalendarBookSlot } = await import('../../lib/calendar-book-slot.js');
  const app = express();
  app.use(express.json());
  app.post('/api/calendar/book-slot', (req, res) => handleCalendarBookSlot(req, res, d));
  return app;
}

describe('lib/calendar-book-slot', () => {
  test('400 when tenant missing', async () => {
    const app = await appFor(
      deps({
        getClientFromHeader: jest.fn(async () => null)
      })
    );
    await request(app).post('/api/calendar/book-slot').send({}).expect(400);
  });

  test('400 when google creds missing', async () => {
    const app = await appFor(
      deps({
        getGoogleCredentials: jest.fn(() => ({ clientEmail: '', privateKey: '', privateKeyB64: '' }))
      })
    );
    const res = await request(app).post('/api/calendar/book-slot').send({}).expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Google env missing' }));
  });

  test('409 when freeBusy reports conflict', async () => {
    const gcal = await import('../../gcal.js');
    gcal.freeBusy.mockResolvedValueOnce([{ start: '2030-06-15T14:00:00.000Z', end: '2030-06-15T14:30:00.000Z' }]);
    const app = await appFor(deps());
    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({ service: 'cut', lead: { name: 'A', phone: '+44' }, start: '2030-06-15T14:00:00.000Z', durationMin: 30 })
      .expect(409);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Requested time is busy' }));
  });

  test('200 on success with event payload', async () => {
    googleInsertCalls.length = 0;
    const app = await appFor(deps());
    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({ service: 'cut', lead: { name: 'A', phone: '+44' }, start: '2030-06-15T14:00:00.000Z', durationMin: 30 })
      .expect(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        event: expect.objectContaining({ id: 'evt_1' }),
        tenant: expect.objectContaining({ timezone: 'Europe/London' })
      })
    );
    expect(googleInsertCalls.length).toBe(1);
  });

  test('retries insert without id when Google rejects custom id', async () => {
    googleInsertCalls.length = 0;
    jest.resetModules();

    jest.unstable_mockModule('googleapis', () => ({
      google: {
        calendar: jest.fn(() => ({
          events: {
            insert: jest
              .fn()
              .mockImplementationOnce(async () => {
                const err = new Error('bad id');
                err.response = { status: 400, data: 'id invalid' };
                throw err;
              })
              .mockImplementationOnce(async (args) => {
                googleInsertCalls.push(args);
                return { data: { id: 'evt_2', htmlLink: 'https://cal.example/evt_2', status: 'confirmed' } };
              })
          }
        }))
      }
    }));

    jest.unstable_mockModule('../../gcal.js', () => ({
      makeJwtAuth: jest.fn(() => ({ authorize: jest.fn(async () => {}) })),
      freeBusy: jest.fn(async () => [])
    }));

    const app = await appFor(deps());
    const res = await request(app)
      .post('/api/calendar/book-slot')
      .send({ service: 'cut', lead: { name: 'A', phone: '+44' }, start: '2030-06-15T14:00:00.000Z', durationMin: 30 })
      .expect(201);
    expect(res.body.event.id).toBe('evt_2');
    expect(googleInsertCalls.length).toBe(1);
    expect(googleInsertCalls[0].requestBody.id).toBeUndefined();
  });
});

