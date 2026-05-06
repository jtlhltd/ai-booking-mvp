import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/email-alert-outbox', () => {
  const query = jest.fn();
  const sendEmail = jest.fn(async () => ({ success: true }));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    sendEmail.mockResolvedValue({ success: true });
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: { sendEmail }
    }));
  });

  test('enqueueEmailAlert skips when DISABLE_OPERATOR_EMAIL_ALERTS', async () => {
    const prev = process.env.DISABLE_OPERATOR_EMAIL_ALERTS;
    process.env.DISABLE_OPERATOR_EMAIL_ALERTS = '1';
    try {
      const { enqueueEmailAlert } = await import('../../../lib/email-alert-outbox.js');
      const r = await enqueueEmailAlert({
        clientKey: 'c',
        fingerprint: 'f',
        to: 'a@b.com',
        subject: 's',
        body: 'b'
      });
      expect(r.skipped).toBe(true);
      expect(query).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.DISABLE_OPERATOR_EMAIL_ALERTS;
      else process.env.DISABLE_OPERATOR_EMAIL_ALERTS = prev;
    }
  });

  test('enqueueEmailAlert rejects invalid args', async () => {
    const { enqueueEmailAlert } = await import('../../../lib/email-alert-outbox.js');
    const r = await enqueueEmailAlert({
      clientKey: '',
      fingerprint: 'f',
      to: 'a@b.com',
      subject: 's',
      body: 'b'
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_args');
  });

  test('enqueueEmailAlert dedupes when pending exists', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    const { enqueueEmailAlert } = await import('../../../lib/email-alert-outbox.js');
    const r = await enqueueEmailAlert({
      clientKey: 'c1',
      fingerprint: 'fp',
      to: 'a@b.com',
      subject: 'sub',
      body: 'hello'
    });
    expect(r.deduped).toBe(true);
    expect(r.id).toBe(99);
  });

  test('enqueueEmailAlert inserts when no dedupe', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const { enqueueEmailAlert } = await import('../../../lib/email-alert-outbox.js');
    const r = await enqueueEmailAlert({
      clientKey: 'c1',
      fingerprint: 'fp',
      to: 'a@b.com',
      subject: 'sub',
      body: 'hello'
    });
    expect(r.queued).toBe(true);
    expect(r.id).toBe(7);
  });

  test('processEmailAlertOutbox returns early when disabled', async () => {
    const prev = process.env.DISABLE_OPERATOR_EMAIL_ALERTS;
    process.env.DISABLE_OPERATOR_EMAIL_ALERTS = 'true';
    query.mockResolvedValue({ rowCount: 2 });
    try {
      const { processEmailAlertOutbox } = await import('../../../lib/email-alert-outbox.js');
      const r = await processEmailAlertOutbox({ limit: 5 });
      expect(r.skipped).toBe(true);
      expect(r.processed).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.DISABLE_OPERATOR_EMAIL_ALERTS;
      else process.env.DISABLE_OPERATOR_EMAIL_ALERTS = prev;
    }
  });

  test('processEmailAlertOutbox sends email and completes row', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            retry_attempt: 1,
            retry_data: JSON.stringify({
              to: 'x@y.com',
              subject: 'S',
              body: 'B'
            })
          }
        ]
      })
      .mockResolvedValue({ rows: [] });

    const { processEmailAlertOutbox } = await import('../../../lib/email-alert-outbox.js');
    const r = await processEmailAlertOutbox({ limit: 5 });
    expect(r.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'x@y.com', subject: 'S', body: 'B' })
    );
  });
});
