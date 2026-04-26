import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createHealthProbesRouter } from '../../routes/health-probes-mount.js';

describe('routes/health-probes-mount', () => {
  function buildApp() {
    const app = express();
    app.use(
      createHealthProbesRouter({
        healthzDeps: {
          listFullClients: async () => [{ clientKey: 'a' }],
          getIntegrationFlags: () => ({
            gcalConfigured: false,
            smsConfigured: false,
            corsOrigin: 'any',
            dbPath: 'test'
          })
        },
        gcalPingDeps: {
          getGoogleCredentials: () => ({
            clientEmail: null,
            privateKey: null,
            privateKeyB64: null
          })
        }
      })
    );
    return app;
  }

  test('GET /healthz returns ok', async () => {
    const res = await request(buildApp()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /gcal/ping returns 400 when Google credentials missing', async () => {
    const res = await request(buildApp()).get('/gcal/ping');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/Google env missing/i);
  });
});
