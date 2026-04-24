import { makeJwtAuth } from '../gcal.js';

/**
 * GET /gcal/ping — extracted from server.js.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {{ getGoogleCredentials: () => { clientEmail: string, privateKey: string, privateKeyB64: string } }} deps
 */
export async function handleGcalPing(_req, res, deps) {
  try {
    const { getGoogleCredentials } = deps || {};
    const { clientEmail, privateKey, privateKeyB64 } = getGoogleCredentials();
    if (!(clientEmail && (privateKey || privateKeyB64))) {
      return res.status(400).json({ ok: false, error: 'Google env missing' });
    }
    const auth = makeJwtAuth({ clientEmail, privateKey, privateKeyB64 });
    await auth.authorize();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

