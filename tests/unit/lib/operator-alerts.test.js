import { describe, test, beforeEach, afterEach, jest } from '@jest/globals';
import assert from 'assert';

describe('operator-alerts', () => {
  let sendOperatorAlert;
  let getOperatorInboxEmail;

  beforeEach(async () => {
    jest.resetModules();
    process.env.YOUR_EMAIL = 'ops@example.com';
    const mod = await import('../../../lib/operator-alerts.js');
    sendOperatorAlert = mod.sendOperatorAlert;
    getOperatorInboxEmail = mod.getOperatorInboxEmail;
  });

  afterEach(() => {
    delete process.env.YOUR_EMAIL;
  });

  test('getOperatorInboxEmail reads YOUR_EMAIL', () => {
    assert.strictEqual(getOperatorInboxEmail(), 'ops@example.com');
  });

  test('sendOperatorAlert returns no_your_email when unset', async () => {
    delete process.env.YOUR_EMAIL;
    jest.resetModules();
    const { sendOperatorAlert: send } = await import('../../../lib/operator-alerts.js');
    const r = await send({ subject: 'x', html: '<p>y</p>' });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, 'no_your_email');
  });
});
