import { describe, expect, test, beforeEach } from '@jest/globals';
import {
  formatMessagesToTranscript,
  markProcessed,
  processedCallIds,
  callStore
} from '../../../lib/vapi-webhooks/conversation-store.js';

describe('lib/vapi-webhooks/conversation-store', () => {
  beforeEach(() => {
    processedCallIds.clear();
    callStore.clear();
  });

  test('formatMessagesToTranscript filters roles and script markers', () => {
    expect(formatMessagesToTranscript([])).toBe('');
    expect(formatMessagesToTranscript(null)).toBe('');
    const msgs = [
      { role: 'user', content: 'Hello' },
      { role: 'system', content: 'ignore' },
      { role: 'assistant', content: 'TOOLS: secret' },
      { role: 'user', content: 'Real reply' }
    ];
    const t = formatMessagesToTranscript(msgs);
    expect(t).toContain('User: Real reply');
    expect(t).not.toContain('TOOLS:');
  });

  test('markProcessed evicts oldest when over 500', () => {
    for (let i = 0; i < 502; i++) {
      markProcessed(`id-${i}`);
    }
    expect(processedCallIds.size).toBe(500);
    expect(processedCallIds.has('id-0')).toBe(false);
    expect(processedCallIds.has('id-501')).toBe(true);
  });

  test('markProcessed no-op for falsy id', () => {
    const before = processedCallIds.size;
    markProcessed('');
    markProcessed(null);
    expect(processedCallIds.size).toBe(before);
  });
});
