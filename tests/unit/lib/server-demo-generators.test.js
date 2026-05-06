import { describe, expect, test, jest } from '@jest/globals';

describe('lib/server-demo-generators', () => {
  test('generateRealisticDecisionMakers builds primary contacts', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { generateRealisticDecisionMakers } = await import(
      '../../../lib/server-demo-generators.js'
    );
    const out = generateRealisticDecisionMakers({ name: 'Acme Dental' }, 'dentist', 'primary');
    expect(out.primary.length).toBeGreaterThan(0);
    expect(out.primary[0].type).toBe('email');
    expect(out.gatekeeper.length).toBeGreaterThan(0);
    jest.spyOn(Math, 'random').mockRestore();
  });

  test('falls back to generic titles for unknown industry', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const { generateRealisticDecisionMakers } = await import(
      '../../../lib/server-demo-generators.js'
    );
    const out = generateRealisticDecisionMakers({ name: 'Weird Co' }, 'unknown_industry', 'primary');
    expect(out.primary[0].title).toBeTruthy();
    jest.spyOn(Math, 'random').mockRestore();
  });
});
