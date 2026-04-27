/**
 * Canary for Intent Contract: dial.recall-goes-through-scheduler
 *
 * POST /api/leads/recall must:
 *   - Respond { ok: true, queued: true, scheduledFor: <ISO> }.
 *   - Call addToCallQueue exactly once with priority 9, callType 'vapi_call',
 *     callData.triggerType 'manual_recall'.
 *   - NOT call fetch('https://api.vapi.ai/call', ...) directly.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — recall must enqueue, not dial');
  });
});

describe('canary: dial.recall-goes-through-scheduler', () => {
  test('POST /api/leads/recall enqueues and never dials Vapi directly', async () => {
    await withEnv({}, async () => {
      const addToCallQueue = jest.fn(async () => ({ id: 1 }));
      const scheduledFor = new Date('2030-06-01T10:00:00Z');

      jest.unstable_mockModule('../../db.js', () => ({
        addToCallQueue,
        getLatestCallInsights: jest.fn(async () => ({ routing: { recommendations: { bestHours: [{ hour: 10, score: 1 }] } } })),
        getCallTimeBanditState: jest.fn(async () => ({}))
      }));
      jest.unstable_mockModule('../../lib/optimal-call-window.js', () => ({
        scheduleAtOptimalCallWindow: jest.fn(async () => scheduledFor)
      }));

      const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
      const router = createLeadsFollowupsRouter({
        getFullClient: jest.fn(async () => ({
          clientKey: 'tenant-a',
          displayName: 'Acme',
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
        .send({ clientKey: 'tenant-a', lead: { phone: '+441234', name: 'L', service: 'consult' } })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.queued).toBe(true);
      expect(res.body.scheduledFor).toBe(scheduledFor.toISOString());

      expect(global.fetch).not.toHaveBeenCalled();

      expect(addToCallQueue).toHaveBeenCalledTimes(1);
      const arg = addToCallQueue.mock.calls[0][0];
      expect(arg.priority).toBe(9);
      expect(arg.callType).toBe('vapi_call');
      expect(arg.leadPhone).toBe('+441234');
      expect(arg.callData?.triggerType).toBe('manual_recall');
      expect(arg.callData?.recall).toBe(true);
    });
  });
});
