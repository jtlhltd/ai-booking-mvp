import { describe, test, expect, jest } from '@jest/globals';
import { handleRoiCalculatorSave } from '../../lib/roi-calculator-save.js';

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

const sampleResults = {
  industry: 'x',
  leadsPerMonth: 1,
  currentConversion: 1,
  improvedConversion: 2,
  avgValue: 1,
  hoursSpent: 1,
  currentBookings: 1,
  potentialBookings: 2,
  extraBookings: 1,
  currentRevenue: 1,
  potentialRevenue: 2,
  revenueLost: 1,
  timeValue: 1,
  totalValue: 1,
};

describe('lib/roi-calculator-save', () => {
  test('failure: missing email', async () => {
    const req = { body: { results: sampleResults } };
    const res = mockRes();
    await handleRoiCalculatorSave(req, res, { query: jest.fn() });
    expect(res.statusCode).toBe(400);
  });

  test('happy: persists when query succeeds', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const req = { body: { email: 'a@b.com', results: sampleResults } };
    const res = mockRes();
    await handleRoiCalculatorSave(req, res, { query });
    expect(query).toHaveBeenCalled();
    expect(res.body.ok).toBe(true);
  });
});
