import { describe, test, expect, jest } from '@jest/globals';
import { handleTwilioSmsInbound } from '../../lib/twilio-sms-inbound-webhook.js';

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.headersSent = false;
  res.body = null;
  res.sent = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.type = () => res;
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.send = (b) => {
    res.sent = b;
    return res;
  };
  return res;
}

function baseDeps(overrides = {}) {
  return {
    validatePhoneNumber: () => true,
    validateSmsBody: () => true,
    normalizePhoneE164: (x) => String(x || '').replace(/\s/g, '') || '+15550001111',
    resolveTenantKeyFromInbound: async () => null,
    listFullClients: async () => [],
    getFullClient: async () => null,
    upsertFullClient: async () => {},
    nanoid: () => 'abc',
    trackConversionStage: async () => {},
    trackAnalyticsEvent: async () => {},
    VAPI_PRIVATE_KEY: '',
    VAPI_TEST_MODE: false,
    VAPI_DRY_RUN: false,
    checkBudgetBeforeCall: async () => ({ allowed: true }),
    handleVapiFailure: async () => {},
    determineCallScheduling: async () => ({ shouldDelay: false }),
    addToCallQueue: async () => {},
    isBusinessHours: () => true,
    getNextBusinessHour: () => new Date(),
    calculateLeadScore: () => 0,
    getLeadPriority: () => 1,
    smsConfig: () => ({ configured: false }),
    TIMEZONE: 'Europe/London',
    selectOptimalAssistant: async () => ({ assistantId: 'a', phoneNumberId: 'p' }),
    retryWithBackoff: async (fn) => fn(),
    generateAssistantVariables: async () => ({}),
    VAPI_URL: 'https://api.vapi.ai',
    recordPerformanceMetric: async () => {},
    pickCalendarId: () => null,
    GOOGLE_CLIENT_EMAIL: '',
    GOOGLE_PRIVATE_KEY: '',
    GOOGLE_PRIVATE_KEY_B64: '',
    google: {},
    ...overrides,
  };
}

describe('lib/twilio-sms-inbound-webhook', () => {
  test('failure: invalid From phone returns 400', async () => {
    const req = {
      body: { From: 'x', To: '+15551234567', Body: 'hi' },
      get: () => '',
      ip: '127.0.0.1',
    };
    const res = mockRes();
    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({ validatePhoneNumber: (p) => p !== 'x' })
    );
    expect(res.statusCode).toBe(400);
  });

  test('happy: unknown tenant resolves to plain OK', async () => {
    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'hello' },
      get: () => '',
      ip: '127.0.0.1',
    };
    const res = mockRes();
    await handleTwilioSmsInbound(req, res, baseDeps());
    expect(res.sent).toBe('OK');
  });

  test('updates existing lead on STOP (consentSms false, opted_out)', async () => {
    const upsertFullClient = jest.fn(async () => {});
    const getFullClient = jest.fn(async () => ({ clientKey: 't1', leads: [], updatedAt: null }));

    const existingLead = {
      id: 'lead_1',
      phone: '+15551234567',
      tenantKey: 't1',
      consentSms: true,
      status: 'engaged',
    };

    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'STOP', MessagingServiceSid: 'MG1' },
      get: (h) => (h === 'X-Client-Key' ? '' : ''),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound: async () => 't1',
        listFullClients: async () => [{ clientKey: 't1', leads: [existingLead] }],
        getFullClient,
        upsertFullClient,
      })
    );

    expect(res.sent).toBe('OK');
    expect(upsertFullClient).toHaveBeenCalledTimes(1);
    const updatedClient = upsertFullClient.mock.calls[0][0];
    const updatedLead = updatedClient.leads.find((l) => l.id === 'lead_1');
    expect(updatedLead.consentSms).toBe(false);
    expect(updatedLead.status).toBe('opted_out');
  });

  test('creates new lead on START and tracks analytics', async () => {
    const upsertFullClient = jest.fn(async () => {});
    const getFullClient = jest.fn(async () => ({ clientKey: 't1', leads: [], updatedAt: null }));
    const trackConversionStage = jest.fn(async () => {});
    const trackAnalyticsEvent = jest.fn(async () => {});

    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'START', MessagingServiceSid: 'MG1' },
      get: (h) => (h === 'X-Client-Key' ? '' : ''),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound: async () => 't1',
        listFullClients: async () => [{ clientKey: 't1', leads: [] }],
        getFullClient,
        upsertFullClient,
        trackConversionStage,
        trackAnalyticsEvent,
      })
    );

    expect(res.sent).toBe('OK');
    expect(upsertFullClient).toHaveBeenCalledTimes(1);
    const updatedClient = upsertFullClient.mock.calls[0][0];
    expect(updatedClient.leads).toHaveLength(1);
    expect(updatedClient.leads[0].phone).toBe('+15551234567');
    expect(updatedClient.leads[0].consentSms).toBe(true);
    expect(trackConversionStage).toHaveBeenCalled();
    expect(trackAnalyticsEvent).toHaveBeenCalled();
  });

  test('prefers X-Client-Key header for tenant resolution', async () => {
    const upsertFullClient = jest.fn(async () => {});
    const getFullClient = jest.fn(async () => ({ clientKey: 't_hdr', leads: [], updatedAt: null }));
    const resolveTenantKeyFromInbound = jest.fn(async () => 't_other');

    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'YES', MessagingServiceSid: 'MG1' },
      get: (h) => (h === 'X-Client-Key' ? 't_hdr' : ''),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound,
        listFullClients: async () => [{ clientKey: 't_hdr', leads: [] }],
        getFullClient,
        upsertFullClient,
      })
    );

    expect(res.sent).toBe('OK');
    expect(resolveTenantKeyFromInbound).not.toHaveBeenCalled();
    expect(upsertFullClient).toHaveBeenCalledTimes(1);
    const updatedClient = upsertFullClient.mock.calls[0][0];
    expect(updatedClient.leads[0].tenantKey).toBe('t_hdr');
    expect(updatedClient.leads[0].status).toBe('engaged');
    expect(updatedClient.leads[0].consentSms).toBe(true);
  });

  test('idempotent skip: already engaged lead does not trigger scheduling/call work', async () => {
    const determineCallScheduling = jest.fn(async () => ({ shouldDelay: false }));
    const checkBudgetBeforeCall = jest.fn(async () => ({ allowed: true }));
    const addToCallQueue = jest.fn(async () => {});

    const existingLead = {
      id: 'lead_1',
      phone: '+15551234567',
      tenantKey: 't1',
      consentSms: true,
      status: 'engaged',
    };

    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'hello', MessagingServiceSid: 'MG1' },
      get: () => '',
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound: async () => 't1',
        listFullClients: async () => [{ clientKey: 't1', leads: [existingLead] }],
        getFullClient: async () => ({ clientKey: 't1', booking: { timezone: 'Europe/London' } }),
        upsertFullClient: async () => {},
        determineCallScheduling,
        checkBudgetBeforeCall,
        addToCallQueue,
        VAPI_PRIVATE_KEY: 'secret',
      })
    );

    expect(res.sent).toBe('OK');
    expect(determineCallScheduling).not.toHaveBeenCalled();
    expect(checkBudgetBeforeCall).not.toHaveBeenCalled();
    expect(addToCallQueue).not.toHaveBeenCalled();
  });

  test('VAPI_TEST_MODE short-circuits before budget/scheduling', async () => {
    const determineCallScheduling = jest.fn(async () => ({ shouldDelay: false }));
    const checkBudgetBeforeCall = jest.fn(async () => ({ allowed: true }));

    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'YES', MessagingServiceSid: 'MG1' },
      get: () => '',
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound: async () => 't1',
        listFullClients: async () => [{ clientKey: 't1', leads: [] }],
        getFullClient: async () => ({ clientKey: 't1', booking: { timezone: 'Europe/London' } }),
        upsertFullClient: async () => {},
        VAPI_PRIVATE_KEY: 'secret',
        VAPI_TEST_MODE: true,
        determineCallScheduling,
        checkBudgetBeforeCall,
      })
    );

    expect(res.sent).toBe('OK');
    expect(determineCallScheduling).not.toHaveBeenCalled();
    expect(checkBudgetBeforeCall).not.toHaveBeenCalled();
  });

  test('low lead score skips call path', async () => {
    const fetchSpy = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'call1' }) }));
    // Ensure no accidental network call
    const prevFetch = global.fetch;
    global.fetch = fetchSpy;

    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'YES', MessagingServiceSid: 'MG1' },
      get: () => '',
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound: async () => 't1',
        listFullClients: async () => [{ clientKey: 't1', leads: [] }],
        getFullClient: async () => ({ clientKey: 't1', booking: { timezone: 'Europe/London' } }),
        upsertFullClient: async () => {},
        VAPI_PRIVATE_KEY: 'secret',
        determineCallScheduling: async () => ({ shouldDelay: false }),
        isBusinessHours: () => true,
        calculateLeadScore: () => 10,
      })
    );

    expect(res.sent).toBe('OK');
    expect(fetchSpy).not.toHaveBeenCalled();

    global.fetch = prevFetch;
  });

  test('outside business hours sends an acknowledgement SMS when configured', async () => {
    const create = jest.fn(async () => ({}));
    const req = {
      body: { From: '+15551234567', To: '+15559876543', Body: 'YES', MessagingServiceSid: 'MG1' },
      get: () => '',
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = mockRes();

    await handleTwilioSmsInbound(
      req,
      res,
      baseDeps({
        resolveTenantKeyFromInbound: async () => 't1',
        listFullClients: async () => [{ clientKey: 't1', leads: [] }],
        getFullClient: async () => ({ clientKey: 't1', displayName: 'Clinic', booking: { timezone: 'Europe/London' } }),
        upsertFullClient: async () => {},
        VAPI_PRIVATE_KEY: 'secret',
        determineCallScheduling: async () => ({ shouldDelay: false }),
        isBusinessHours: () => false,
        getNextBusinessHour: () => new Date('2030-01-01T10:00:00.000Z'),
        calculateLeadScore: () => 80,
        smsConfig: () => ({
          configured: true,
          messagingServiceSid: 'MG1',
          fromNumber: '+1000',
          smsClient: { messages: { create } },
        }),
      })
    );

    expect(res.sent).toBe('OK');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].to).toBe('+15551234567');
  });
});
