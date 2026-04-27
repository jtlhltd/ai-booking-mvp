import { describe, test, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createToolsRouter } from '../../routes/tools-mount.js';

function makeApp(deps) {
  const app = express();
  app.use(express.json());
  app.use(createToolsRouter(deps));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, error: err?.message || 'err' });
  });
  return app;
}

const SHEET_ID = 'sheet_abc';
const SHEET_TENANT = { vapi_json: { logisticsSheetId: SHEET_ID } };

describe('routes/tools-mount /tools/access_google_sheet', () => {
  let consoleErrSpy;
  beforeAll(() => {
    consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrSpy.mockRestore();
  });

  test('400 when action missing in direct format', async () => {
    const app = makeApp({
      store: { getFullClient: async () => null },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics: async () => {}, readSheet: async () => [] },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const res = await request(app).post('/tools/access_google_sheet').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Action is required');
  });

  test('400 + operator alert when sheet ID not configured', async () => {
    const sendOperatorAlert = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => null },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics: async () => {}, readSheet: async () => [] },
      sendOperatorAlert,
      messagingService: { sendEmail: async () => {} }
    });

    const prev = process.env.LOGISTICS_SHEET_ID;
    delete process.env.LOGISTICS_SHEET_ID;
    try {
      const res = await request(app)
        .post('/tools/access_google_sheet')
        .send({ action: 'append', data: { name: 'x' }, tenantKey: 'no-config' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Google Sheet ID not configured');
      expect(sendOperatorAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/Google Sheet not configured/),
          dedupeKey: expect.stringContaining('sheet-missing:no-config')
        })
      );
    } finally {
      if (prev !== undefined) process.env.LOGISTICS_SHEET_ID = prev;
    }
  });

  test('append happy: direct format calls ensureHeader + appendLogistics with timestamp', async () => {
    const ensureLogisticsHeader = jest.fn(async () => {});
    const appendLogistics = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader, appendLogistics, readSheet: async () => [] },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const res = await request(app)
      .post('/tools/access_google_sheet')
      .send({ action: 'append', data: { name: 'Tom Co', phone: '+44...' }, tenantKey: 't1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Data appended to Google Sheet successfully',
      action: 'append'
    });
    expect(ensureLogisticsHeader).toHaveBeenCalledWith(SHEET_ID);
    expect(appendLogistics).toHaveBeenCalledWith(SHEET_ID, expect.objectContaining({
      name: 'Tom Co',
      phone: '+44...',
      timestamp: expect.any(String)
    }));
  });

  test('append via VAPI message format: extracts toolCallId, parses string args, returns VAPI envelope', async () => {
    const appendLogistics = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics, readSheet: async () => [] },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const body = {
      message: {
        call: { id: 'call_777', assistantId: 't1' },
        toolCallList: [
          {
            id: 'tc_111',
            function: {
              arguments: JSON.stringify({ action: 'append', data: { name: 'X' } })
            }
          }
        ]
      }
    };

    const res = await request(app).post('/tools/access_google_sheet').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [
        { toolCallId: 'tc_111', result: expect.any(String) }
      ]
    });
    const inner = JSON.parse(res.body.results[0].result);
    expect(inner).toEqual(expect.objectContaining({ success: true, action: 'append' }));
    // callId from message.call.id should be propagated to row
    expect(appendLogistics).toHaveBeenCalledWith(SHEET_ID, expect.objectContaining({
      callId: 'call_777'
    }));
  });

  test('append via VAPI message format with object arguments (not stringified)', async () => {
    const appendLogistics = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics, readSheet: async () => [] },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const body = {
      message: {
        toolCallList: [
          {
            id: 'tc_222',
            function: { arguments: { action: 'append', data: { lane: 'UK->FR' }, tenantKey: 't9' } }
          }
        ]
      }
    };

    const res = await request(app).post('/tools/access_google_sheet').send(body);
    expect(res.status).toBe(200);
    expect(res.body.results?.[0]?.toolCallId).toBe('tc_222');
    expect(appendLogistics).toHaveBeenCalled();
  });

  test('append via VAPI direct function format with stringified arguments', async () => {
    const appendLogistics = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics, readSheet: async () => [] },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const body = {
      id: 'tc_333',
      callId: 'call_42',
      function: {
        arguments: JSON.stringify({ action: 'append', data: { name: 'Y' }, tenantKey: 't1' })
      }
    };

    const res = await request(app).post('/tools/access_google_sheet').send(body);
    expect(res.status).toBe(200);
    expect(res.body.results?.[0]?.toolCallId).toBe('tc_333');
    expect(appendLogistics).toHaveBeenCalledWith(SHEET_ID, expect.objectContaining({
      callId: 'call_42',
      name: 'Y'
    }));
  });

  test('read action returns sheet rows (direct format)', async () => {
    const rows = [['a', 'b'], ['c', 'd']];
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics: async () => {}, readSheet: async () => rows },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const res = await request(app)
      .post('/tools/access_google_sheet')
      .send({ action: 'read', tenantKey: 't1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: rows, action: 'read' });
  });

  test('read action wraps response in VAPI envelope when toolCallList present', async () => {
    const rows = [['x']];
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics: async () => {}, readSheet: async () => rows },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });

    const body = {
      message: {
        toolCallList: [{ id: 'tc_read', function: { arguments: { action: 'read' } } }]
      }
    };
    const res = await request(app).post('/tools/access_google_sheet').send(body);
    expect(res.status).toBe(200);
    expect(res.body.results?.[0]?.toolCallId).toBe('tc_read');
    expect(JSON.parse(res.body.results[0].result)).toEqual(expect.objectContaining({ action: 'read' }));
  });

  test('400 when action present but neither append-with-data nor read', async () => {
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: { ensureLogisticsHeader: async () => {}, appendLogistics: async () => {}, readSheet: async () => [] },
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: async () => {} }
    });
    const res = await request(app)
      .post('/tools/access_google_sheet')
      .send({ action: 'delete', tenantKey: 't1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid action or missing data');
  });

  test('500 + operator alert when append throws', async () => {
    const sendOperatorAlert = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => SHEET_TENANT },
      sheets: {
        ensureLogisticsHeader: async () => {},
        appendLogistics: async () => { throw new Error('sheets api down'); },
        readSheet: async () => []
      },
      sendOperatorAlert,
      messagingService: { sendEmail: async () => {} }
    });

    const res = await request(app)
      .post('/tools/access_google_sheet')
      .send({ action: 'append', data: { x: 1 }, tenantKey: 't1' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual(expect.objectContaining({ error: 'Failed to access Google Sheet' }));
    expect(res.body).not.toHaveProperty('stack');
    expect(sendOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'sheet-tool-error:access_google_sheet' })
    );
  });

  test('falls back to LOGISTICS_SHEET_ID env when tenant has none', async () => {
    const ensureLogisticsHeader = jest.fn(async () => {});
    const appendLogistics = jest.fn(async () => {});
    const prev = process.env.LOGISTICS_SHEET_ID;
    process.env.LOGISTICS_SHEET_ID = 'env_sheet';
    try {
      const app = makeApp({
        store: { getFullClient: async () => ({}) },
        sheets: { ensureLogisticsHeader, appendLogistics, readSheet: async () => [] },
        sendOperatorAlert: async () => {},
        messagingService: { sendEmail: async () => {} }
      });
      const res = await request(app)
        .post('/tools/access_google_sheet')
        .send({ action: 'append', data: { foo: 1 }, tenantKey: 't1' });
      expect(res.status).toBe(200);
      expect(ensureLogisticsHeader).toHaveBeenCalledWith('env_sheet');
      expect(appendLogistics).toHaveBeenCalledWith('env_sheet', expect.any(Object));
    } finally {
      if (prev === undefined) delete process.env.LOGISTICS_SHEET_ID;
      else process.env.LOGISTICS_SHEET_ID = prev;
    }
  });
});

describe('routes/tools-mount /tools/schedule_callback', () => {
  let consoleErrSpy;
  beforeAll(() => { consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterAll(() => { consoleErrSpy.mockRestore(); });

  const validBody = {
    businessName: 'Tom Logistics',
    phone: '+447700900000',
    reason: 'callback for quote',
    receptionistName: 'Sara',
    preferredTime: 'tomorrow 10am',
    notes: 'urgent',
    tenantKey: 't1'
  };

  test('400 when required fields missing', async () => {
    const app = makeApp({
      store: { getFullClient: async () => ({ vapi_json: { callbackInboxEmail: 'inbox@x' } }) },
      sheets: {},
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: jest.fn(async () => {}) }
    });
    const res = await request(app).post('/tools/schedule_callback').send({ businessName: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Business name, phone, and reason/);
  });

  test('400 when callback inbox email not configured anywhere', async () => {
    const prev = process.env.CALLBACK_INBOX_EMAIL;
    delete process.env.CALLBACK_INBOX_EMAIL;
    try {
      const app = makeApp({
        store: { getFullClient: async () => null },
        sheets: {},
        sendOperatorAlert: async () => {},
        messagingService: { sendEmail: jest.fn(async () => {}) }
      });
      const res = await request(app).post('/tools/schedule_callback').send(validBody);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Callback inbox email not configured');
    } finally {
      if (prev !== undefined) process.env.CALLBACK_INBOX_EMAIL = prev;
    }
  });

  test('200 sends email to tenant inbox', async () => {
    const sendEmail = jest.fn(async () => {});
    const app = makeApp({
      store: { getFullClient: async () => ({ vapi_json: { callbackInboxEmail: 'inbox@x' } }) },
      sheets: {},
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail }
    });
    const res = await request(app).post('/tools/schedule_callback').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, callbackEmail: 'inbox@x' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'inbox@x',
      subject: expect.stringContaining('Tom Logistics')
    }));
  });

  test('500 when email send throws', async () => {
    const app = makeApp({
      store: { getFullClient: async () => ({ vapi_json: { callbackInboxEmail: 'inbox@x' } }) },
      sheets: {},
      sendOperatorAlert: async () => {},
      messagingService: { sendEmail: jest.fn(async () => { throw new Error('smtp'); }) }
    });
    const res = await request(app).post('/tools/schedule_callback').send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to schedule callback');
  });
});
