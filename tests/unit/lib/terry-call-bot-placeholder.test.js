import { describe, expect, test } from '@jest/globals';
import {
  TERRY_PLACEHOLDER_ASSISTANT_NAME,
  buildTerryPlaceholderAssistantPayload,
  findTerryPlaceholderAssistant,
} from '../../../lib/terry-call-bot-placeholder.js';

describe('terry-call-bot-placeholder', () => {
  test('buildTerryPlaceholderAssistantPayload includes webhook url and script', () => {
    const payload = buildTerryPlaceholderAssistantPayload({ publicBaseUrl: 'https://example.com' });
    expect(payload.name).toBe(TERRY_PLACEHOLDER_ASSISTANT_NAME);
    expect(payload.serverUrl).toBe('https://example.com/webhooks/vapi');
    expect(payload.firstMessage).toMatch(/Terry Foods/i);
    expect(payload.model.messages[0].content).toMatch(/marketing intel/i);
    expect(payload.artifactPlan?.structuredOutputIds?.length).toBeGreaterThan(0);
  });

  test('findTerryPlaceholderAssistant matches by name', () => {
    const found = findTerryPlaceholderAssistant([
      { id: 'a1', name: 'Other bot' },
      { id: 'a2', name: TERRY_PLACEHOLDER_ASSISTANT_NAME },
    ]);
    expect(found?.id).toBe('a2');
  });
});
