// tests/unit/lib/outbound-ab-stop-slice.test.js

import { describe, test, expect } from '@jest/globals';
import { activeRowsMatchOutboundAbStopSlice } from '../../../lib/outbound-ab-stop-slice.js';

describe('outbound-ab-stop-slice', () => {
  test('voice dimensional: control empty JSON, challenger has voice', () => {
    const rows = [
      { variant_name: 'control', variant_config: {} },
      { variant_name: 'variant_b', variant_config: { voice: 'SDAS' } }
    ];
    expect(activeRowsMatchOutboundAbStopSlice(rows, 'voice')).toBe(true);
  });

  test('voice: control with voice but challenger empty is neither dimensional nor legacy-all-voice', () => {
    const rows = [
      { variant_name: 'control', variant_config: { voice: 'a' } },
      { variant_name: 'variant_b', variant_config: {} }
    ];
    expect(activeRowsMatchOutboundAbStopSlice(rows, 'voice')).toBe(false);
  });

  test('voice legacy: every variant has voice only', () => {
    const rows = [
      { variant_name: 'control', variant_config: { voice: 'a' } },
      { variant_name: 'variant_b', variant_config: { voice: 'b' } }
    ];
    expect(activeRowsMatchOutboundAbStopSlice(rows, 'voice')).toBe(true);
  });

  test('opening dimensional', () => {
    const rows = [
      { variant_name: 'control', variant_config: {} },
      { variant_name: 'variant_b', variant_config: { firstMessage: 'Hi' } }
    ];
    expect(activeRowsMatchOutboundAbStopSlice(rows, 'opening')).toBe(true);
  });

  test('script dimensional', () => {
    const rows = [
      { variant_name: 'control', variant_config: {} },
      { variant_name: 'variant_b', variant_config: { systemMessage: 'You are…' } }
    ];
    expect(activeRowsMatchOutboundAbStopSlice(rows, 'script')).toBe(true);
  });
});
