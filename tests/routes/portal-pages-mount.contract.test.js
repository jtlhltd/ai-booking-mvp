import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createPortalPagesRouter } from '../../routes/portal-pages-mount.js';

describe('routes/portal-pages-mount', () => {
  test('smoke: GET /privacy returns 200', async () => {
    const app = express();
    app.use(createPortalPagesRouter());
    const res = await request(app).get('/privacy').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  test('smoke: GET /zapier returns 200', async () => {
    const app = express();
    app.use(createPortalPagesRouter());
    await request(app).get('/zapier').expect(200);
  });
});

