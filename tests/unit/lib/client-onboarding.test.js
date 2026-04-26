import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.VAPI_PRIVATE_KEY;
  delete process.env.VAPI_TEMPLATE_ASSISTANT_ID;
});

describe('lib/client-onboarding', () => {
  test('generateApiKey and generateClientKey return expected shapes', async () => {
    // stable ids for test
    jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'abcdef' }));
    jest.unstable_mockModule('../../../db.js', () => ({ upsertFullClient: jest.fn(), getFullClient: jest.fn() }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));

    const { generateApiKey, generateClientKey } = await import('../../../lib/client-onboarding.js');
    expect(generateApiKey()).toBe('cl_live_abcdef');
    expect(generateClientKey('Acme Dental Clinic')).toBe('acme-dental-clinic-abcdef');
  });

  test('cloneVapiAssistant throws when VAPI_PRIVATE_KEY missing', async () => {
    jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'abcdef' }));
    jest.unstable_mockModule('../../../db.js', () => ({ upsertFullClient: jest.fn(), getFullClient: jest.fn() }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));

    const { cloneVapiAssistant } = await import('../../../lib/client-onboarding.js');
    await expect(cloneVapiAssistant('tmpl', { businessName: 'Acme' })).rejects.toThrow(/VAPI_PRIVATE_KEY/i);
  });

  test('onboardClient validates required fields and continues when template clone fails', async () => {
    jest.unstable_mockModule('nanoid', () => ({ nanoid: (n) => 'x'.repeat(n || 6) }));

    const upsertFullClient = jest.fn(async (c) => c);
    jest.unstable_mockModule('../../../db.js', () => ({
      upsertFullClient,
      getFullClient: jest.fn(async () => null),
    }));

    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: { sendEmail: jest.fn(async () => {}) },
    }));

    process.env.VAPI_TEMPLATE_ASSISTANT_ID = 'tmpl';
    // Force clone assistant to fail without blocking onboarding.
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'fail' }));

    const { onboardClient } = await import('../../../lib/client-onboarding.js');
    await expect(onboardClient({ businessName: '', email: 'a', phone: 'b' })).rejects.toThrow(/Missing required fields/i);

    const out = await onboardClient({ businessName: 'Acme', email: 'owner@acme.test', phone: '+447700900000', services: ['cut'] });
    expect(out).toEqual(expect.objectContaining({ clientKey: expect.any(String), apiKey: expect.any(String) }));
    expect(upsertFullClient).toHaveBeenCalled();
  });
});

