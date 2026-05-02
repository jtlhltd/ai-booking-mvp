import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/google-places-search.js', () => {
  test('400 when query or location missing', async () => {
    const { default: router } = await import('../../routes/google-places-search.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app).post('/api/search-google-places').send({ query: 'x' }).expect(400);
    await request(app).post('/api/search-google-places').send({ location: 'y' }).expect(400);
  });

  test('500 when GOOGLE_PLACES_API_KEY missing', async () => {
    await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
      const { default: router } = await import('../../routes/google-places-search.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app)
        .post('/api/search-google-places')
        .send({ query: 'owner plumber', location: 'Paris', maxResults: 1 })
        .expect(500);
    });
  });

  test('200 returns success with stubbed fetch', async () => {
    await withEnv({ GOOGLE_PLACES_API_KEY: 'k' }, async () => {
      const fetchMock = jest.fn(async (url) => {
        const u = String(url);
        if (u.includes('/place/textsearch/')) {
          return { json: async () => ({ results: [{ place_id: 'p1', name: 'Biz', formatted_address: 'A' }] }) };
        }
        if (u.includes('/place/details/')) {
          return {
            json: async () => ({
              result: {
                name: 'Biz',
                formatted_phone_number: '+447700900000',
                formatted_address: 'A',
                rating: 4.5
              }
            })
          };
        }
        return { json: async () => ({ results: [] }) };
      });
       
      global.fetch = fetchMock;

      const { default: router } = await import('../../routes/google-places-search.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app)
        .post('/api/search-google-places')
        .send({ query: 'owner plumber', location: 'Paris', maxResults: 1 })
        .expect(200);

      expect(res.body).toEqual(expect.objectContaining({ success: true, total: 1 }));
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});

