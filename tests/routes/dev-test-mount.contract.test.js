import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDevTestRouter } from '../../routes/dev-test-mount.js';

describe('routes/dev-test-mount', () => {
  test('GET /api/test returns success true', async () => {
    const app = express();
    app.use(createDevTestRouter({}));
    const res = await request(app).get('/api/test').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true }));
  });

  test('POST /api/test/sms-status-webhook returns OK (even if DB missing)', async () => {
    const app = express();
    app.use(
      createDevTestRouter({
        query: jest.fn(async () => ({ rows: [] })),
        readJson: jest.fn(async () => []),
        writeJson: jest.fn(async () => {}),
        SMS_STATUS_PATH: 'x',
      })
    );
    const res = await request(app)
      .post('/api/test/sms-status-webhook')
      .type('form')
      .send({ MessageSid: 'sid_1', MessageStatus: 'delivered', To: '+447700900000', From: '+447700900001' })
      .expect(200);
    expect(res.text).toBe('OK');
  });
});

