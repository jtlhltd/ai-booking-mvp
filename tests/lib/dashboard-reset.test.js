import { describe, test, expect, jest } from '@jest/globals';
import { handleDashboardReset } from '../../lib/dashboard-reset.js';

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

describe('lib/dashboard-reset', () => {
  test('happy: runs deletes and returns success', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const req = { params: { clientKey: 'acme' }, body: {}, query: {} };
    const res = mockRes();
    await handleDashboardReset(req, res, { query });
    expect(query).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('failure: query throws → 500', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down');
    });
    const req = { params: { clientKey: 'acme' }, body: {}, query: {} };
    const res = mockRes();
    await handleDashboardReset(req, res, { query });
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
