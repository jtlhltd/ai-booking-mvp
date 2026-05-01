/**
 * Bootstrap tenants from env on cold-start.
 *
 * Use case: a free-tier Render instance with no persistent disk needs to
 * seed `BOOTSTRAP_CLIENTS_JSON` into the in-memory SQLite the first time
 * it boots after a redeploy. If clients already exist, this is a no-op.
 *
 * Extracted from server.js (PR-10 of the hygiene burndown). The only
 * runtime side effects are:
 *   1. Reading `process.env.BOOTSTRAP_CLIENTS_JSON`.
 *   2. Calling `listFullClients` and (per-tenant) `upsertFullClient` on
 *      the deps passed in.
 *   3. Logging on success / error.
 *
 * Errors are swallowed by design — bootstrap must not crash startup.
 *
 * @param {object} deps
 * @param {() => Promise<Array<{clientKey?:string}>>} deps.listFullClients
 * @param {(client: object) => Promise<unknown>} deps.upsertFullClient
 * @returns {Promise<{seeded: number, reason: 'already_seeded'|'no_env'|'parse_error'|'invalid_shape'|'ok'}>}
 */
export async function bootstrapClients({ listFullClients, upsertFullClient } = {}) {
  if (typeof listFullClients !== 'function' || typeof upsertFullClient !== 'function') {
    throw new Error('bootstrapClients requires listFullClients and upsertFullClient deps');
  }

  try {
    const existing = await listFullClients();
    if (Array.isArray(existing) && existing.length > 0) {
      return { seeded: 0, reason: 'already_seeded' };
    }
    const raw = process.env.BOOTSTRAP_CLIENTS_JSON;
    if (!raw) return { seeded: 0, reason: 'no_env' };

    let seed;
    try {
      seed = JSON.parse(raw);
    } catch (e) {
      console.error('bootstrapClients parse error', e?.message || e);
      return { seeded: 0, reason: 'parse_error' };
    }
    if (!Array.isArray(seed)) seed = [seed];

    let seeded = 0;
    for (const c of seed) {
      if (!c?.clientKey || !c?.booking?.timezone) continue;
      await upsertFullClient(c);
      seeded += 1;
    }
    console.log(`Bootstrapped ${seeded} client(s) into SQLite from BOOTSTRAP_CLIENTS_JSON`);
    return { seeded, reason: 'ok' };
  } catch (e) {
    console.error('bootstrapClients error', e?.message || e);
    return { seeded: 0, reason: 'parse_error' };
  }
}
