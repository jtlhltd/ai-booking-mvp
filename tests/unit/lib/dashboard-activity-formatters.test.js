import { describe, expect, test } from '@jest/globals';

import {
  DASHBOARD_ACTIVITY_TZ,
  formatGBP,
  formatTimeAgoLabel,
  activityFeedChannelLabel,
  mapCallStatus,
  formatCallDuration,
  truncateActivityFeedText,
  parseCallsRowMetadata,
  isCallQueueStartFailureRow,
  formatVapiEndedReasonDisplay,
  inferCallEndedByFromVapiReason,
  endedReasonFromCallRow,
  outcomeToFriendlyLabel,
  inferTimelinePickupStatus,
  mapVapiEndedReasonToTimelineOutcome,
  flattenVapiGetCallPayload,
  messageContentToString,
  vapiCallSnapshotToTimelineHints,
  mapStatusClass
} from '../../../lib/dashboard-activity-formatters.js';

describe('lib/dashboard-activity-formatters', () => {
  test('DASHBOARD_ACTIVITY_TZ is Europe/London', () => {
    expect(DASHBOARD_ACTIVITY_TZ).toBe('Europe/London');
  });

  test('formatGBP renders integer GBP with no fractional digits', () => {
    expect(formatGBP(1234)).toMatch(/£1,234/);
    expect(formatGBP(0)).toMatch(/£0/);
    expect(formatGBP()).toMatch(/£0/);
  });

  test('formatTimeAgoLabel buckets minutes/hours/days', () => {
    expect(formatTimeAgoLabel(null)).toBe('Just now');
    const now = Date.now();
    expect(formatTimeAgoLabel(new Date(now - 30 * 1000).toISOString())).toBe('Just now');
    expect(formatTimeAgoLabel(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5 min ago');
    expect(formatTimeAgoLabel(new Date(now - 2 * 60 * 60 * 1000).toISOString())).toBe('2h ago');
    expect(formatTimeAgoLabel(new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString())).toBe('3d ago');
  });

  test('activityFeedChannelLabel reflects SMS configuration', () => {
    expect(activityFeedChannelLabel({})).toBe('AI call');
    expect(activityFeedChannelLabel({ sms: {} })).toBe('AI call');
    expect(activityFeedChannelLabel({ sms: { fromNumber: '+447700900000' } })).toBe('AI call + SMS');
    expect(activityFeedChannelLabel({ sms: { messagingServiceSid: 'MG…' } })).toBe('AI call + SMS');
  });

  test('mapCallStatus normalizes common statuses', () => {
    expect(mapCallStatus('Booked successfully')).toBe('Booked');
    expect(mapCallStatus('completed')).toBe('Completed');
    expect(mapCallStatus('ended')).toBe('Completed');
    expect(mapCallStatus('pending')).toBe('Awaiting reply');
    expect(mapCallStatus('missed')).toBe('Missed call');
    expect(mapCallStatus('initiated')).toBe('In progress');
    expect(mapCallStatus('')).toBe('Live');
    expect(mapCallStatus(null)).toBe('Live');
    expect(mapCallStatus('weird-thing')).toBe('weird-thing');
  });

  test('formatCallDuration handles null/invalid/seconds/minutes', () => {
    expect(formatCallDuration(null)).toBeNull();
    expect(formatCallDuration('')).toBeNull();
    expect(formatCallDuration('abc')).toBeNull();
    expect(formatCallDuration(-5)).toBeNull();
    expect(formatCallDuration(0)).toBe('0s');
    expect(formatCallDuration(45)).toBe('45s');
    expect(formatCallDuration(60)).toBe('1m');
    expect(formatCallDuration(125)).toBe('2m 5s');
  });

  test('truncateActivityFeedText collapses whitespace and truncates with ellipsis', () => {
    expect(truncateActivityFeedText('   hello   world  ')).toBe('hello world');
    expect(truncateActivityFeedText('')).toBe('');
    expect(truncateActivityFeedText(null)).toBe('');
    const long = 'a'.repeat(300);
    const out = truncateActivityFeedText(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
  });

  test('parseCallsRowMetadata handles JSON string, object, null, invalid', () => {
    expect(parseCallsRowMetadata(null)).toBeNull();
    expect(parseCallsRowMetadata('{"a":1}')).toEqual({ a: 1 });
    expect(parseCallsRowMetadata('not json')).toBeNull();
    expect(parseCallsRowMetadata({ b: 2 })).toEqual({ b: 2 });
    expect(parseCallsRowMetadata([1, 2])).toBeNull();
  });

  test('isCallQueueStartFailureRow detects synthetic failed-queue rows', () => {
    expect(isCallQueueStartFailureRow({ call_id: 'failed_q_abc', metadata: null })).toBe(true);
    expect(
      isCallQueueStartFailureRow({
        call_id: 'real-id',
        outcome: 'failed',
        metadata: '{"fromQueue":true}'
      })
    ).toBe(true);
    expect(
      isCallQueueStartFailureRow({ call_id: 'real-id', outcome: 'completed', metadata: null })
    ).toBe(false);
  });

  test('formatVapiEndedReasonDisplay normalizes camelCase + dashes + underscores', () => {
    expect(formatVapiEndedReasonDisplay('assistant-ended-call')).toBe('Assistant Ended Call');
    expect(formatVapiEndedReasonDisplay('customerDidNotAnswer')).toBe('Customer Did Not Answer');
    expect(formatVapiEndedReasonDisplay('silence_timed_out')).toBe('Silence Timed Out');
    expect(formatVapiEndedReasonDisplay('')).toBe('');
    expect(formatVapiEndedReasonDisplay(null)).toBe('');
  });

  test('inferCallEndedByFromVapiReason classifies ender', () => {
    expect(inferCallEndedByFromVapiReason('assistant-ended-call').callEndedBy).toBe('assistant');
    expect(inferCallEndedByFromVapiReason('customer-ended-call').callEndedBy).toBe('customer');
    expect(inferCallEndedByFromVapiReason('silence-timed-out').callEndedBy).toBe('system');
    expect(inferCallEndedByFromVapiReason('exceeded-max-duration').callEndedBy).toBe('system');
    expect(inferCallEndedByFromVapiReason('voicemail').callEndedBy).toBe('unknown');
    expect(inferCallEndedByFromVapiReason(null).callEndedBy).toBe('unknown');
  });

  test('endedReasonFromCallRow reads endedReason / endReason from metadata', () => {
    expect(endedReasonFromCallRow({ metadata: '{"endedReason":"voicemail"}' })).toBe('voicemail');
    expect(endedReasonFromCallRow({ metadata: { endReason: 'busy' } })).toBe('busy');
    expect(endedReasonFromCallRow({ metadata: null })).toBeNull();
    expect(endedReasonFromCallRow({})).toBeNull();
  });

  test('outcomeToFriendlyLabel maps common outcomes', () => {
    expect(outcomeToFriendlyLabel('no-answer')).toBe('No answer');
    expect(outcomeToFriendlyLabel('voicemail')).toBe('Voicemail');
    expect(outcomeToFriendlyLabel('busy')).toBe('Busy');
    expect(outcomeToFriendlyLabel('rejected')).toBe('Declined');
    expect(outcomeToFriendlyLabel('declined')).toBe('Declined');
    expect(outcomeToFriendlyLabel('failed')).toBe('Failed');
    expect(outcomeToFriendlyLabel('booked')).toBe('Booked');
    expect(outcomeToFriendlyLabel('completed')).toBe('Picked up');
    expect(outcomeToFriendlyLabel('weird-thing')).toBe('weird thing');
    expect(outcomeToFriendlyLabel(null)).toBeNull();
  });

  test('inferTimelinePickupStatus prefers outcome-based no-pickup', () => {
    expect(inferTimelinePickupStatus({ outcome: 'no-answer', status: 'ended' }).status).toBe('no');
    expect(inferTimelinePickupStatus({ outcome: 'voicemail', status: 'ended' }).status).toBe('no');
  });

  test('inferTimelinePickupStatus marks long ended calls as pickup', () => {
    const r = inferTimelinePickupStatus({ outcome: '', status: 'ended', duration: 30 });
    expect(r.status).toBe('yes');
  });

  test('inferTimelinePickupStatus uses sentiment as pickup signal on initiated rows', () => {
    const r = inferTimelinePickupStatus({
      outcome: '',
      status: 'initiated',
      sentiment: 'positive'
    });
    expect(r.status).toBe('yes');
  });

  test('inferTimelinePickupStatus marks fresh initiated rows as unknown', () => {
    const created = new Date().toISOString();
    const r = inferTimelinePickupStatus({ outcome: '', status: 'initiated', created_at: created });
    expect(r.status).toBe('unknown');
  });

  test('mapVapiEndedReasonToTimelineOutcome maps common reasons', () => {
    expect(mapVapiEndedReasonToTimelineOutcome('customer-did-not-answer')).toBe('no-answer');
    expect(mapVapiEndedReasonToTimelineOutcome('voicemail')).toBe('voicemail');
    expect(mapVapiEndedReasonToTimelineOutcome('customer-busy')).toBe('busy');
    expect(mapVapiEndedReasonToTimelineOutcome('rejected')).toBe('declined');
    expect(mapVapiEndedReasonToTimelineOutcome('assistant-ended-call')).toBe('completed');
    expect(mapVapiEndedReasonToTimelineOutcome('error')).toBe('failed');
    expect(mapVapiEndedReasonToTimelineOutcome(null)).toBeNull();
  });

  test('flattenVapiGetCallPayload merges nested call + artifact', () => {
    const out = flattenVapiGetCallPayload({
      id: 'A',
      call: { phoneNumber: '+1', endedReason: 'voicemail' },
      artifact: {
        recordingUrl: 'https://example.com/rec.mp3',
        transcript: 'hello'
      }
    });
    expect(out.id).toBe('A');
    expect(out.phoneNumber).toBe('+1');
    expect(out.endedReason).toBe('voicemail');
    expect(out.recordingUrl).toBe('https://example.com/rec.mp3');
    expect(out.transcript).toBe('hello');
  });

  test('messageContentToString handles strings, arrays, primitives', () => {
    expect(messageContentToString(null)).toBe('');
    expect(messageContentToString('hello')).toBe('hello');
    expect(messageContentToString([{ text: 'a' }, { content: 'b' }, 'c'])).toBe('a b c');
    expect(messageContentToString(42)).toBe('42');
  });

  test('vapiCallSnapshotToTimelineHints extracts duration and outcome from snapshot', () => {
    const out = vapiCallSnapshotToTimelineHints({
      duration: 30,
      endedReason: 'customer-did-not-answer',
      artifact: { recordingUrl: 'https://example.com/rec.mp3' }
    });
    expect(out.duration).toBe(30);
    expect(out.outcome).toBe('no-answer');
    expect(out.recording_url).toBe('https://example.com/rec.mp3');
  });

  test('vapiCallSnapshotToTimelineHints derives duration from startedAt/endedAt', () => {
    const startedAt = '2030-01-01T00:00:00Z';
    const endedAt = '2030-01-01T00:00:42Z';
    const out = vapiCallSnapshotToTimelineHints({ startedAt, endedAt });
    expect(out.duration).toBe(42);
  });

  test('vapiCallSnapshotToTimelineHints skips system/script messages when building transcript', () => {
    const out = vapiCallSnapshotToTimelineHints({
      messages: [
        { role: 'system', content: 'TOOLS: hidden' },
        { role: 'user', content: 'Hi there' },
        { role: 'assistant', content: 'CRITICAL: hidden' },
        { role: 'assistant', content: 'Hello!' }
      ]
    });
    expect(out.transcript_snippet).toContain('Hi there');
    expect(out.transcript_snippet).toContain('Hello!');
    expect(out.transcript_snippet).not.toContain('TOOLS');
    expect(out.transcript_snippet).not.toContain('CRITICAL');
  });

  test('mapStatusClass labels success / pending / info', () => {
    expect(mapStatusClass('Booked')).toBe('success');
    expect(mapStatusClass('Awaiting reply')).toBe('pending');
    expect(mapStatusClass('pending')).toBe('pending');
    expect(mapStatusClass('Anything else')).toBe('info');
  });
});
