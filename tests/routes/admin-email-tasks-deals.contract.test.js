import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/admin-email-tasks-deals', () => {
  test('GET /api/admin/email-templates returns [] on query error', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('db down');
      })
    }));
    const { createAdminEmailTasksDealsRouter } = await import('../../routes/admin-email-tasks-deals.js');
    const router = createAdminEmailTasksDealsRouter();
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    const res = await request(app).get('/api/admin/email-templates').expect(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/admin/email-templates returns 500 on insert error', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('insert failed');
      })
    }));
    const { createAdminEmailTasksDealsRouter } = await import('../../routes/admin-email-tasks-deals.js');
    const router = createAdminEmailTasksDealsRouter();
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    await request(app)
      .post('/api/admin/email-templates')
      .send({ name: 'n', subject: 's', body: 'b' })
      .expect(500);
  });

  test('POST /api/admin/email-templates/send returns 404 when template missing', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async (sql) => {
        if (String(sql).includes('FROM email_templates WHERE id')) return { rows: [] };
        return { rows: [] };
      })
    }));
    const { createAdminEmailTasksDealsRouter } = await import('../../routes/admin-email-tasks-deals.js');
    const router = createAdminEmailTasksDealsRouter();
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    await request(app)
      .post('/api/admin/email-templates/send')
      .send({ templateId: 1, recipientEmail: 'a@b.com', variables: {} })
      .expect(404);
  });
});

