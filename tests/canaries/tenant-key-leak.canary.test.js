/**
 * Canary for Intent Contract: tenant.no-internal-key-leak
 *
 * Internal tenant keys (e.g. d2d-xpress-tom) MUST NOT appear in customer-
 * facing surfaces. This canary checks two flows:
 *   1. POST /api/leads/recall — response body contains no internal key.
 *   2. Imported-leads enqueue — the callData passed to addToCallQueue does
 *      not embed the tenant slug in customer-visible fields (leadName,
 *      leadService, leadSource). It is acceptable for the row's clientKey
 *      *parameter* to carry the slug — that is internal routing metadata
 *      and never reaches the prospect.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';
import { assertNoTenantKeyLeak } from '../helpers/contract-asserts.js';

const INTERNAL_KEY = 'd2d-xpress-tom';

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — must never dial directly');
  });
});

describe('canary: tenant.no-internal-key-leak', () => {
  test('POST /api/leads/recall does not leak the internal tenant key in the response', async () => {
    await withEnv({}, async () => {
      const addToCallQueue = jest.fn(async () => ({ id: 1 }));
      const scheduledFor = new Date('2030-06-01T10:00:00Z');

      jest.unstable_mockModule('../../db.js', () => ({
        addToCallQueue,
        getLatestCallInsights: jest.fn(async () => null),
        getCallTimeBanditState: jest.fn(async () => ({}))
      }));
      jest.unstable_mockModule('../../lib/optimal-call-window.js', () => ({
        scheduleAtOptimalCallWindow: jest.fn(async () => scheduledFor)
      }));

      const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
      const router = createLeadsFollowupsRouter({
        getFullClient: jest.fn(async () => ({
          clientKey: INTERNAL_KEY,
          displayName: 'D2D Xpress',
          booking: { timezone: 'Europe/London' }
        })),
        isBusinessHours: jest.fn(() => true),
        TIMEZONE: 'Europe/London',
        VAPI_PRIVATE_KEY: 'k',
        VAPI_ASSISTANT_ID: 'a1',
        VAPI_PHONE_NUMBER_ID: 'p1',
        readJson: jest.fn(),
        writeJson: jest.fn(),
        LEADS_PATH: 'x',
        getClientFromHeader: jest.fn(),
        smsConfig: jest.fn()
      });
      const app = createContractApp({ mounts: [{ path: '/api/leads', router }] });

      const res = await request(app)
        .post('/api/leads/recall')
        .send({ clientKey: INTERNAL_KEY, lead: { phone: '+441234', name: 'L' } })
        .expect(200);

      assertNoTenantKeyLeak(res, INTERNAL_KEY);
    });
  });

  test('imported-leads enqueue does not embed the tenant slug in customer-visible callData fields', async () => {
    const addToCallQueue = jest.fn(async () => ({ id: 1 }));

    jest.unstable_mockModule('../../db.js', () => ({
      getFullClient: jest.fn(async () => ({
        clientKey: INTERNAL_KEY,
        displayName: 'D2D Xpress',
        isEnabled: true,
        vapi: { assistantId: 'asst_x' }
      })),
      getLatestCallInsights: jest.fn(async () => null),
      getCallTimeBanditState: jest.fn(async () => ({}))
    }));

    const { runOutboundCallsForImportedLeads } = await import('../../lib/lead-import-outbound.js');

    await runOutboundCallsForImportedLeads({
      clientKey: INTERNAL_KEY,
      inserted: [
        { id: 1, phone: '+447700900001', name: 'Acme Corp', service: 'Lead Follow-Up', source: 'Import', status: 'new' }
      ],
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date('2030-06-02T09:00:00Z'),
      scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2030-06-02T10:00:00Z')),
      addToCallQueue,
      TIMEZONE: 'Europe/London'
    });

    expect(addToCallQueue).toHaveBeenCalledTimes(1);
    const arg = addToCallQueue.mock.calls[0][0];
    const customerVisible = [
      arg.callData?.leadName,
      arg.callData?.leadService,
      arg.callData?.leadSource,
      arg.callData?.leadStatus
    ];
    for (const field of customerVisible) {
      const text = String(field || '').toLowerCase();
      expect(text.includes(INTERNAL_KEY)).toBe(false);
    }
    // Note: arg.clientKey deliberately *is* the internal slug — that is row-
    // routing metadata, never sent to the prospect.
  });
});
