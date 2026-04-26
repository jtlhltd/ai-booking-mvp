import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createInlineJsonApiRouter } from '../../routes/inline-json-api-mount.js';

class StubLeadScoringEngine {
  async scoreLeadWithHistory() {
    return 50;
  }

  async prioritizeLeadsWithHistory(leads) {
    return leads.map((l) => ({ ...l, score: 50 }));
  }
}

function buildApp(overrides = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    createInlineJsonApiRouter({
      getApiKey: () => 'secret',
      dashboardResetDeps: { query: jest.fn(async () => ({})) },
      leadsScorePrioritizeDeps: { LeadScoringEngine: StubLeadScoringEngine },
      roiCalculatorSaveDeps: { query: jest.fn(async () => ({})) },
      ...overrides
    })
  );
  return app;
}

describe('routes/inline-json-api-mount', () => {
  test('failure: POST /sms returns 401 without api key', async () => {
    const app = buildApp();
    const res = await request(app).post('/sms').send({ From: '+1', Body: 'hi' });
    expect(res.status).toBe(401);
  });

  test('happy: POST /sms returns ok with api key', async () => {
    const app = buildApp();
    const res = await request(app).post('/sms').set('X-API-Key', 'secret').send({ From: '+1', To: '+2', Body: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('failure: POST /api/leads/score returns 400 without lead', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/leads/score').send({ clientKey: 'c1' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('failure: POST /api/leads/prioritize returns 400 when leads not array', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/leads/prioritize').send({ clientKey: 'c1', leads: {} });
    expect(res.status).toBe(400);
  });

  test('failure: POST /api/roi-calculator/save returns 400 without email', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/roi-calculator/save').send({ results: {} });
    expect(res.status).toBe(400);
  });

  test('happy: POST /api/dashboard/reset/:clientKey succeeds', async () => {
    const query = jest.fn(async () => ({ rowCount: 1 }));
    const app = express();
    app.use(express.json());
    app.use(
      createInlineJsonApiRouter({
        getApiKey: () => 'x',
        dashboardResetDeps: { query },
        leadsScorePrioritizeDeps: { LeadScoringEngine: StubLeadScoringEngine },
        roiCalculatorSaveDeps: { query: jest.fn() }
      })
    );
    const res = await request(app).post('/api/dashboard/reset/acme').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(query).toHaveBeenCalled();
  });
});
