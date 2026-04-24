import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('gcal.js', () => {
  test('makeJwtAuth replaces literal \\\\n with newlines', async () => {
    const jwtCalls = [];
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: {
          JWT: jest.fn((opts) => {
            jwtCalls.push(opts);
            return { kind: 'jwt' };
          })
        }
      }
    }));

    const { makeJwtAuth } = await import('../../../gcal.js');
    const auth = makeJwtAuth({
      clientEmail: 'x@y',
      privateKey: '-----BEGIN PRIVATE KEY-----\\\\nabc\\\\n-----END PRIVATE KEY-----\\\\n'
    });
    expect(auth).toEqual({ kind: 'jwt' });
    expect(jwtCalls[0].key).toMatch(/\n/);
    expect(jwtCalls[0].key).toMatch(/BEGIN PRIVATE KEY/);
  });

  test('makeJwtAuth can decode base64 key', async () => {
    const jwtCalls = [];
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: {
          JWT: jest.fn((opts) => {
            jwtCalls.push(opts);
            return { ok: true };
          })
        }
      }
    }));

    const { makeJwtAuth } = await import('../../../gcal.js');
    makeJwtAuth({
      clientEmail: 'x@y',
      privateKey: '',
      privateKeyB64: Buffer.from('KEYDATA', 'utf8').toString('base64')
    });
    expect(jwtCalls[0].key).toBe('KEYDATA');
  });
});

