import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/white-label', () => {
  test('generateCustomCSS and generateHeader reflect branding config', async () => {
    const { WhiteLabelManager } = await import('../../../lib/white-label.js');
    const mgr = new WhiteLabelManager();
    const cfg = {
      ...mgr.defaultConfig,
      branding: {
        ...mgr.defaultConfig.branding,
        companyName: 'Acme',
        primaryColor: '#111111',
        secondaryColor: '#222222',
        accentColor: '#333333',
        fontFamily: 'Inter',
        logo: '/logo.png',
      },
      features: { ...mgr.defaultConfig.features, customCss: '.x{y:1}' },
    };
    const css = mgr.generateCustomCSS(cfg);
    expect(css).toContain('--brand-primary: #111111');
    expect(css).toContain('.x{y:1}');

    const header = mgr.generateHeader(cfg);
    expect(header).toContain('Acme');
    expect(header).toContain('/logo.png');
  });

  test('updateConfig returns false on db error', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('db');
      }),
    }));
    const { WhiteLabelManager } = await import('../../../lib/white-label.js');
    const mgr = new WhiteLabelManager();
    const ok = await mgr.updateConfig('c1', { branding: { companyName: 'X' } });
    expect(ok).toBe(false);
  });
});

