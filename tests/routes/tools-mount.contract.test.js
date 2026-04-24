import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createToolsRouter } from '../../routes/tools-mount.js';

describe('routes/tools-mount', () => {
  test('400 when action missing (smoke)', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createToolsRouter({
        store: { getFullClient: async () => null },
        sheets: {
          ensureLogisticsHeader: async () => {},
          appendLogistics: async () => {},
          readSheet: async () => [],
        },
        sendOperatorAlert: async () => {},
        messagingService: { sendEmail: async () => {} },
      }),
    );

    const res = await request(app).post('/tools/access_google_sheet').send({});
    expect(res.status).toBe(400);
  });
});

