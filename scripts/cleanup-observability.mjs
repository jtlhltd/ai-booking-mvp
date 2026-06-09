/**
 * Remove duplicate Better Stack monitors and disable redundant Sentry workflows.
 *
 * Usage:
 *   BETTERSTACK_API_TOKEN=... SENTRY_AUTH_TOKEN=... node scripts/cleanup-observability.mjs
 */
import 'dotenv/config';

const BS_API = 'https://uptime.betterstack.com/api/v2';
const SENTRY = 'https://de.sentry.io/api/0/organizations/jtlh-ltd';
const bsToken = process.env.BETTERSTACK_API_TOKEN?.trim();
const sentryToken = process.env.SENTRY_AUTH_TOKEN?.trim();

/** Monitor IDs/names to remove (duplicates or non-prod). */
const DELETE_MONITOR_IDS = new Set([
  '4503029', // AI Booking — healthz (duplicate of /health/lb)
  '4502655', // google.com test monitor
]);

/** Keep canonical AI Booking monitor name for setup script dedupe. */
const KEEP_AI_BOOKING_URL = 'https://ai-booking-mvp.onrender.com/health/lb';

/** Default Sentry high-priority workflows superseded by tiered alerts. */
const DISABLE_SENTRY_WORKFLOW_IDS = new Set(['619179', '619306']);

async function bsApi(path, options = {}) {
  const response = await fetch(`${BS_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${bsToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function cleanupBetterStack() {
  if (!bsToken) {
    console.log('[betterstack] skip — BETTERSTACK_API_TOKEN not set');
    return;
  }
  const monitors = (await bsApi('/monitors'))?.data || [];
  for (const m of monitors) {
    const id = String(m.id);
    const name = m.attributes?.pronounceable_name || '';
    const url = m.attributes?.url || '';
    if (!DELETE_MONITOR_IDS.has(id)) {
      if (name.includes('AI Booking') && url !== KEEP_AI_BOOKING_URL && id !== '4506967') {
        console.log(`[betterstack] keep (review manually): ${id} ${name} ${url}`);
      }
      continue;
    }
    await bsApi(`/monitors/${id}`, { method: 'DELETE' });
    console.log(`[betterstack] deleted: ${id} ${name}`);
  }
}

async function sentryApi(path, options = {}) {
  const response = await fetch(`${SENTRY}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${sentryToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function disableSentryWorkflow(id) {
  const workflow = await sentryApi(`/workflows/${id}/`);
  if (!workflow?.enabled) {
    console.log(`[sentry] already disabled: ${id} ${workflow?.name || ''}`);
    return;
  }
  await sentryApi(`/workflows/${id}/`, {
    method: 'PUT',
    body: JSON.stringify({ ...workflow, enabled: false }),
  });
  console.log(`[sentry] disabled: ${id} ${workflow.name}`);
}

async function cleanupSentry() {
  if (!sentryToken) {
    console.log('[sentry] skip — SENTRY_AUTH_TOKEN not set');
    return;
  }
  const workflows = await sentryApi('/workflows/');
  for (const w of workflows || []) {
    if (!DISABLE_SENTRY_WORKFLOW_IDS.has(String(w.id))) continue;
    await disableSentryWorkflow(String(w.id));
  }
  for (const w of workflows || []) {
    if (w.name?.includes('new production error') && w.enabled) {
      await disableSentryWorkflow(String(w.id));
    }
  }
}

await cleanupBetterStack();
await cleanupSentry();
console.log('cleanup complete');
