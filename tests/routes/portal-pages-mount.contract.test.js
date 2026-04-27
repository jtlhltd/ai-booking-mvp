import { describe, expect, test, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import path from 'node:path';

import { createContractApp } from '../helpers/contract-harness.js';

let consoleErrSpy;
let consoleLogSpy;
beforeAll(() => {
  consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  consoleErrSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

beforeEach(() => { jest.resetModules(); });

const STATIC_ROUTES = [
  { path: '/dashboard/test', expectedFile: 'dashboard-v2.html' },
  { path: '/lead-import.html', expectedFile: 'lead-import.html' },
  { path: '/leads', expectedFile: 'leads.html' },
  { path: '/lead-testing-dashboard', expectedFile: 'leads.html' },
  { path: '/settings/test', expectedFile: 'settings.html' },
  { path: '/privacy.html', expectedFile: 'privacy.html' },
  { path: '/privacy', expectedFile: 'privacy.html' },
  { path: '/zapier-docs.html', expectedFile: 'zapier-docs.html' },
  { path: '/zapier', expectedFile: 'zapier-docs.html' }
];

describe('routes/portal-pages-mount static page handlers', () => {
  test.each(STATIC_ROUTES)('GET $path serves $expectedFile', async ({ path: routePath, expectedFile }) => {
    const { createPortalPagesRouter } = await import('../../routes/portal-pages-mount.js');
    // Use a minimal Express app so we can intercept res.sendFile via a spy.
    // We replace `res.sendFile` on the response object via a router-level middleware.
    const app = createContractApp({
      mounts: [
        {
          path: '/',
          router: () => {
            const router = createPortalPagesRouter();
            // Intercept sendFile calls inside the router stack
            return (req, res, next) => {
              const origSendFile = res.sendFile.bind(res);
              res.sendFile = (file, opts) => {
                res.set('X-Sent-File', file);
                res.set('X-Sent-Root', opts?.root || '');
                res.status(200).send(`served:${file}`);
              };
              router(req, res, next);
              // restore not strictly needed since response is sent
              void origSendFile;
            };
          }
        }
      ]
    });

    const res = await request(app).get(routePath).expect(200);
    expect(res.headers['x-sent-file']).toBe(`public/${expectedFile}`);
    expect(res.headers['x-sent-root']).toBe('.');
    expect(res.text).toBe(`served:public/${expectedFile}`);
  });

  test('GET /unknown-page returns 404 (no route match)', async () => {
    const { createPortalPagesRouter } = await import('../../routes/portal-pages-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPortalPagesRouter() }]
    });
    await request(app).get('/this-page-does-not-exist').expect(404);
  });
});

describe('routes/portal-pages-mount /complete-setup', () => {
  test('200 reports per-statement results when all ALTERs/CREATEs succeed', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('information_schema.columns')) {
        return { rows: [{ column_name: 'id', data_type: 'integer' }] };
      }
      return { rowCount: 0 };
    });
    jest.unstable_mockModule('../../db.js', () => ({ query }));
    const { createPortalPagesRouter } = await import('../../routes/portal-pages-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPortalPagesRouter() }]
    });
    const res = await request(app).get('/complete-setup').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      success: true,
      message: expect.stringContaining('Database setup complete'),
      results: expect.any(Array),
      columns: [{ column_name: 'id', data_type: 'integer' }]
    }));
    // 11 individual alter/create statements + 1 verification
    expect(query).toHaveBeenCalledTimes(12);
  });

  test('200 captures per-statement failures into results without aborting', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('email TEXT')) throw new Error('email column existed');
      if (s.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'phone', data_type: 'text' }] };
      }
      return { rowCount: 0 };
    });
    jest.unstable_mockModule('../../db.js', () => ({ query }));
    const { createPortalPagesRouter } = await import('../../routes/portal-pages-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPortalPagesRouter() }]
    });
    const res = await request(app).get('/complete-setup').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results.some((r) => /Email column.*existed/.test(r))).toBe(true);
  });

  test('500 when verification query throws', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('information_schema.columns')) throw new Error('verification fail');
      return { rowCount: 0 };
    });
    jest.unstable_mockModule('../../db.js', () => ({ query }));
    const { createPortalPagesRouter } = await import('../../routes/portal-pages-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPortalPagesRouter() }]
    });
    const res = await request(app).get('/complete-setup').expect(500);
    expect(res.body).toEqual({
      success: false,
      error: 'Setup failed',
      details: 'verification fail'
    });
  });
});
