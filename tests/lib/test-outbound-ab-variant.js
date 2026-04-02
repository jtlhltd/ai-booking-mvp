// tests/lib/test-outbound-ab-variant.js

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  buildAssistantOverridesFromVariantConfig,
  mergeAssistantOverrides
} from '../../lib/outbound-ab-variant.js';

resetStats();

describe('outbound-ab-variant', () => {
  test('buildAssistantOverrides maps voice string and firstMessage and script', () => {
    const { overrides } = buildAssistantOverridesFromVariantConfig({
      firstMessage: 'Hi there',
      script: 'You are a test assistant.',
      voice: 'voice-id-123'
    });
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

  test('buildAssistantOverrides ignores non-AB fields like assistantId', () => {
    const { overrides } = buildAssistantOverridesFromVariantConfig({
      assistantId: 'asst_ignored',
      vapiAssistantId: 'asst_ignored2',
      variableValues: { x: 'y' },
      model: { temperature: 0.99 }
    });
    assertEqual(Object.keys(overrides).length, 0);
  });

  test('buildAssistantOverrides voice dimension ignores opening and script', () => {
    const { overrides } = buildAssistantOverridesFromVariantConfig(
      {
        firstMessage: 'Hi',
        script: 'Full script.',
        voice: 'vid'
      },
      'voice'
    );
    assertEqual(overrides.voice && overrides.voice.voiceId, 'vid');
    assertEqual(overrides.firstMessage, undefined);
    assertEqual(overrides.model, undefined);
  });

  test('buildAssistantOverrides script dimension ignores voice and opening', () => {
    const { overrides } = buildAssistantOverridesFromVariantConfig(
      {
        firstMessage: 'Hi',
        script: 'Only this',
        voice: 'vid'
      },
      'script'
    );
    assertEqual(overrides.voice, undefined);
    assertEqual(overrides.firstMessage, undefined);
    assertEqual(overrides.model.messages[0].content, 'Only this');
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
