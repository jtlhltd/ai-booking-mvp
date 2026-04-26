import { describe, expect, test } from '@jest/globals';

describe('lib/outbound-ab-variant', () => {
  test('buildAssistantOverridesFromVariantConfig maps opening/script/voice and respects control slice', async () => {
    const { buildAssistantOverridesFromVariantConfig } = await import('../../../lib/outbound-ab-variant.js');

    const cfg = {
      firstMessage: 'hi',
      script: 'sys',
      voice: 'voice_1',
    };

    expect(buildAssistantOverridesFromVariantConfig(cfg).overrides).toEqual(
      expect.objectContaining({
        firstMessage: 'hi',
        voice: { provider: '11labs', voiceId: 'voice_1' },
        model: expect.objectContaining({ messages: [{ role: 'system', content: 'sys' }] }),
      }),
    );

    // control slice returns no overrides for that dimension
    expect(buildAssistantOverridesFromVariantConfig(cfg, 'voice', { variantName: 'control' })).toEqual({ overrides: {} });
  });

  test('mergeAssistantOverrides merges variableValues and prefers latest model/firstMessage', async () => {
    const { mergeAssistantOverrides } = await import('../../../lib/outbound-ab-variant.js');
    const out = mergeAssistantOverrides(
      { firstMessage: 'a', variableValues: { x: 1 }, model: { messages: [{ role: 'system', content: 'a' }] } },
      { firstMessage: 'b', variableValues: { y: 2 }, model: { messages: [{ role: 'system', content: 'b' }] } },
    );
    expect(out.firstMessage).toBe('b');
    expect(out.variableValues).toEqual({ x: 1, y: 2 });
    expect(out.model.messages[0].content).toBe('b');
  });
});

