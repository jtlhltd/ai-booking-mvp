import { describe, test, expect } from '@jest/globals';
import { handleLeadsScore, handleLeadsPrioritize } from '../../lib/leads-score-prioritize.js';

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

class FakeEngine {
  async scoreLeadWithHistory(lead) {
    return 85;
  }
  async prioritizeLeadsWithHistory(leads) {
    return leads.map((l) => ({ ...l, score: 70 }));
  }
}

describe('lib/leads-score-prioritize', () => {
  test('handleLeadsScore failure: missing fields', async () => {
    const req = { body: {} };
    const res = mockRes();
    await handleLeadsScore(req, res, { LeadScoringEngine: FakeEngine });
    expect(res.statusCode).toBe(400);
  });

  test('handleLeadsScore happy', async () => {
    const req = { body: { lead: { phone: '+1' }, clientKey: 'c1' } };
    const res = mockRes();
    await handleLeadsScore(req, res, { LeadScoringEngine: FakeEngine });
    expect(res.statusCode).toBe(200);
    expect(res.body.score).toBe(85);
  });

  test('handleLeadsPrioritize failure: invalid leads', async () => {
    const req = { body: { leads: 'nope', clientKey: 'c1' } };
    const res = mockRes();
    await handleLeadsPrioritize(req, res, { LeadScoringEngine: FakeEngine });
    expect(res.statusCode).toBe(400);
  });

  test('handleLeadsPrioritize happy', async () => {
    const req = { body: { leads: [{ id: 1 }], clientKey: 'c1' } };
    const res = mockRes();
    await handleLeadsPrioritize(req, res, { LeadScoringEngine: FakeEngine });
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
  });
});
