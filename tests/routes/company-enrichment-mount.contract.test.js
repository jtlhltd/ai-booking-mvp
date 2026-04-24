import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createCompanyEnrichmentRouter } from '../../routes/company-enrichment-mount.js';

describe('routes/company-enrichment-mount', () => {
  test('happy: GET /api/industry-categories returns categories', async () => {
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    const res = await request(app).get('/api/industry-categories').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ success: true, categories: expect.any(Array), total: expect.any(Number) }),
    );
  });

  test('failure: POST /api/uk-business-search requires query', async () => {
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    await request(app).post('/api/uk-business-search').send({}).expect(400);
  });

  test('failure: POST /api/decision-maker-contacts requires fields', async () => {
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    await request(app).post('/api/decision-maker-contacts').send({}).expect(400);
  });
});

