export function asJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return fallback;
  }
}

export function hoursFor(client) {
  return (
    asJson(client?.booking?.hours, null) ||
    asJson(client?.hoursJson, null) ||
    {
      mon: ['09:00-17:00'],
      tue: ['09:00-17:00'],
      wed: ['09:00-17:00'],
      thu: ['09:00-17:00'],
      fri: ['09:00-17:00']
    }
  );
}

export async function withRetry(fn, { retries = 2, delayMs = 250 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status || e?.code || e?.status || 0;
      const retriable = status === 429 || status >= 500 || !status;
      if (!retriable || i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export { isDemoClient, isSandboxClientKey, isSandboxTenant, resolveSandboxClientKey, SANDBOX_CLIENT_KEY } from './sandbox-client-keys.js';

export function calculateCacheHitRate(cacheManager, tenantKey) {
  const map = cacheManager?.cache ?? cacheManager;
  const tenantCacheKeys = Array.from(map.keys()).filter(key => key.includes(tenantKey));
  return tenantCacheKeys.length > 0 ? Math.min(95, tenantCacheKeys.length * 10) : 0;
}
