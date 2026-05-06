/**
 * Canary for routing hygiene around routes/static-pages.js.
 *
 * Ensures the named routes still exist and keep the intended built/fallback behavior.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('canary: static-pages built/fallback routing', () => {
  test('routes/static-pages uses build output when present and falls back when missing', async () => {
    const sendFile = jest.fn();
    const res = { sendFile, setHeader: jest.fn() };

    const mkRouter = () => {
      const routes = new Map();
      return {
        get: (path, handler) => routes.set(path, handler),
        _routes: routes,
      };
    };

    // Stub express Router() so we can capture handlers.
    jest.unstable_mockModule('express', () => ({
      Router: () => mkRouter(),
    }));

    // Case 1: build exists
    jest.unstable_mockModule('fs', () => ({
      default: { existsSync: () => true },
      existsSync: () => true,
    }));

    const mod1 = await import('../../routes/static-pages.js');
    const router1 = mod1.default;
    const handler1 = router1._routes.get('/decision-maker-finder');
    expect(typeof handler1).toBe('function');
    handler1({}, res);
    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(String(sendFile.mock.calls[0][0]).replace(/\\/g, '/')).toContain('/public/build/pages/decision-maker-finder/index.html');

    // Case 2: build missing -> fallback to legacy public HTML
    jest.resetModules();
    sendFile.mockClear();

    jest.unstable_mockModule('express', () => ({
      Router: () => mkRouter(),
    }));
    jest.unstable_mockModule('fs', () => ({
      default: { existsSync: () => false },
      existsSync: () => false,
    }));

    const mod2 = await import('../../routes/static-pages.js');
    const router2 = mod2.default;
    const handler2 = router2._routes.get('/decision-maker-finder');
    handler2({}, res);
    expect(sendFile).toHaveBeenCalledTimes(1);
    expect(String(sendFile.mock.calls[0][0]).replace(/\\/g, '/')).toContain('/public/decision-maker-finder.html');
  });
});

