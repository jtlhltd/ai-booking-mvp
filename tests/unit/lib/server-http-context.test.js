import { describe, expect, test, jest } from '@jest/globals';
import { createServerHttpContext, createActiveRequestTrackingMiddleware } from '../../../lib/server-http-context.js';

describe('lib/server-http-context', () => {
  test('createServerHttpContext idempotency and smsConfig', async () => {
    const getFullClient = jest.fn().mockResolvedValue({ clientKey: 'k' });
    const ctx = createServerHttpContext({
      getFullClient,
      TIMEZONE: 'UTC',
      GOOGLE_CALENDAR_ID: 'cal',
      defaultSmsClient: {},
      TWILIO_FROM_NUMBER: '+1',
      TWILIO_MESSAGING_SERVICE_SID: null
    });
    const req = {
      get: jest.fn((h) => (h === 'X-Client-Key' ? 'k' : h === 'Idempotency-Key' ? null : null)),
      body: { a: 1 }
    };
    await expect(ctx.getClientFromHeader(req)).resolves.toEqual({ clientKey: 'k' });
    const key = ctx.deriveIdemKey(req);
    expect(key.startsWith('auto:')).toBe(true);
    ctx.setCachedIdem('k', 200, { ok: true });
    expect(ctx.getCachedIdem('k')?.body).toEqual({ ok: true });
    const sms = ctx.smsConfig({ sms: { fromNumber: '+2' } });
    expect(sms.configured).toBe(true);
    expect(ctx.pickCalendarId({ calendarId: 'x' })).toBe('x');
    expect(ctx.pickCalendarId({})).toBe('cal');
  });

  test('createActiveRequestTrackingMiddleware 503 when shutting down', () => {
    const lifecycle = { isShuttingDown: true, activeRequests: 0 };
    const mw = createActiveRequestTrackingMiddleware(lifecycle);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    mw({}, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('createActiveRequestTrackingMiddleware increments and decrements on finish', () => {
    const lifecycle = { isShuttingDown: false, activeRequests: 0 };
    const mw = createActiveRequestTrackingMiddleware(lifecycle);
    const handlers = {};
    const res = {
      once: jest.fn((ev, fn) => {
        handlers[ev] = fn;
      }),
      status: jest.fn(),
      json: jest.fn()
    };
    const next = jest.fn();
    mw({}, res, next);
    expect(lifecycle.activeRequests).toBe(1);
    expect(next).toHaveBeenCalled();
    handlers.finish();
    expect(lifecycle.activeRequests).toBe(0);
  });
});
