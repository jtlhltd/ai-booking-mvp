// tests/unit/lib/elevenlabs-voice-id.test.js

import { describe, test, expect } from '@jest/globals';
import {
  validateElevenLabsVoiceIdForAb,
  normalizeElevenLabsVoiceId
} from '../../../lib/elevenlabs-voice-id.js';

describe('validateElevenLabsVoiceIdForAb', () => {
  test('accepts typical ElevenLabs id', () => {
    const r = validateElevenLabsVoiceIdForAb('21m00Tcm4TlvDq8ikWAM');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('21m00Tcm4TlvDq8ikWAM');
  });

  test('accepts compound-style id with slash', () => {
    const r = validateElevenLabsVoiceIdForAb('ZR8ruC9tbg/bV9RM8mC');
    expect(r.ok).toBe(true);
  });

  test('accepts UUID-style', () => {
    const r = validateElevenLabsVoiceIdForAb('f4c7e8a2-1234-5678-9012-abcdef123456');
    expect(r.ok).toBe(true);
  });

  test('rejects empty', () => {
    const r = validateElevenLabsVoiceIdForAb('  ');
    expect(r.ok).toBe(false);
  });

  test('rejects too short', () => {
    expect(validateElevenLabsVoiceIdForAb('DSD').ok).toBe(false);
    expect(validateElevenLabsVoiceIdForAb('123456789').ok).toBe(false);
  });

  test('rejects spaces and unicode', () => {
    expect(validateElevenLabsVoiceIdForAb('21m00Tcm4TlvDq8ikW AM').ok).toBe(false);
    expect(validateElevenLabsVoiceIdForAb('21m00Tcm4TlvDq8ikWAM\x00').ok).toBe(false);
  });

  test('normalize trims', () => {
    expect(normalizeElevenLabsVoiceId('  abcdefghij  ')).toBe('abcdefghij');
  });
});
