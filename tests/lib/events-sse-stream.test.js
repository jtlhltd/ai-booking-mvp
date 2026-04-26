import { describe, test, expect, jest } from '@jest/globals';
import { handleEventsSseStream } from '../../lib/events-sse-stream.js';

describe('lib/events-sse-stream', () => {
  test('sets SSE headers and schedules polling', async () => {
    const written = [];
    const res = {
      set: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk) => {
        written.push(String(chunk));
      }),
      end: jest.fn()
    };
    const listeners = {};
    const req = {
      params: { clientKey: 'c1' },
      on: jest.fn((ev, fn) => {
        listeners[ev] = fn;
        return req;
      })
    };
    const query = jest.fn(async () => ({ rows: [] }));
    const deps = {
      query,
      getFullClient: jest.fn(async () => ({ sms: {} })),
      activityFeedChannelLabel: () => 'AI call',
      outcomeToFriendlyLabel: () => 'Booked',
      isCallQueueStartFailureRow: () => false,
      parseCallsRowMetadata: () => ({}),
      formatCallDuration: () => '1m',
      truncateActivityFeedText: (s) => s,
      mapCallStatus: (s) => s,
      mapStatusClass: () => 'info',
      ssePollIntervalMs: 5000,
      sseHeartbeatMs: 5000
    };

    await handleEventsSseStream(req, res, deps);

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive'
      })
    );
    expect(query).toHaveBeenCalled();
    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(req.on).toHaveBeenCalledWith('end', expect.any(Function));

    listeners.close?.();
    listeners.end?.();
  });
});
