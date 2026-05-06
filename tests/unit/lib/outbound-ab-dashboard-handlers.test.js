import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
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
});
