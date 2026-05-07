import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getDashboardSelfServiceClientKeys,
  isDashboardSelfServiceClient,
  isVapiOutboundAbExperimentOnlyPatch
} from '../../../lib/outbound-ab-dashboard-handlers.js';

describe('lib/outbound-ab-dashboard-handlers', () => {
  const prevEnv = process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS;

  beforeEach(() => {
    delete process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS;
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS;
    else process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS = prevEnv;
  });

  test('getDashboardSelfServiceClientKeys defaults when env unset', () => {
    expect(getDashboardSelfServiceClientKeys()).toContain('d2d-xpress-tom');
  });

  test('getDashboardSelfServiceClientKeys parses comma list', () => {
    process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS = ' a , b ';
    expect(getDashboardSelfServiceClientKeys()).toEqual(['a', 'b']);
  });

  test('isDashboardSelfServiceClient checks membership', () => {
    process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS = 'x,y';
    expect(isDashboardSelfServiceClient('x')).toBe(true);
    expect(isDashboardSelfServiceClient('z')).toBe(false);
  });

  test('isVapiOutboundAbExperimentOnlyPatch validates single vapi patch shape', () => {
    expect(isVapiOutboundAbExperimentOnlyPatch(null)).toBe(false);
    expect(isVapiOutboundAbExperimentOnlyPatch({ vapi: { outboundAbVoiceExperiment: 'exp' } })).toBe(true);
    expect(isVapiOutboundAbExperimentOnlyPatch({ vapi: { outboundAbVoiceExperiment: 1 } })).toBe(false);
    expect(
      isVapiOutboundAbExperimentOnlyPatch({
        vapi: { outboundAbVoiceExperiment: 'a', outboundAbOpeningExperiment: 'b' }
      })
    ).toBe(true);
  });

  test('runOutboundAbTestSetup rejects missing dimension', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => false),
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'locked'
    }));
    jest.unstable_mockModule('../../../lib/outbound-ab-variant.js', () => ({
      OUTBOUND_AB_VAPI_KEYS: {
        voice: 'outboundAbVoiceExperiment',
        opening: 'outboundAbOpeningExperiment',
        script: 'outboundAbScriptExperiment',
      }
    }));

    const { createOutboundAbHandlers } = await import('../../../lib/outbound-ab-dashboard-handlers.js');
    const handlers = createOutboundAbHandlers({
      invalidateClientCache: jest.fn(),
      getFullClient: jest.fn(async () => ({ vapi: {} })),
      nanoid: () => 'abc123',
      createABTestExperiment: jest.fn(async () => {})
    });

    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    await handlers.runOutboundAbTestSetup('c1', { variants: [{ name: 'variant_b', voice: 'v1' }] }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('runOutboundAbTestSetup rejects missing variants', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => false),
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'locked'
    }));
    jest.unstable_mockModule('../../../lib/outbound-ab-variant.js', () => ({
      OUTBOUND_AB_VAPI_KEYS: {
        voice: 'outboundAbVoiceExperiment',
        opening: 'outboundAbOpeningExperiment',
        script: 'outboundAbScriptExperiment',
      }
    }));

    const { createOutboundAbHandlers } = await import('../../../lib/outbound-ab-dashboard-handlers.js');
    const handlers = createOutboundAbHandlers({
      invalidateClientCache: jest.fn(),
      getFullClient: jest.fn(async () => ({ vapi: {} })),
      nanoid: () => 'abc123',
      createABTestExperiment: jest.fn(async () => {})
    });

    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    await handlers.runOutboundAbTestSetup('c1', { dimension: 'voice' }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test('runOutboundAbTestSetup returns 423 when review pending lock is active', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => true),
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'review_pending'
    }));
    jest.unstable_mockModule('../../../lib/outbound-ab-variant.js', () => ({
      OUTBOUND_AB_VAPI_KEYS: {
        voice: 'outboundAbVoiceExperiment',
        opening: 'outboundAbOpeningExperiment',
        script: 'outboundAbScriptExperiment',
      }
    }));

    const { createOutboundAbHandlers } = await import('../../../lib/outbound-ab-dashboard-handlers.js');
    const handlers = createOutboundAbHandlers({
      invalidateClientCache: jest.fn(),
      getFullClient: jest.fn(async () => ({ vapi: {} })),
      nanoid: () => 'abc123',
      createABTestExperiment: jest.fn(async () => {})
    });

    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    await handlers.runOutboundAbTestSetup('c1', { dimension: 'voice', variants: [{ name: 'variant_b', voice: 'v1' }] }, res);
    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'review_pending' });
  });

  test('runOutboundAbTestSetup voice dimension rejects challenger matching baseline', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => false),
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'locked'
    }));
    jest.unstable_mockModule('../../../lib/outbound-ab-variant.js', () => ({
      OUTBOUND_AB_VAPI_KEYS: {
        voice: 'outboundAbVoiceExperiment',
        opening: 'outboundAbOpeningExperiment',
        script: 'outboundAbScriptExperiment',
      }
    }));
    jest.unstable_mockModule('../../../lib/elevenlabs-voice-id.js', () => ({
      validateElevenLabsVoiceIdForAb: (id) => ({ ok: true, id: String(id) })
    }));
    jest.unstable_mockModule('../../../lib/outbound-ab-baseline.js', () => ({
      resolveOutboundAbBaselineForDimension: jest.fn(async () => 'v1')
    }));

    const { createOutboundAbHandlers } = await import('../../../lib/outbound-ab-dashboard-handlers.js');
    const handlers = createOutboundAbHandlers({
      invalidateClientCache: jest.fn(),
      getFullClient: jest.fn(async () => ({ vapi: {} })),
      nanoid: () => 'abc123',
      createABTestExperiment: jest.fn(async () => {})
    });

    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    await handlers.runOutboundAbTestSetup('c1', { dimension: 'voice', variants: [{ name: 'variant_b', voice: 'v1' }] }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.stringMatching(/matches your current live assistant voice/i) })
    );
  });
});
