import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.VAPI_PRIVATE_KEY;
});

describe('lib/outbound-ab-baseline', () => {
  test('returns assistant override value when Vapi assistant fetch is unavailable', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
      summarizeOutboundVariantConfig: jest.fn((cfg) => cfg || {}),
    }));

    const { resolveOutboundAbBaselineForDimension } = await import('../../../lib/outbound-ab-baseline.js');
    const baseline = await resolveOutboundAbBaselineForDimension(
      'c1',
      { vapi: { assistantOverrides: { firstMessage: 'Hello there' } } },
      'opening',
      { excludeSameDimensionExperiment: true },
    );
    expect(baseline).toBe('Hello there');
  });

  test('falls back to control variant config when assistant + overrides missing', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({
        rows: [
          { variant_name: 'control', variant_config: JSON.stringify({ voiceId: 'voice_control' }) },
        ],
      })),
      summarizeOutboundVariantConfig: jest.fn((cfg) => cfg || {}),
    }));

    const { resolveOutboundAbBaselineForDimension } = await import('../../../lib/outbound-ab-baseline.js');
    const baseline = await resolveOutboundAbBaselineForDimension(
      'c1',
      { vapi: { outboundAbExperiment: 'exp1' } },
      'voice',
    );
    expect(baseline).toBe('voice_control');
  });
});

