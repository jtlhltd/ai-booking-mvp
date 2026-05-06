import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/dashboard-ui-formatters', () => {
  let mod;

  beforeEach(async () => {
    jest.resetModules();
    mod = await import('../../../lib/dashboard-ui-formatters.js');
  });

  test('formatGBP', () => {
    expect(mod.formatGBP(1234)).toMatch(/£/);
  });

  test('formatTimeAgoLabel handles blank and ranges', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-01T12:00:00Z').getTime());
    try {
      expect(mod.formatTimeAgoLabel(null)).toBe('Just now');
      expect(mod.formatTimeAgoLabel(new Date('2026-01-01T11:59:30Z').toISOString())).toBe('Just now');
      expect(mod.formatTimeAgoLabel(new Date('2026-01-01T11:30:00Z').toISOString())).toBe('30 min ago');
      expect(mod.formatTimeAgoLabel(new Date('2026-01-01T10:00:00Z').toISOString())).toBe('2h ago');
      expect(mod.formatTimeAgoLabel(new Date('2025-12-30T12:00:00Z').toISOString())).toBe('2d ago');
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('activityFeedChannelLabel detects sms config', () => {
    expect(mod.activityFeedChannelLabel({ sms: { fromNumber: '+1' } })).toBe('AI call + SMS');
    expect(mod.activityFeedChannelLabel({ sms: {} })).toBe('AI call');
  });

  test('mapCallStatus', () => {
    expect(mod.mapCallStatus('BOOKING_DONE')).toBe('Booked');
    expect(mod.mapCallStatus('completed')).toBe('Completed');
    expect(mod.mapCallStatus('pending outbound')).toBe('Awaiting reply');
    expect(mod.mapCallStatus('initiated')).toBe('In progress');
    expect(mod.mapCallStatus('')).toBe('Live');
  });

  test('formatCallDuration', () => {
    expect(mod.formatCallDuration(null)).toBeNull();
    expect(mod.formatCallDuration(45)).toBe('45s');
    expect(mod.formatCallDuration(125)).toBe('2m 5s');
    expect(mod.formatCallDuration(120)).toBe('2m');
  });

  test('truncateActivityFeedText', () => {
    expect(mod.truncateActivityFeedText('  a\nb  ', 10)).toBe('a b');
    expect(mod.truncateActivityFeedText('x'.repeat(300), 10)).toMatch(/…$/);
  });

  test('parseCallsRowMetadata', () => {
    expect(mod.parseCallsRowMetadata(undefined)).toBeNull();
    expect(mod.parseCallsRowMetadata({ a: 1 })).toEqual({ a: 1 });
    expect(mod.parseCallsRowMetadata('{"z":1}')).toEqual({ z: 1 });
    expect(mod.parseCallsRowMetadata('{')).toBeNull();
  });

  test('isCallQueueStartFailureRow', () => {
    expect(mod.isCallQueueStartFailureRow({ call_id: 'failed_q9' })).toBe(true);
    expect(
      mod.isCallQueueStartFailureRow({
        outcome: 'failed',
        metadata: JSON.stringify({ fromQueue: true })
      })
    ).toBe(true);
    expect(mod.isCallQueueStartFailureRow({ call_id: 'vapi_1', outcome: 'failed' })).toBe(false);
  });

  test('formatVapiEndedReasonDisplay tokenizes', () => {
    expect(mod.formatVapiEndedReasonDisplay('foo-bar_baz')).toMatch(/Foo Bar Baz/);
  });

  test('inferCallEndedByFromVapiReason branches', () => {
    expect(mod.inferCallEndedByFromVapiReason(null).callEndedBy).toBe('unknown');
    expect(mod.inferCallEndedByFromVapiReason('assistant-ended-call').callEndedBy).toBe('assistant');
    expect(mod.inferCallEndedByFromVapiReason('customer-ended-call').callEndedBy).toBe('customer');
    expect(mod.inferCallEndedByFromVapiReason('silence-timed-out').callEndedBy).toBe('system');
    expect(mod.inferCallEndedByFromVapiReason('customer-busy').callEndedBy).toBe('unknown');
    expect(mod.inferCallEndedByFromVapiReason('vonage-completed').callEndedBy).toBe('unknown');
  });

  test('endedReasonFromCallRow', () => {
    expect(mod.endedReasonFromCallRow({ metadata: JSON.stringify({ endedReason: 'x' }) })).toBe('x');
    expect(mod.endedReasonFromCallRow({})).toBeNull();
  });

  test('outcomeToFriendlyLabel', () => {
    expect(mod.outcomeToFriendlyLabel('no-answer')).toBe('No answer');
    expect(mod.outcomeToFriendlyLabel('booked')).toBe('Booked');
    expect(mod.outcomeToFriendlyLabel('foo-bar')).toBe('foo bar');
  });

  test('inferTimelinePickupStatus key branches', () => {
    expect(mod.inferTimelinePickupStatus({ outcome: 'no-answer' }).status).toBe('no');
    expect(mod.inferTimelinePickupStatus({ outcome: 'booked' }).status).toBe('yes');
    expect(
      mod.inferTimelinePickupStatus({
        status: 'failed'
      }).status
    ).toBe('no');
    expect(mod.inferTimelinePickupStatus({}).status).toBe('unknown');
  });

  test('inferTimelinePickupStatus initiated + duration', () => {
    expect(
      mod.inferTimelinePickupStatus({
        status: 'initiated',
        duration: 20,
        created_at: new Date().toISOString()
      }).status
    ).toBe('yes');
    expect(
      mod.inferTimelinePickupStatus({
        status: 'ended',
        duration: 20
      }).status
    ).toBe('yes');
  });

  test('mapStatusClass', () => {
    expect(mod.mapStatusClass('booked')).toBe('success');
    expect(mod.mapStatusClass('pending')).toBe('pending');
    expect(mod.mapStatusClass('x')).toBe('info');
  });

  test('resolveLogisticsSpreadsheetId', () => {
    expect(mod.resolveLogisticsSpreadsheetId(null)).toBe(process.env.LOGISTICS_SHEET_ID || null);
    expect(
      mod.resolveLogisticsSpreadsheetId({
        vapi_json: { logisticsSheetId: 'sh1' }
      })
    ).toBe('sh1');
  });

  test('trimEnvDashboard and parseDashboardPrivacyBullets', async () => {
    const prev = process.env.DASHBOARD_PRIVACY_BULLETS;
    process.env.DASHBOARD_PRIVACY_BULLETS = ' a | b ';
    try {
      jest.resetModules();
      const m = await import('../../../lib/dashboard-ui-formatters.js');
      expect(m.parseDashboardPrivacyBullets()).toEqual(['a', 'b']);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_PRIVACY_BULLETS;
      else process.env.DASHBOARD_PRIVACY_BULLETS = prev;
    }
  });

  test('buildDashboardExperience shapes integrations', async () => {
    const prevTwilio = [process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN];
    process.env.TWILIO_ACCOUNT_SID = 'AC';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    try {
      jest.resetModules();
      const { buildDashboardExperience } = await import('../../../lib/dashboard-ui-formatters.js');
      const exp = buildDashboardExperience(
        {
          vapiAssistantId: 'asst',
          vapi: { logisticsSheetId: 'sh' }
        },
        null
      );
      expect(exp.integrations.map((i) => i.id)).toEqual(['voice', 'google_sheets', 'sms']);
      expect(exp.integrations[2].ok).toBe(true);
    } finally {
      if (prevTwilio[0] === undefined) delete process.env.TWILIO_ACCOUNT_SID;
      else process.env.TWILIO_ACCOUNT_SID = prevTwilio[0];
      if (prevTwilio[1] === undefined) delete process.env.TWILIO_AUTH_TOKEN;
      else process.env.TWILIO_AUTH_TOKEN = prevTwilio[1];
    }
  });

  test('adjustColorBrightness', () => {
    expect(mod.adjustColorBrightness('#112233', 10)).toMatch(/^#/);
  });
});
