import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

const idemDup = { v: false };
const idemRecordFails = { v: false };

beforeEach(() => {
  idemDup.v = false;
  idemRecordFails.v = false;
  jest.resetModules();
});

jest.unstable_mockModule('../../lib/idempotency.js', () => ({
  generateIdempotencyKey: jest.fn(() => 'idem-k'),
  checkIdempotency: jest.fn(async () =>
    idemDup.v
      ? { isDuplicate: true, message: 'already booked', timeSinceOriginal: 12 }
      : { isDuplicate: false }
  ),
  recordIdempotency: jest.fn(async () => {
    if (idemRecordFails.v) throw new Error('idem_record_failed');
  })
}));

jest.unstable_mockModule('../../lib/demo-script.js', () => ({
  getDemoOverrides: jest.fn(async () => null),
  formatOverridesForTelemetry: jest.fn(() => null)
}));

jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
  recordDemoTelemetry: jest.fn()
}));

jest.unstable_mockModule('../../gcal.js', () => ({
  makeJwtAuth: jest.fn(() => ({ authorize: jest.fn(async () => {}) })),
  insertEvent: jest.fn(async () => ({ id: 'evt1', htmlLink: 'https://cal.example/e', status: 'confirmed' }))
}));

jest.unstable_mockModule('../../lib/messaging-service.js', () => ({
  default: { sendEmail: jest.fn(async () => ({ ok: true })) }
}));

jest.unstable_mockModule('../../db.js', () => ({
  withTransaction: jest.fn(async (cb) => {
    const tx = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO leads')) return { rows: [{ id: 99 }] };
      if (s.includes('SELECT id FROM leads')) return { rows: [] };
      if (s.includes('appointments')) return { rows: [] };
      return { rows: [] };
    });
    return cb(tx);
  }),
  query: jest.fn(async () => ({ rows: [] }))
}));

function baseDeps(overrides = {}) {
  const phone = '+447700900123';
  return {
    getClientFromHeader: jest.fn(async () => ({
      key: 'k1',
      tenantKey: 'k1',
      clientKey: 'acme',
      services: [],
      bookingDefaultDurationMin: 30,
      locale: 'en-GB',
      displayName: 'Acme',
      smsTemplates: {}
    })),
    deriveIdemKey: jest.fn(() => 'fallback-idem'),
    getMostRecentCallContext: jest.fn(() => ({ phone, name: 'Alice' })),
    pickTimezone: jest.fn(() => 'Europe/London'),
    pickCalendarId: jest.fn(() => 'primary'),
    isDemoClient: jest.fn(() => true),
    smsConfig: jest.fn(() => ({
      configured: false,
      smsClient: null,
      messagingServiceSid: null,
      fromNumber: null
    })),
    renderTemplate: jest.fn((_t, v) => `Hi ${v.name}`),
    readJson: jest.fn(async () => []),
    writeJson: jest.fn(async () => {}),
    CALLS_PATH: '/tmp/calls.json',
    withRetry: jest.fn(async (fn) => fn()),
    setCachedIdem: jest.fn(),
    getGoogleCredentials: jest.fn(() => ({
      clientEmail: '',
      privateKey: '',
      privateKeyB64: '',
      calendarId: 'primary'
    })),
    getTwilioDemoContext: jest.fn(() => ({
      defaultSmsClient: null,
      TWILIO_FROM_NUMBER: '',
      TWILIO_MESSAGING_SERVICE_SID: ''
    })),
    ...overrides
  };
}

async function mountHandler(deps) {
  const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
  const app = express();
  app.use(express.json());
  app.post('/api/calendar/check-book', (req, res) => handleCalendarCheckBook(req, res, deps));
  return app;
}

describe('lib/calendar-check-book', () => {
  test('409 when idempotency reports duplicate', async () => {
    idemDup.v = true;
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const app = await mountHandler(baseDeps());

    const res = await request(app).post('/api/calendar/check-book').send({ service: 'cut' }).expect(409);
    expect(res.body).toEqual(
      expect.objectContaining({ ok: false, error: 'Duplicate request', message: 'already booked' })
    );
  }, 60_000);

  test('400 unknown tenant after idempotency window', async () => {
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps({
      getClientFromHeader: jest.fn(async () => null)
    });
    const app = express();
    app.use(express.json());
    app.post('/api/calendar/check-book', (req, res) => handleCalendarCheckBook(req, res, deps));

    const res = await request(app).post('/api/calendar/check-book').send({ service: 'cut' }).expect(400);
    expect(res.body).toEqual({ error: 'Unknown tenant' });
  });

  test('400 when no phone in call context', async () => {
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps({
      getMostRecentCallContext: jest.fn(() => ({}))
    });
    const app = await mountHandler(deps);
    const res = await request(app).post('/api/calendar/check-book').send({ service: 'cut' }).expect(400);
    expect(res.body.error).toMatch(/No active call/);
  });

  test('400 when phone cannot normalize to E.164', async () => {
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps({
      getMostRecentCallContext: jest.fn(() => ({ phone: 'not-a-number', name: 'Bob' }))
    });
    const app = await mountHandler(deps);
    const res = await request(app).post('/api/calendar/check-book').send({ service: 'cut' }).expect(400);
    expect(res.body.error).toMatch(/E\.164/);
  });

  test('happy path: demo client skips real GCal/SMS but returns slot JSON', async () => {
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps();
    const app = await mountHandler(deps);

    const res = await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-15', time: '14' })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({ timezone: 'Europe/London' }),
        tenant: 'acme'
      })
    );
    expect(deps.writeJson).toHaveBeenCalled();
  });

  test('idempotency record failure is non-fatal (continues booking flow)', async () => {
    idemRecordFails.v = true;
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const app = await mountHandler(baseDeps());

    const res = await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-15', time: '14' })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ tenant: 'acme' }));
  });

  test('non-demo: insertEvent failure returns gcal_insert_failed', async () => {
    const gcal = await import('../../gcal.js');
    gcal.insertEvent.mockImplementation(async () => {
      const err = new Error('fail');
      err.response = { status: 502, data: 'quota' };
      throw err;
    });
    gcal.makeJwtAuth.mockImplementation(() => ({ authorize: jest.fn(async () => {}) }));

    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps({
      isDemoClient: jest.fn(() => false),
      getGoogleCredentials: jest.fn(() => ({
        clientEmail: 'svc@proj.iam.gserviceaccount.com',
        privateKey: 'k',
        privateKeyB64: '',
        calendarId: 'primary'
      }))
    });
    const app = express();
    app.use(express.json());
    app.post('/api/calendar/check-book', (req, res) => handleCalendarCheckBook(req, res, deps));

    const res = await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-15', time: '14' })
      .expect(502);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'gcal_insert_failed' }));
  });

  test('supertest via createContractApp wrapper accepts POST', async () => {
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps();
    const app = createContractApp({
      mounts: [
        {
          path: '/',
          router: (() => {
            const r = express.Router();
            r.post('/api/calendar/check-book', (req, res) => handleCalendarCheckBook(req, res, deps));
            return r;
          })()
        }
      ]
    });
    await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-20', time: '10' })
      .expect(200);
  });

  test('uses Vapi API when callId exists but phone missing', async () => {
    const prevKey = process.env.VAPI_PRIVATE_KEY;
    process.env.VAPI_PRIVATE_KEY = 'k';
    const prevFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ customer: { number: '+447700901111', name: 'FromVapi' } })
    }));
    // eslint-disable-next-line no-global-assign
    global.fetch = fetchMock;

    try {
      const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
      const deps = baseDeps({
        getMostRecentCallContext: jest.fn(() => ({ callId: 'vapi_call_1' }))
      });
      const app = await mountHandler(deps);

      const res = await request(app)
        .post('/api/calendar/check-book')
        .send({ service: 'cut', date: '2030-06-15', time: '14' })
        .expect(200);

      expect(fetchMock).toHaveBeenCalled();
      expect(res.body).toEqual(expect.objectContaining({ tenant: 'acme' }));
    } finally {
      if (prevKey === undefined) delete process.env.VAPI_PRIVATE_KEY;
      else process.env.VAPI_PRIVATE_KEY = prevKey;
      // eslint-disable-next-line no-global-assign
      global.fetch = prevFetch;
    }
  });

  test('non-demo: invalid_grant skips calendar insert and still returns 200', async () => {
    const gcal = await import('../../gcal.js');
    gcal.insertEvent.mockImplementation(async () => {
      const err = new Error('fail');
      err.response = { status: 401, data: 'invalid_grant: Bad Request' };
      throw err;
    });
    gcal.makeJwtAuth.mockImplementation(() => ({ authorize: jest.fn(async () => {}) }));

    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps({
      isDemoClient: jest.fn(() => false),
      smsConfig: jest.fn(() => ({
        configured: false,
        smsClient: null,
        messagingServiceSid: null,
        fromNumber: null
      })),
      getGoogleCredentials: jest.fn(() => ({
        clientEmail: 'svc@proj.iam.gserviceaccount.com',
        privateKey: 'k',
        privateKeyB64: '',
        calendarId: 'primary'
      }))
    });
    const app = express();
    app.use(express.json());
    app.post('/api/calendar/check-book', (req, res) => handleCalendarCheckBook(req, res, deps));

    const res = await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-15', time: '14' })
      .expect(200);

    expect(res.body.google).toEqual(expect.objectContaining({ skipped: true, error: 'invalid_grant' }));
  });

  test('non-demo: configured SMS sends message and returns sms id', async () => {
    const smsClient = { messages: { create: jest.fn(async () => ({ sid: 'SM123' })) } };
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps({
      isDemoClient: jest.fn(() => false),
      getGoogleCredentials: jest.fn(() => ({
        clientEmail: '',
        privateKey: '',
        privateKeyB64: '',
        calendarId: 'primary'
      })),
      smsConfig: jest.fn(() => ({
        configured: true,
        smsClient,
        messagingServiceSid: 'MG1',
        fromNumber: null
      }))
    });
    const app = await mountHandler(deps);

    const res = await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-15', time: '14' })
      .expect(200);

    expect(smsClient.messages.create).toHaveBeenCalled();
    expect(res.body.sms).toEqual(expect.objectContaining({ id: 'SM123', to: '+447700900123' }));
  });

  test('DEMO_MODE telemetry calls recordDemoTelemetry with elapsedMs', async () => {
    const prevDemo = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';
    try {
      const demoTelemetry = await import('../../lib/demo-telemetry.js');
      const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
      const deps = baseDeps();
      const app = await mountHandler(deps);

      await request(app)
        .post('/api/calendar/check-book')
        .send({ service: 'cut', date: '2030-06-15', time: '14' })
        .expect(200);

      expect(demoTelemetry.recordDemoTelemetry).toHaveBeenCalled();
      const payload = demoTelemetry.recordDemoTelemetry.mock.calls[0][0];
      expect(payload).toEqual(expect.objectContaining({ evt: 'booking.checkAndBook' }));
      expect(typeof payload.elapsedMs).toBe('number');
    } finally {
      if (prevDemo === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = prevDemo;
    }
  });

  test('idempotency record failure falls back to setCachedIdem on success', async () => {
    idemRecordFails.v = true;
    const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
    const deps = baseDeps();
    const app = await mountHandler(deps);

    await request(app)
      .post('/api/calendar/check-book')
      .send({ service: 'cut', date: '2030-06-15', time: '14' })
      .expect(200);

    expect(deps.setCachedIdem).toHaveBeenCalledWith('idem-k', 200, expect.any(Object));
  });

  test('outer catch: sends email alert when YOUR_EMAIL set', async () => {
    const prevEmail = process.env.YOUR_EMAIL;
    process.env.YOUR_EMAIL = 'ops@example.com';
    try {
      const messaging = await import('../../lib/messaging-service.js');
      const { handleCalendarCheckBook } = await import('../../lib/calendar-check-book.js');
      const deps = baseDeps({
        pickTimezone: jest.fn(() => {
          throw new Error('boom');
        })
      });
      const app = await mountHandler(deps);

      await request(app).post('/api/calendar/check-book').send({ service: 'cut' }).expect(500);
      expect(messaging.default.sendEmail).toHaveBeenCalled();
    } finally {
      if (prevEmail === undefined) delete process.env.YOUR_EMAIL;
      else process.env.YOUR_EMAIL = prevEmail;
    }
  });
});
