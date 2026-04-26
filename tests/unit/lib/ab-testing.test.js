import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const recordABTestAssignment = jest.fn(async () => {});
const recordABTestOutcome = jest.fn(async () => {});
const getABTestResultsFromDb = jest.fn(async () => []);

jest.unstable_mockModule('../../../db.js', () => ({
  recordABTestAssignment,
  recordABTestOutcome,
  getABTestResults: getABTestResultsFromDb
}));

describe('ab-testing', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getPersonalizedPrompt replaces placeholders', async () => {
    const { getPersonalizedPrompt, VAPI_SCRIPT_VARIANTS } = await import('../../../lib/ab-testing.js');
    const v = VAPI_SCRIPT_VARIANTS.variant_c_social_proof;
    const prompt = getPersonalizedPrompt(v, { name: 'Acme Ltd', industry: 'dental' });
    expect(prompt).toContain('Acme Ltd');
    expect(prompt).toContain('dental');
    expect(prompt).not.toMatch(/\{businessName\}/);
  });

  test('assignCallVariant records and returns a variant key', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { assignCallVariant } = await import('../../../lib/ab-testing.js');
    const out = await assignCallVariant('+441234567890', 'tenant-a');
    expect(out.key).toBeTruthy();
    expect(out.prompt).toBeTruthy();
    expect(recordABTestAssignment).toHaveBeenCalled();
    Math.random.mockRestore();
  });

  test('assignCallVariant swallows db errors but still returns variant', async () => {
    recordABTestAssignment.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const { assignCallVariant, VAPI_SCRIPT_VARIANTS } = await import('../../../lib/ab-testing.js');
    const keys = Object.keys(VAPI_SCRIPT_VARIANTS);
    const out = await assignCallVariant('+44', 't');
    expect(keys).toContain(out.key);
    Math.random.mockRestore();
  });

  test('recordCallOutcome maps booked to conversion', async () => {
    const { recordCallOutcome } = await import('../../../lib/ab-testing.js');
    await recordCallOutcome({
      clientKey: 'c',
      leadPhone: '+44',
      outcome: 'booked',
      duration: 60,
      sentiment: 'pos',
      qualityScore: 8
    });
    expect(recordABTestOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'conversion',
        experimentName: 'vapi_script_optimization'
      })
    );
  });

  test('getABTestResults returns empty message when no rows', async () => {
    getABTestResultsFromDb.mockResolvedValueOnce([]);
    const { getABTestResults } = await import('../../../lib/ab-testing.js');
    const r = await getABTestResults('c1');
    expect(r.winner).toBeNull();
    expect(r.message).toMatch(/No A\/B test data/);
  });

  test('getABTestResults builds stats and winner when enough data', async () => {
    getABTestResultsFromDb.mockResolvedValueOnce([
      {
        variant_name: 'variant_a_direct',
        outcome: 'conversion',
        outcomeData: { qualityScore: 8, duration: 120 }
      },
      ...Array.from({ length: 9 }, () => ({
        variant_name: 'variant_a_direct',
        outcome: 'no_conversion',
        outcomeData: { qualityScore: 5, duration: 30 }
      })),
      ...Array.from({ length: 10 }, () => ({
        variant_name: 'variant_b_consultative',
        outcome: 'no_conversion',
        outcomeData: { qualityScore: 4, duration: 20 }
      }))
    ]);
    const { getABTestResults } = await import('../../../lib/ab-testing.js');
    const r = await getABTestResults('c1');
    expect(r.variants.variant_a_direct.totalCalls).toBe(10);
    expect(r.variants.variant_a_direct.conversions).toBe(1);
    expect(r.winner).toBeTruthy();
    expect(r.winner.key).toBe('variant_a_direct');
  });

  test('getABTestResults returns error object on db failure', async () => {
    getABTestResultsFromDb.mockRejectedValueOnce(new Error('boom'));
    const { getABTestResults } = await import('../../../lib/ab-testing.js');
    const r = await getABTestResults('c1');
    expect(r.error).toBe('boom');
    expect(r.variants).toEqual({});
  });
});
