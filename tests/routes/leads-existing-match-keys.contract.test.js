import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { createLeadsExistingMatchKeysRouter } from '../../routes/leads-existing-match-keys.js';

describe('routes/leads-existing-match-keys', () => {
  test('400 when clientKey or matchKeys missing', async () => {
    const router = createLeadsExistingMatchKeysRouter({ query: async () => ({ rows: [] }) });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).post('/api/leads/existing-match-keys').send({}).expect(400);
  });

  test('empty matchKeys returns existingKeys: [] without querying', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const router = createLeadsExistingMatchKeysRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app)
      .post('/api/leads/existing-match-keys')
      .send({ clientKey: 'c1', matchKeys: [' ', null] })
      .expect(200);
    expect(res.body).toEqual({ existingKeys: [] });
    expect(query).not.toHaveBeenCalled();
  });

  test('returns existingKeys from query rows', async () => {
    const query = jest.fn(async () => ({ rows: [{ phone_key: '123' }, { phone_key: '456' }, { phone_key: null }] }));
    const router = createLeadsExistingMatchKeysRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app)
      .post('/api/leads/existing-match-keys')
      .send({ clientKey: 'c1', matchKeys: ['123', '456', '123'] })
      .expect(200);
    expect(res.body).toEqual({ existingKeys: ['123', '456'] });
    expect(String(query.mock.calls[0][0])).toMatch(/FROM leads/i);
  });
});

