import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.GOOGLE_SA_JSON_BASE64;
  delete process.env.GOOGLE_CLIENT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_PRIVATE_KEY_B64;
});

describe('booking-system.js', () => {
  test('initializes without credentials (services remain null)', async () => {
    jest.unstable_mockModule('googleapis', () => ({ google: { auth: { JWT: jest.fn() }, calendar: jest.fn() } }));
    jest.unstable_mockModule('nodemailer', () => ({ default: { createTransport: jest.fn() } }));
    jest.unstable_mockModule('twilio', () => ({ default: jest.fn() }));

    const { default: BookingSystem } = await import('../../../booking-system.js');
    const bs = new BookingSystem();

    // init is async but should not throw synchronously
    expect(bs).toBeTruthy();
    expect(bs.calendar).toBeNull();
  });
});

