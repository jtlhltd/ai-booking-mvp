import { describe, expect, test, jest, beforeAll, beforeEach } from '@jest/globals';

const query = jest.fn();
let customizeTemplateShouldThrow = false;

jest.unstable_mockModule('../../../db.js', () => ({
  query,
}));

jest.unstable_mockModule('../../../lib/industry-templates.js', () => ({
  customizeTemplate: jest.fn(() => {
    if (customizeTemplateShouldThrow) throw new Error('template_down');
    return { systemPrompt: 'TEMPLATE_PROMPT' };
  }),
}));

jest.unstable_mockModule('nanoid', () => ({
  nanoid: () => 'ABCDEF',
}));

describe('lib/auto-onboarding', () => {
  let createClient;

  beforeAll(async () => {
    const m = await import('../../../lib/auto-onboarding.js');
    createClient = m.createClient;
  });

  beforeEach(() => {
    query.mockReset();
    customizeTemplateShouldThrow = false;
  });

  test('createClient inserts tenant + api key and returns credentials (metadata failure is non-fatal)', async () => {
    // tenants insert ok, api key insert ok, then metadata create fails
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('metadata table locked'));

    const out = await createClient({
      businessName: 'My Biz!!',
      industry: 'dental',
      primaryService: 'checkup',
      serviceArea: 'Leeds',
      ownerName: 'Owner',
      email: 'owner@biz.test',
      phone: '+15551234567',
      voiceGender: 'female',
    });

    expect(out.success).toBe(true);
    expect(out.clientKey).toBe('my_biz_ABCDEF');
    expect(out.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
    expect(query).toHaveBeenCalled();
    // should have at least tenants insert + api key insert
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('createClient falls back to generic prompt when industry template throws', async () => {
    customizeTemplateShouldThrow = true;
    query.mockResolvedValue({ rows: [] });

    const out = await createClient({
      businessName: 'My Biz!!',
      industry: 'dental',
      primaryService: 'checkup',
      serviceArea: 'Leeds',
      ownerName: 'Owner',
      email: 'owner@biz.test',
      phone: '+15551234567',
      voiceGender: 'female',
    });

    expect(out.success).toBe(true);
    expect(String(out.systemPrompt)).toMatch(/You are a professional AI assistant/i);
  });

  test('createClient throws if initial tenant insert fails', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }));

    await expect(
      createClient({
        businessName: 'My Biz',
        industry: 'dental',
        primaryService: 'checkup',
        serviceArea: 'Leeds',
        ownerName: 'Owner',
        email: 'owner@biz.test',
        phone: '+15551234567',
      })
    ).rejects.toThrow('db down');
  });
});

