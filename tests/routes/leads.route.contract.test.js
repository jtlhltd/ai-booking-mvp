import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

const tenantsFindByKey = jest.fn(async () => ({ id: 1, key: 'c1', gsheet_id: 'sheet1' }));
const leadsFindByComposite = jest.fn(async () => null);
const leadsCreate = jest.fn(async () => ({ id: 9, status: 'pending', phone: '+447700900123' }));
const leadsUpdateSheetRowId = jest.fn(async () => {});

jest.unstable_mockModule('../../store.js', () => ({
  tenants: { findByKey: tenantsFindByKey },
  leads: {
    findByComposite: leadsFindByComposite,
    create: leadsCreate,
    updateSheetRowId: leadsUpdateSheetRowId,
  },
}));

const appendLead = jest.fn(async () => ({ rowNumber: 12 }));
jest.unstable_mockModule('../../sheets.js', () => ({
  appendLead,
}));

describe('routes/leads.js contracts', () => {
  beforeEach(() => {
    tenantsFindByKey.mockReset().mockResolvedValue({ id: 1, key: 'c1', gsheet_id: 'sheet1' });
    leadsFindByComposite.mockReset().mockResolvedValue(null);
    leadsCreate.mockReset().mockResolvedValue({ id: 9, status: 'pending', phone: '+447700900123' });
    leadsUpdateSheetRowId.mockReset().mockResolvedValue(undefined);
    appendLead.mockReset().mockResolvedValue({ rowNumber: 12 });
  });

  test('failure: POST /api/leads returns 401 without API key', async () => {
    process.env.API_KEY = 'secret';
    const { default: router } = await import('../../routes/leads.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    await request(app)
      .post('/api/leads')
      .set('X-Client-Key', 'c1')
      .send({ service: 'cut', lead: { name: 'A', phone: '+447700900123' } })
      .expect(401);
  });

  test('failure: POST /api/leads returns 400 on invalid payload', async () => {
    process.env.API_KEY = 'secret';
    const { default: router } = await import('../../routes/leads.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    await request(app)
      .post('/api/leads')
      .set('X-API-Key', 'secret')
      .set('X-Client-Key', 'c1')
      .send({ service: 'cut', lead: { name: 'A' } })
      .expect(400);
  });

  test('happy: POST /api/leads creates lead and appends to sheet', async () => {
    process.env.API_KEY = 'secret';
    process.env.VAPI_PRIVATE_KEY = ''; // prevent callVapi
    const { default: router } = await import('../../routes/leads.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    const res = await request(app)
      .post('/api/leads')
      .set('X-API-Key', 'secret')
      .set('X-Client-Key', 'c1')
      .send({ service: 'cut', lead: { name: 'A', phone: '+447700900123' } })
      .expect(201);

    expect(res.body).toEqual(expect.objectContaining({ ok: true, leadId: 9 }));
    expect(leadsCreate).toHaveBeenCalled();
    expect(appendLead).toHaveBeenCalled();
    expect(leadsUpdateSheetRowId).toHaveBeenCalled();
  });
});

