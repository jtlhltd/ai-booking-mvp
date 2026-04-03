// tests/lib/test-outbound-ab-focus.js

import { describe, test, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  resolveOutboundAbDimensionsForDial,
  outboundAbDialWarning,
  vapiPatchAfterStopOutboundAbDimension
} from '../../lib/outbound-ab-focus.js';

resetStats();

describe('outbound-ab-focus', () => {
  test('single configured dimension applies without focus', () => {
    const r = resolveOutboundAbDimensionsForDial({
      voiceExp: 'exp_v',
      openingExp: '',
      scriptExp: '',
      focusDimension: ''
    });
    assertEqual(r.length, 1);
    assertEqual(r[0][0], 'voice');
    assertEqual(r[0][1], 'exp_v');
  });

  test('multiple dimensions require focus', () => {
    const r = resolveOutboundAbDimensionsForDial({
      voiceExp: 'a',
      openingExp: 'b',
      scriptExp: '',
      focusDimension: ''
    });
    assertEqual(r.length, 0);
  });

  test('multiple dimensions with focus applies only that arm', () => {
    const r = resolveOutboundAbDimensionsForDial({
      voiceExp: 'a',
      openingExp: 'b',
      scriptExp: 'c',
      focusDimension: 'opening'
    });
    assertEqual(r.length, 1);
    assertEqual(r[0][0], 'opening');
    assertEqual(r[0][1], 'b');
  });

  test('dialWarning null when single arm', () => {
    assertEqual(
      outboundAbDialWarning({
        voiceExp: 'x',
        openingExp: '',
        scriptExp: '',
        focusDimension: ''
      }),
      null
    );
  });

  test('dialWarning when multiple and no focus', () => {
    const w = outboundAbDialWarning({
      voiceExp: 'a',
      openingExp: 'b',
      scriptExp: '',
      focusDimension: ''
    });
    assertEqual(w != null && w.length > 10, true);
  });

  test('vapiPatchAfterStop clears slot and refocuses when focus was stopped dim', () => {
    const p = vapiPatchAfterStopOutboundAbDimension(
      {
        outboundAbVoiceExperiment: 'ev',
        outboundAbOpeningExperiment: 'eo',
        outboundAbScriptExperiment: '',
        outboundAbFocusDimension: 'voice'
      },
      'voice'
    );
    assertEqual(p.outboundAbVoiceExperiment, '');
    assertEqual(p.outboundAbOpeningExperiment, undefined);
    assertEqual(p.outboundAbFocusDimension, 'opening');
  });

  test('vapiPatchAfterStop keeps focus when still valid', () => {
    const p = vapiPatchAfterStopOutboundAbDimension(
      {
        outboundAbVoiceExperiment: 'ev',
        outboundAbOpeningExperiment: 'eo',
        outboundAbFocusDimension: 'opening'
      },
      'voice'
    );
    assertEqual(p.outboundAbVoiceExperiment, '');
    assertEqual(p.outboundAbFocusDimension, 'opening');
  });

  test('vapiPatchAfterStop last dim clears focus', () => {
    const p = vapiPatchAfterStopOutboundAbDimension(
      {
        outboundAbVoiceExperiment: 'ev',
        outboundAbOpeningExperiment: '',
        outboundAbScriptExperiment: '',
        outboundAbFocusDimension: 'voice'
      },
      'voice'
    );
    assertEqual(p.outboundAbVoiceExperiment, '');
    assertEqual(p.outboundAbFocusDimension, '');
  });
});

const exitCode = printSummary();
process.exit(exitCode);
