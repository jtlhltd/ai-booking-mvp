import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

describe('routes/company-enrichment-mount', () => {
  beforeEach(() => {
    jest.resetModules();
  });
  test('happy: GET /api/industry-categories returns categories', async () => {
    const { createCompanyEnrichmentRouter } = await import('../../routes/company-enrichment-mount.js');
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    const res = await request(app).get('/api/industry-categories').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ success: true, categories: expect.any(Array), total: expect.any(Number) }),
    );
  });

  test('failure: POST /api/uk-business-search requires query', async () => {
    const { createCompanyEnrichmentRouter } = await import('../../routes/company-enrichment-mount.js');
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    await request(app).post('/api/uk-business-search').send({}).expect(400);
  });

  test('failure: POST /api/decision-maker-contacts requires fields', async () => {
    const { createCompanyEnrichmentRouter } = await import('../../routes/company-enrichment-mount.js');
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    await request(app).post('/api/decision-maker-contacts').send({}).expect(400);
  });

  test('happy: POST /api/uk-business-search uses sample data when real API module throws', async () => {
    jest.unstable_mockModule('../../lib/real-uk-business-search.js', () => ({
      default: class {
        async searchBusinesses() {
          throw new Error('no_network');
        }
      },
    }));
    const { createCompanyEnrichmentRouter } = await import('../../routes/company-enrichment-mount.js');
    const app = express();
    app.use(express.json());
    app.use(createCompanyEnrichmentRouter());
    const res = await request(app)
      .post('/api/uk-business-search')
      .send({ query: 'plumber london', filters: { mobilesOnly: false } })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.usingRealData).toBe(false);
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});

