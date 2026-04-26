import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createNextActionsRouter } from '../../routes/next-actions.js';

describe('routes/next-actions', () => {
  const cacheMiddleware = () => (_req, _res, next) => next();

  test('happy: returns empty actions when all counts are zero', async () => {
    const query = jest.fn(async () => ({ rows: [{ count: '0' }] }));
    const app = express();
    app.use(createNextActionsRouter({ query, cacheMiddleware }));
    const res = await request(app).get('/next-actions/acme').expect(200);
    expect(res.body).toEqual({ ok: true, actions: [] });
    expect(query).toHaveBeenCalledTimes(4);
  });

  test('happy: includes high-priority action (singular)', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValue({ rows: [{ count: '0' }] });
    const app = express();
    app.use(createNextActionsRouter({ query, cacheMiddleware }));
    const res = await request(app).get('/next-actions/acme').expect(200);
    expect(res.body.actions.some((a) => a.priority === 'high' && a.title.includes('1 high-priority lead'))).toBe(true);
  });

  test('happy: includes high-priority action (plural)', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValue({ rows: [{ count: '0' }] });
    const app = express();
    app.use(createNextActionsRouter({ query, cacheMiddleware }));
    const res = await request(app).get('/next-actions/acme').expect(200);
    expect(res.body.actions.some((a) => a.title.includes('3 high-priority leads'))).toBe(true);
  });

  test('happy: includes medium, scheduled, and retry actions when counts > 0', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // high
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // medium
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // scheduled
      .mockResolvedValueOnce({ rows: [{ count: '4' }] }); // retries
    const app = express();
    app.use(createNextActionsRouter({ query, cacheMiddleware }));
    const res = await request(app).get('/next-actions/acme').expect(200);
    const titles = res.body.actions.map((a) => a.title).join(' | ');
    expect(titles).toMatch(/medium-priority/);
    expect(titles).toMatch(/appointment reminders/);
    expect(titles).toMatch(/Retry 4 failed calls/);
  });

  test('failure: returns 500 when query throws', async () => {
    const query = jest.fn(async () => {
      throw new Error('db_down');
    });
    const app = express();
    app.use(createNextActionsRouter({ query, cacheMiddleware }));
    const res = await request(app).get('/next-actions/acme').expect(500);
    expect(res.body).toEqual({ ok: false, error: 'db_down' });
  });
});
