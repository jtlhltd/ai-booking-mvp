/**
 * Some tenants are reachable under more than one `client_key` spelling in
 * bookmarks and integrations (e.g. u2d vs d2d for the same anchor account).
 * `getFullClient` tries these in order so the caller's spelling is tried first.
 */

const TOM_PAIR = ['u2d-xpress-tom', 'd2d-xpress-tom'];

/**
 * @param {string} rawKey
 * @returns {string[]} non-empty keys to try against `tenants.client_key`, deduped, caller spelling first when it is one of the pair
 */
export function getClientKeyLookupCandidates(rawKey) {
  const k = String(rawKey || '').trim();
  if (!k) return [];
  const lower = k.toLowerCase();
  const u = TOM_PAIR[0];
  const d = TOM_PAIR[1];
  if (lower === u || lower === d) {
    const preferred = lower === u ? u : d;
    const second = preferred === u ? d : u;
    return [preferred, second];
  }
  return [k];
}
