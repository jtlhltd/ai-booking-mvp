// tests/lib/test-outbound-ab-variant.js

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  buildAssistantOverridesFromVariantConfig,
  mergeAssistantOverrides
} from '../../lib/outbound-ab-variant.js';

resetStats();

describe('outbound-ab-variant', () => {
  test('buildAssistantOverrides maps voice string and firstMessage and script', () => {
    const { overrides, assistantIdOverride } = buildAssistantOverridesFromVariantConfig({
      firstMessage: 'Hi there',
      script: 'You are a test assistant.',
      voice: 'voice-id-123'
    });
    assertEqual(assistantIdOverride, null);
    assertEqual(overrides.firstMessage, 'Hi there');
    assertEqual(overrides.voice.provider, '11labs');
    assertEqual(overrides.voice.voiceId, 'voice-id-123');
    assertTrue(Array.isArray(overrides.model.messages));
    assertEqual(overrides.model.messages[0].role, 'system');
    assertEqual(overrides.model.messages[0].content, 'You are a test assistant.');
  });

  test('buildAssistantOverrides prefers systemMessage over script', () => {
    const { overrides } = buildAssistantOverridesFromVariantConfig({
      systemMessage: 'A',
      script: 'B'
    });
    assertEqual(overrides.model.messages[0].content, 'A');
  });

  test('buildAssistantOverrides assistantId and vapiAssistantId', () => {
    const a = buildAssistantOverridesFromVariantConfig({ assistantId: 'asst_1' });
    assertEqual(a.assistantIdOverride, 'asst_1');
    const b = buildAssistantOverridesFromVariantConfig({ vapiAssistantId: 'asst_2' });
    assertEqual(b.assistantIdOverride, 'asst_2');
  });

  test('mergeAssistantOverrides merges variableValues and prefers AB model.messages', () => {
    const merged = mergeAssistantOverrides(
      { variableValues: { a: '1' }, model: { model: 'gpt-4o', temperature: 0.1 } },
      {
        variableValues: { b: '2' },
        model: { messages: [{ role: 'system', content: 'override' }] }
      }
    );
    assertEqual(merged.variableValues.a, '1');
    assertEqual(merged.variableValues.b, '2');
    assertEqual(merged.model.messages[0].content, 'override');
    assertEqual(merged.model.temperature, 0.1);
  });
});

const exitCode = printSummary();
process.exit(exitCode);
