import { describe, expect, test } from '@jest/globals';

describe('lib/vapi-improved-prompts', () => {
  test('getImprovedPrompt substitutes placeholders and falls back for unknown industry', async () => {
    const { getImprovedPrompt } = await import('../../../lib/vapi-improved-prompts.js');
    const out = getImprovedPrompt('Unknown Industry!!', {
      businessName: 'Acme',
      primaryService: 'Cleaning',
      leadName: 'Jo',
      price: '99'
    });
    expect(out.systemPrompt).toContain('Acme');
    expect(out.systemPrompt).toContain('Cleaning');
    expect(out.systemPrompt).toContain('Jo');
    expect(out.firstMessage).toContain('Acme');
  });

  test('getImprovedPrompt handles known industry keys (dental)', async () => {
    const { getImprovedPrompt } = await import('../../../lib/vapi-improved-prompts.js');
    const out = getImprovedPrompt('dental', { businessName: 'Smile', primaryService: 'Checkup', leadName: 'Sam' });
    expect(out.name).toMatch(/Dental/i);
    expect(out.systemPrompt).toContain('Smile');
    expect(out.systemPrompt).toContain('Checkup');
  });
});

