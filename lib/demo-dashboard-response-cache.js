import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 10000;
/** @type {Map<string, { etag: string, body: object, expiresAt: number }>} */
const cache = new Map();

export function getDemoDashboardCacheTtlMs() {
  const raw = parseInt(String(process.env.DEMO_DASHBOARD_CACHE_MS ?? '10000').trim(), 10);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_TTL_MS;
  return raw;
}

export function demoDashboardCacheKey(clientKey, briefRequested) {
  return `${String(clientKey)}|brief=${briefRequested ? '1' : '0'}`;
}

/** Stable fingerprint for ETag / poll revalidation (keep in sync with client dashboardPollFingerprint). */
export function demoDashboardPayloadFingerprint(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const calls = payload.recentCalls || [];
  const leads = payload.leads || payload.recentLeads || [];
  const oc = payload.outreachCapacity;
  return {
    totalLeads: payload.metrics?.totalLeads,
    totalCalls: payload.metrics?.totalCalls,
    bookingsThisWeek: payload.metrics?.bookingsThisWeek,
    last24hLeads: payload.metrics?.last24hLeads,
    callIds: calls.slice(0, 12).map((c) => String(c.callId || c.id || '')),
    leadIds: leads.slice(0, 12).map((l) => String(l.id || l.phone || '')),
    touchpoints: payload.touchpoints?.data,
    outreach: oc
      ? {
          leadsNeverDialed: oc.leadsNeverDialed,
          callQueuePending: oc.callQueuePending,
          dialAttemptsLast24h: oc.dialAttemptsLast24h,
          activityState: oc.activityState,
          lastDialAttemptAt: oc.lastDialAttemptAt
        }
      : null
  };
}

export function computeDemoDashboardEtag(payload) {
  const digest = crypto
    .createHash('sha1')
    .update(JSON.stringify(demoDashboardPayloadFingerprint(payload)))
    .digest('hex');
  return `"${digest}"`;
}

export function getCachedDemoDashboard(cacheKey) {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function setCachedDemoDashboard(cacheKey, etag, body, ttlMs) {
  cache.set(cacheKey, {
    etag,
    body,
    expiresAt: Date.now() + Math.max(0, ttlMs)
  });
}

export function clearDemoDashboardResponseCache() {
  cache.clear();
}

export function respondDemoDashboard(res, { etag, body, status = 200, cacheHeader = 'miss' }) {
  res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
  if (etag) res.set('ETag', etag);
  res.set('X-Dashboard-Cache', cacheHeader);
  if (status === 304) return res.status(304).end();
  return res.status(200).json(body);
}
