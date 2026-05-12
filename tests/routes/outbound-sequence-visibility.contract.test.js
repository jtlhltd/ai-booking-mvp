import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/outbound-sequence-visibility-mount.js', () => {
  test('GET /api/outbound-sequence/:clientKey/summary returns ok + no-store', async () => {
    const getFullClient = jest.fn(async () => ({
      clientKey: 'd2d-xpress-tom',
      displayName: 'D2D Xpress',
      outboundSequence: {
        enabled: true,
        maxTotalDialsPerLead: 3,
        maxSequenceDurationDays: 7,
        stages: [
          {
            id: 'stage_gatekeeper',
            firstMessage: 'Hello there this is a longer first message that should not be fully shown in the dashboard payload',
            systemMessage: 'SYSTEM: This is a system message that is long and should be redacted. Do not expose full prompts.',
            requiredFields: ['lane', 'volume'],
            maxAttemptsInStage: 2,
            nextStage: 'stage_pricing',
            scheduling: { minDelayMinutesBeforeNext: 60, maxDelayMinutesBeforeNext: 120 },
          },
          {
            id: 'stage_pricing',
            firstMessage: 'Pricing stage',
            systemMessage: 'Pricing system',
            requiredFields: ['authority'],
            maxAttemptsInStage: 2,
            isFinal: true,
          },
        ],
      },
    }));
    const query = jest.fn(async () => ({
      rows: [
        {
          active_sequences: '2',
          completed_today: '1',
          abandoned_today: '0',
          next_stage_queued: '3',
          oldest_active_updated_at: '2030-01-01T00:00:00.000Z',
        },
      ],
    }));

    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api',
          router: () =>
            createOutboundSequenceVisibilityRouter({
              query,
              getFullClient,
              isPostgres: true,
            }),
        },
      ],
    });

    const res = await request(app).get('/api/outbound-sequence/d2d-xpress-tom/summary').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/i);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'd2d-xpress-tom',
        sequence: expect.objectContaining({
          enabled: true,
          stages: expect.any(Array),
        }),
        summary: expect.objectContaining({
          activeSequences: 2,
          completedToday: 1,
          abandonedToday: 0,
          nextStageQueued: 3,
        }),
      })
    );

    // Prompts are redacted to previews + metadata.
    const st0 = res.body.sequence.stages[0];
    expect(st0).toEqual(expect.objectContaining({ id: 'stage_gatekeeper' }));
    expect(st0.promptRedacted).toEqual(
      expect.objectContaining({
        firstMessage: expect.objectContaining({ preview: expect.any(String), length: expect.any(Number), sha: expect.any(String) }),
        systemMessage: expect.objectContaining({ preview: expect.any(String), length: expect.any(Number), sha: expect.any(String) }),
      })
    );
    expect(st0.promptRedacted.firstMessage.preview.length).toBeLessThanOrEqual(121);
    expect(st0.promptRedacted.systemMessage.preview.length).toBeLessThanOrEqual(121);
  });

  test('GET /api/outbound-sequence/:clientKey/phone/:phone returns ok true with row null when not found', async () => {
    const getFullClient = jest.fn(async () => ({
      clientKey: 'd2d-xpress-tom',
      outboundSequence: {
        enabled: true,
        stages: [
          {
            id: 'stage_gatekeeper',
            firstMessage: 'Hello',
            systemMessage: 'System',
            requiredFields: ['lane'],
            maxAttemptsInStage: 2,
            isFinal: true,
          },
        ],
      },
    }));
    const query = jest.fn(async () => ({ rows: [] }));

    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api',
          router: () =>
            createOutboundSequenceVisibilityRouter({
              query,
              getFullClient,
              isPostgres: true,
            }),
        },
      ],
    });

    const res = await request(app).get('/api/outbound-sequence/d2d-xpress-tom/phone/%2B447700900000').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'd2d-xpress-tom',
        row: null,
      })
    );
  });

  test('GET /api/outbound-sequence/:clientKey/phone/:phone returns explain with requiredFieldsStatus when row exists', async () => {
    const getFullClient = jest.fn(async () => ({
      clientKey: 'd2d-xpress-tom',
      outboundSequence: {
        enabled: true,
        maxTotalDialsPerLead: 3,
        maxSequenceDurationDays: 7,
        stages: [
          {
            id: 'stage_gatekeeper',
            firstMessage: 'Hello',
            systemMessage: 'System',
            requiredFields: ['lane', 'volume'],
            maxAttemptsInStage: 2,
            isFinal: true,
          },
        ],
      },
    }));

    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM lead_sequence_state')) {
        return {
          rows: [
            {
              clientKey: 'd2d-xpress-tom',
              leadPhone: '+447700900000',
              currentStageId: 'stage_gatekeeper',
              stagesCompleted: JSON.stringify([
                { stageId: 'stage_gatekeeper', completedAt: '2030-01-01T00:00:00.000Z', callId: 'call_1', structuredData: { lane: 'LON→MAN' } },
              ]),
              attemptsInStage: 0,
              attemptsTotal: 1,
              startedAt: '2030-01-01T00:00:00.000Z',
              lastCallId: 'call_1',
              nextStageScheduledFor: null,
              status: 'active',
              updatedAt: '2030-01-01T01:00:00.000Z',
            },
          ],
        };
      }
      if (s.includes('FROM call_queue')) {
        return { rows: [] };
      }
      if (s.includes('FROM calls')) {
        return { rows: [{ outcome: 'no-answer', status: 'ended', duration: 12, createdAt: '2030-01-01T00:30:00.000Z' }] };
      }
      return { rows: [] };
    });

    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/api', router: () => createOutboundSequenceVisibilityRouter({ query, getFullClient, isPostgres: true }) }],
    });

    const res = await request(app).get('/api/outbound-sequence/d2d-xpress-tom/phone/%2B447700900000').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, row: expect.any(Object), explain: expect.any(Object) }));
    expect(res.body.explain.currentStage.requiredFieldsStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'lane', present: true }),
        expect.objectContaining({ field: 'volume', present: false }),
      ])
    );
    expect(res.body.explain.stage.promptRedacted).toEqual(expect.any(Object));
    expect(Array.isArray(res.body.row.stagesCompleted)).toBe(true);
    expect(res.body.row.stagesCompleted[0]).toEqual(expect.objectContaining({ callId: 'call_1' }));
  });

  test('GET /api/outbound-sequence/:clientKey/leads applies cohort filter', async () => {
    const getFullClient = jest.fn(async () => ({
      clientKey: 'd2d-xpress-tom',
      timezone: 'Europe/London',
      outboundSequence: {
        enabled: true,
        maxTotalDialsPerLead: 3,
        maxSequenceDurationDays: 7,
        classicFollowUpCutoverDate: '2026-05-10',
        stages: [
          {
            id: 'stage_gatekeeper',
            firstMessage: 'Hello',
            systemMessage: 'System',
            requiredFields: ['lane'],
            maxAttemptsInStage: 2,
            isFinal: true,
          },
        ],
      },
    }));

    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('current_stage_id AS "currentStageId"')) {
        return {
          rows: [
            {
              clientKey: 'd2d-xpress-tom',
              leadPhone: '+447700900111',
              currentStageId: 'stage_gatekeeper',
              stagesCompleted: '[]',
              attemptsInStage: 0,
              attemptsTotal: 1,
              startedAt: '2030-01-01T00:00:00.000Z',
              lastCallId: null,
              nextStageScheduledFor: null,
              status: 'abandoned',
              updatedAt: '2030-01-01T01:00:00.000Z',
            },
            {
              clientKey: 'd2d-xpress-tom',
              leadPhone: '+447700900222',
              currentStageId: 'stage_gatekeeper',
              stagesCompleted: '[]',
              attemptsInStage: 0,
              attemptsTotal: 1,
              startedAt: '2030-01-01T00:00:00.000Z',
              lastCallId: null,
              nextStageScheduledFor: null,
              status: 'completed',
              updatedAt: '2030-01-01T01:00:00.000Z',
            },
          ],
        };
      }
      if (s.includes('FROM lead_handoff')) {
        return {
          rows: [
            {
              leadPhone: '+447700900111',
              phoneMatchKey: '7700900111',
              source: 'vapi_webhook.sequence_abandoned',
              updatedAt: '2030-01-01T01:00:00.000Z',
            },
            {
              leadPhone: '+447700900222',
              phoneMatchKey: '7700900222',
              source: 'vapi_webhook.sequence_completed',
              updatedAt: '2030-01-01T01:00:00.000Z',
            },
          ],
        };
      }
      if (s.includes('FROM leads')) {
        return {
          rows: [
            { phone: '+447700900111', phoneMatchKey: '7700900111', createdAt: '2030-01-01T00:00:00.000Z' },
            { phone: '+447700900222', phoneMatchKey: '7700900222', createdAt: '2030-01-01T00:00:00.000Z' },
          ],
        };
      }
      if (s.includes('FROM lead_sequence_state')) {
        return {
          rows: [
            { leadPhone: '+447700900111', status: 'abandoned', updatedAt: '2030-01-01T01:00:00.000Z' },
            { leadPhone: '+447700900222', status: 'completed', updatedAt: '2030-01-01T01:00:00.000Z' },
          ],
        };
      }
      return { rows: [] };
    });

    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/api', router: () => createOutboundSequenceVisibilityRouter({ query, getFullClient, isPostgres: true }) }],
    });

    const res = await request(app).get('/api/outbound-sequence/d2d-xpress-tom/leads?filter=abandoned').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      filter: 'abandoned',
      rows: expect.any(Array)
    }));
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toEqual(expect.objectContaining({
      leadPhone: '+447700900111',
      dashboardCohort: 'abandoned'
    }));
  });
});

