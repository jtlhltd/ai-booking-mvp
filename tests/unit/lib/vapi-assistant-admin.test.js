import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

describe('vapi-assistant-admin', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.VAPI_PRIVATE_KEY = 'test-key';
    delete process.env.VAPI_API_KEY;
    delete process.env.VAPI_ORIGIN;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('summarizeAssistant trims and previews first message', async () => {
    const { summarizeAssistant } = await import('../../../lib/vapi-assistant-admin.js');
    const summary = summarizeAssistant({
      id: 'asst_1',
      name: 'Terry research',
      firstMessage: 'Hello there from Terry Foods',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(summary).toEqual({
      id: 'asst_1',
      name: 'Terry research',
      firstMessagePreview: 'Hello there from Terry Foods',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  test('patchVapiAssistant sends merged model messages', async () => {
    global.fetch = jest.fn(async (url, init) => {
      if (String(url).endsWith('/assistant/asst_1') && init?.method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            id: 'asst_1',
            name: 'Old name',
            firstMessage: 'Hi',
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              messages: [{ role: 'system', content: 'Old script' }],
            },
          }),
        };
      }
      if (String(url).endsWith('/assistant/asst_1') && init?.method === 'PATCH') {
        const body = JSON.parse(init.body);
        expect(body).toEqual({
          firstMessage: 'New opener',
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            messages: [{ role: 'system', content: 'New script' }],
          },
        });
        return {
          ok: true,
          json: async () => ({
            id: 'asst_1',
            name: 'Old name',
            firstMessage: 'New opener',
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              messages: [{ role: 'system', content: 'New script' }],
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });

    const { patchVapiAssistant } = await import('../../../lib/vapi-assistant-admin.js');
    const updated = await patchVapiAssistant('asst_1', {
      firstMessage: 'New opener',
      systemPrompt: 'New script',
    });
    expect(updated.systemPrompt).toBe('New script');
    expect(updated.firstMessage).toBe('New opener');
  });
});
