import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/phone-validation', () => {
  test('validatePhoneNumber returns twilio_not_configured when env missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const { validatePhoneNumber } = await import('../../../lib/phone-validation.js');
    const out = await validatePhoneNumber('+447700900000');
    expect(out).toEqual(expect.objectContaining({ validated: false, reason: 'twilio_not_configured' }));
  });

  test('isPhoneValidationEnabled false when env missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const { isPhoneValidationEnabled } = await import('../../../lib/phone-validation.js');
    expect(isPhoneValidationEnabled()).toBe(false);
  });
});

