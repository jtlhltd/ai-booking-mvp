import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('sms-email-pipeline', () => {
  test('constructor starts retry scheduler but can be stopped', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    expect(typeof pipeline.stopRetryScheduler).toBe('function');
    pipeline.stopRetryScheduler();
  });

  test('getStats returns zeros with no leads', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    expect(pipeline.getStats()).toEqual(
      expect.objectContaining({
        totalLeads: 0,
        waitingForEmail: 0,
        emailReceived: 0,
        booked: 0,
        conversionRate: 0
      })
    );
  });

  test('getLeadStatus returns not found for unknown id', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    await expect(pipeline.getLeadStatus('missing')).resolves.toEqual({ found: false });
  });

  test('initiateLeadCapture succeeds without Twilio (SMS skipped)', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    const out = await pipeline.initiateLeadCapture({
      decisionMaker: 'Pat',
      phoneNumber: '+447700900123',
    });
    expect(out.success).toBe(true);
    expect(out.leadId).toMatch(/^lead_/);
    expect(pipeline.getStats().totalLeads).toBe(1);
  });

  test('getRetryDelay returns exponential backoff windows', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    expect(pipeline.getRetryDelay(1)).toBe(2 * 60 * 60 * 1000);
    expect(pipeline.getRetryDelay(2)).toBe(4 * 60 * 60 * 1000);
    expect(pipeline.getRetryDelay(99)).toBe(8 * 60 * 60 * 1000);
  });

  test('getLeadsNeedingAttention returns empty buckets with no leads', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    const out = pipeline.getLeadsNeedingAttention();
    expect(out.summary).toEqual({ stuckCount: 0, expiredCount: 0, retryScheduledCount: 0 });
  });

  test('processRetries invokes sendRetrySMS for eligible leads', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    const sendRetrySMS = jest.spyOn(pipeline, 'sendRetrySMS').mockResolvedValue();
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 86_400_000);
    pipeline.pendingLeads.set('lead_x', {
      decisionMaker: 'Pat',
      phoneNumber: '+447700900111',
      status: 'waiting_for_email',
      retryCount: 0,
      nextRetryAt: past,
      expiresAt: future,
      lastSmsSent: past,
    });
    await pipeline.processRetries();
    expect(sendRetrySMS).toHaveBeenCalled();
    sendRetrySMS.mockRestore();
  });

  test('processEmailResponse returns not found when phone has no pending lead', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    const r = await pipeline.processEmailResponse('+447700900000', 'x@y.com');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/No pending lead/);
  });

  test('processEmailResponse confirms email path when lead exists', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    const sendConfirmationEmail = jest.spyOn(pipeline, 'sendConfirmationEmail').mockResolvedValue();
    const sendSMS = jest.spyOn(pipeline, 'sendSMS').mockResolvedValue();
    await pipeline.initiateLeadCapture({
      decisionMaker: 'Sam',
      phoneNumber: '+447700900888',
      businessName: 'Biz'
    });
    const r = await pipeline.processEmailResponse('+447700900888', 'sam@example.com');
    expect(r.success).toBe(true);
    expect(sendConfirmationEmail).toHaveBeenCalled();
    sendConfirmationEmail.mockRestore();
    sendSMS.mockRestore();
  });

  test('initiateLeadCapture returns failure when sendSMS throws', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    jest.spyOn(pipeline, 'sendSMS').mockRejectedValueOnce(new Error('twilio down'));
    const out = await pipeline.initiateLeadCapture({
      decisionMaker: 'Pat',
      phoneNumber: '+447700900777'
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/twilio down/);
    expect(pipeline.pendingLeads.size).toBe(1);
  });

  test('cleanupExpiredLeads removes expired pending leads', async () => {
    jest.useFakeTimers();
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    await pipeline.initiateLeadCapture({
      decisionMaker: 'Pat',
      phoneNumber: '+447700900456',
    });
    const [leadId] = [...pipeline.pendingLeads.keys()];
    const lead = pipeline.pendingLeads.get(leadId);
    lead.expiresAt = new Date(Date.now() - 1000);
    const n = await pipeline.cleanupExpiredLeads();
    expect(n).toBe(1);
    expect(pipeline.pendingLeads.has(leadId)).toBe(false);
  });
});

