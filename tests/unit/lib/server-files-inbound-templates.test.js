import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/server-files-inbound-templates', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('renderTemplate substitutes tokens', async () => {
    const { renderTemplate } = await import('../../../lib/server-files-inbound-templates.js');
    expect(renderTemplate('Hello {{ name }}', { name: 'Ann' })).toBe('Hello Ann');
    expect(renderTemplate('{{missing}}', {})).toBe('');
  });

  test('resolveTenantKeyFromInbound matches phone', async () => {
    const { resolveTenantKeyFromInbound } = await import(
      '../../../lib/server-files-inbound-templates.js'
    );
    const key = await resolveTenantKeyFromInbound(
      { to: '+441234567890', messagingServiceSid: null },
      {
        listFullClients: async () => [
          { clientKey: 'tenantA', sms: { fromNumber: '+441234567890' } }
        ]
      }
    );
    expect(key).toBe('tenantA');
  });

  test('resolveTenantKeyFromInbound returns null when no match', async () => {
    const { resolveTenantKeyFromInbound } = await import(
      '../../../lib/server-files-inbound-templates.js'
    );
    const key = await resolveTenantKeyFromInbound(
      { to: '+449999999999', messagingServiceSid: null },
      { listFullClients: async () => [] }
    );
    expect(key).toBeNull();
  });

  test('readJson returns fallback on parse error', async () => {
    jest.resetModules();
    const fsStub = {
      readFile: jest.fn(async () => '{ bad json'),
      writeFile: jest.fn(async () => {}),
      mkdir: jest.fn(async () => {}),
      access: jest.fn(async () => {})
    };
    jest.unstable_mockModule('fs/promises', () => ({
      __esModule: true,
      default: fsStub,
      ...fsStub
    }));
    const { readJson } = await import('../../../lib/server-files-inbound-templates.js');
    expect(await readJson('/nope.json', [])).toEqual([]);
  });
});
