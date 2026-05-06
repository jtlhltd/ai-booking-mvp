import { describe, expect, test, jest } from '@jest/globals';

describe('lib/vapi-timeline-snapshot', () => {
  test('mapVapiEndedReasonToTimelineOutcome maps carrier outcomes', async () => {
    const { mapVapiEndedReasonToTimelineOutcome } = await import(
      '../../../lib/vapi-timeline-snapshot.js'
    );
    expect(mapVapiEndedReasonToTimelineOutcome(null)).toBeNull();
    expect(mapVapiEndedReasonToTimelineOutcome('customer-did-not-answer')).toBe('no-answer');
    expect(mapVapiEndedReasonToTimelineOutcome('assistant-ended-call')).toBe('completed');
    expect(mapVapiEndedReasonToTimelineOutcome('silence-timed-out')).toBe('completed');
    expect(mapVapiEndedReasonToTimelineOutcome('vonage-error')).toBe('failed');
  });

  test('flattenVapiGetCallPayload merges nested call + artifact', async () => {
    const { flattenVapiGetCallPayload } = await import('../../../lib/vapi-timeline-snapshot.js');
    expect(flattenVapiGetCallPayload(null)).toEqual({});
    expect(
      flattenVapiGetCallPayload({
        duration: 5,
        artifact: { recordingUrl: 'https://x/rec', transcript: 'hi' }
      })
    ).toEqual(
      expect.objectContaining({
        duration: 5,
        recordingUrl: 'https://x/rec',
        transcript: 'hi'
      })
    );
  });

  test('messageContentToString handles strings arrays objects', async () => {
    const { messageContentToString } = await import('../../../lib/vapi-timeline-snapshot.js');
    expect(messageContentToString(null)).toBe('');
    expect(messageContentToString([{ text: 'a' }, { content: 'b' }])).toBe('a b');
    expect(messageContentToString(42)).toBe('42');
  });

  test('timelineVapiAuthKey prefers private key', async () => {
    const prev = process.env.VAPI_PRIVATE_KEY;
    process.env.VAPI_PRIVATE_KEY = 'pk';
    try {
      const { timelineVapiAuthKey } = await import('../../../lib/vapi-timeline-snapshot.js');
      expect(timelineVapiAuthKey()).toBe('pk');
    } finally {
      if (prev === undefined) delete process.env.VAPI_PRIVATE_KEY;
      else process.env.VAPI_PRIVATE_KEY = prev;
    }
  });

  test('fetchVapiCallSnapshotForTimeline returns null without key or short id', async () => {
    jest.resetModules();
    const { fetchVapiCallSnapshotForTimeline } = await import(
      '../../../lib/vapi-timeline-snapshot.js'
    );
    expect(await fetchVapiCallSnapshotForTimeline('short')).toBeNull();
  });

  test('fetchVapiCallSnapshotForTimeline parses JSON on ok', async () => {
    jest.resetModules();
    const prev = process.env.VAPI_PRIVATE_KEY;
    process.env.VAPI_PRIVATE_KEY = 'test-key-xxxxxxxx';
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'call1', duration: 10 })
    }));
    global.fetch = fetchMock;
    try {
      const { fetchVapiCallSnapshotForTimeline } = await import(
        '../../../lib/vapi-timeline-snapshot.js'
      );
      const out = await fetchVapiCallSnapshotForTimeline('12345678901');
      expect(out).toEqual({ id: 'call1', duration: 10 });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.vapi.ai/call/12345678901',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-key-xxxxxxxx' })
        })
      );
    } finally {
      if (prev === undefined) delete process.env.VAPI_PRIVATE_KEY;
      else process.env.VAPI_PRIVATE_KEY = prev;
      delete global.fetch;
    }
  });

  test('vapiCallSnapshotToTimelineHints derives outcome duration transcript', async () => {
    const { vapiCallSnapshotToTimelineHints } = await import(
      '../../../lib/vapi-timeline-snapshot.js'
    );
    expect(vapiCallSnapshotToTimelineHints(null)).toEqual({});
    const hints = vapiCallSnapshotToTimelineHints({
      endedReason: 'customer-did-not-answer',
      duration: 12,
      transcript: 'hello world '.repeat(20),
      recordingUrl: 'https://example.com/a.wav'
    });
    expect(hints.outcome).toBe('no-answer');
    expect(hints.duration).toBe(12);
    expect(hints.transcript_snippet).toBeTruthy();
    expect(hints.recording_url).toMatch(/^https:/);
  });
});
