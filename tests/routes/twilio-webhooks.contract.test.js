import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

const mapToTenant = jest.fn(async () => ({ id: 't1', gsheet_id: 'sheet1' }));
const upsertOptout = jest.fn(async () => {});
const findOpenByPhone = jest.fn(async () => [{ id: 1, sheet_row_id: 10 }]);
const markOptedOut = jest.fn(async () => {});
const logAttempt = jest.fn(async () => {});
const updateLead = jest.fn(async () => {});

beforeEach(() => {
  mapToTenant.mockReset().mockResolvedValue({ id: 't1', gsheet_id: 'sheet1' });
  upsertOptout.mockReset().mockResolvedValue(undefined);
  findOpenByPhone.mockReset().mockResolvedValue([{ id: 1, sheet_row_id: 10 }]);
  markOptedOut.mockReset().mockResolvedValue(undefined);
  logAttempt.mockReset().mockResolvedValue(undefined);
  updateLead.mockReset().mockResolvedValue(undefined);
});

jest.unstable_mockModule('../../store.js', () => ({
  twilio: { mapToTenant },
  optouts: { upsert: upsertOptout },
  leads: { findOpenByPhone, markOptedOut },
  contactAttempts: { log: logAttempt }
}));

jest.unstable_mockModule('../../sheets.js', () => ({
  updateLead
}));

describe('Twilio SMS inbound webhook contracts', () => {
  test('unknown MessagingServiceSid yields 200 and does not mutate leads', async () => {
    mapToTenant.mockResolvedValueOnce(null);
    const { default: router } = await import('../../routes/twilio-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    await request(app)
      .post('/webhooks/twilio/sms-inbound')
      .send({
        From: '+447491683261',
        To: '+447403934440',
        Body: 'STOP',
        MessagingServiceSid: 'UNKNOWN_SID'
      })
      .expect(200);

    expect(mapToTenant).toHaveBeenCalled();
    expect(upsertOptout).not.toHaveBeenCalled();
    expect(findOpenByPhone).not.toHaveBeenCalled();
  });

  test('STOP opt-out updates leads + sheet', async () => {
    const { default: router } = await import('../../routes/twilio-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    await request(app)
      .post('/webhooks/twilio/sms-inbound')
      .send({
        From: '+447491683261',
        To: '+447403934440',
        Body: 'STOP',
        MessagingServiceSid: 'MG123'
      })
      .expect(200);

    expect(mapToTenant).toHaveBeenCalled();
    expect(upsertOptout).toHaveBeenCalled();
    expect(findOpenByPhone).toHaveBeenCalled();
    expect(markOptedOut).toHaveBeenCalled();
    expect(logAttempt).toHaveBeenCalled();
    expect(updateLead).toHaveBeenCalled();
  });

  test('YES yields 200 and does not mutate leads/optouts', async () => {
    const { default: router } = await import('../../routes/twilio-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    await request(app)
      .post('/webhooks/twilio/sms-inbound')
      .send({
        From: '+447491683261',
        To: '+447403934440',
        Body: 'YES',
        MessagingServiceSid: 'MG123'
      })
      .expect(200);

    expect(mapToTenant).toHaveBeenCalled();
    expect(upsertOptout).not.toHaveBeenCalled();
    expect(findOpenByPhone).not.toHaveBeenCalled();
    expect(markOptedOut).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
  });

  test('START yields 200 and does not mutate leads/optouts', async () => {
    const { default: router } = await import('../../routes/twilio-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }], json: true });

    await request(app)
      .post('/webhooks/twilio/sms-inbound')
      .send({
        From: '+447491683261',
        To: '+447403934440',
        Body: 'START',
        MessagingServiceSid: 'MG123'
      })
      .expect(200);

    expect(mapToTenant).toHaveBeenCalled();
    expect(upsertOptout).not.toHaveBeenCalled();
    expect(findOpenByPhone).not.toHaveBeenCalled();
    expect(markOptedOut).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
  });
});

