import { describe, expect, test } from '@jest/globals';
import {
  pickVapiCallId,
  pickVapiEventType,
  deriveVapiEventId
} from '../../../lib/vapi-webhooks/webhook-ids.js';

describe('lib/vapi-webhooks/webhook-ids', () => {
  test('pickVapiCallId prefers nested shapes', () => {
    expect(pickVapiCallId({ call: { id: 'c1' } })).toBe('c1');
    expect(pickVapiCallId({ id: 'top' })).toBe('top');
    expect(pickVapiCallId({ callId: 'cid' })).toBe('cid');
    expect(pickVapiCallId({ message: { call: { id: 'mc' } } })).toBe('mc');
    expect(pickVapiCallId({ message: { callId: 'mci' } })).toBe('mci');
    expect(pickVapiCallId({})).toBeNull();
  });

  test('pickVapiEventType', () => {
    expect(pickVapiEventType({ message: { type: 'end-of-call-report' } })).toBe('end-of-call-report');
    expect(pickVapiEventType({ type: 'status' })).toBe('status');
    expect(pickVapiEventType({})).toBeNull();
  });

  test('deriveVapiEventId uses conversation-update message count', () => {
    const body = {
      message: {
        type: 'conversation-update',
        call: { id: 'x' },
        messages: [{}, {}, {}]
      }
    };
    expect(deriveVapiEventId(body)).toBe('x:conversation-update:3');
    const body2 = {
      message: {
        type: 'conversation-update',
        call: { id: 'x' },
        conversation: [1, 2]
      }
    };
    expect(deriveVapiEventId(body2)).toBe('x:conversation-update:2');
    const body3 = {
      message: { type: 'conversation-update', call: { id: 'x' } }
    };
    expect(deriveVapiEventId(body3)).toBe('x:conversation-update:0');
  });

  test('deriveVapiEventId non-conversation', () => {
    expect(deriveVapiEventId({ message: { type: 'end', call: { id: 'q' } } })).toBe('q:end');
    expect(deriveVapiEventId({})).toBe('no_call_id:unknown');
  });
});
