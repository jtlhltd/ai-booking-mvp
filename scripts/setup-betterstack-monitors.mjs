/**
 * Ensure Better Stack uptime monitors exist for production services.
 *
 * Usage:
 *   BETTERSTACK_API_TOKEN=... node scripts/setup-betterstack-monitors.mjs
 *
 * Optional:
 *   BETTERSTACK_TEAM_ID=123
 */
import 'dotenv/config';

const API = 'https://uptime.betterstack.com/api/v2';
const token = process.env.BETTERSTACK_API_TOKEN?.trim();

if (!token) {
  console.error('Missing BETTERSTACK_API_TOKEN.');
  console.error('Create at: https://betterstack.com/docs/uptime/api/getting-started-with-better-uptime-api');
  console.error('Also set as Windows user env var for Cursor MCP: BETTERSTACK_API_TOKEN');
  process.exit(1);
}

const MONITORS = [
  {
    pronounceable_name: 'AI Booking MVP — health',
    url: process.env.AI_BOOKING_HEALTH_URL?.trim() || 'https://ai-booking-mvp.onrender.com/health/lb',
    monitor_type: 'status',
    check_frequency: 180,
  },
  {
    pronounceable_name: 'Terry Spec Converter — health',
    url: process.env.TERRY_HEALTH_URL?.trim() || 'https://terry-spec-converter.onrender.com/api/health',
    monitor_type: 'keyword',
    required_keyword: '"status":"ok"',
    check_frequency: 180,
  },
];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
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

async function listMonitors() {
  const teamId = process.env.BETTERSTACK_TEAM_ID?.trim();
  const qs = teamId ? `?team_id=${encodeURIComponent(teamId)}` : '';
  const body = await api(`/monitors${qs}`);
  return body?.data || [];
}

async function createMonitor(spec) {
  const payload = {
    pronounceable_name: spec.pronounceable_name,
    url: spec.url,
    monitor_type: spec.monitor_type,
    check_frequency: spec.check_frequency,
    email: true,
    regions: ['eu', 'us'],
    paused: false,
  };
  if (spec.required_keyword) payload.required_keyword = spec.required_keyword;
  if (process.env.BETTERSTACK_TEAM_ID?.trim()) {
    payload.team_name = process.env.BETTERSTACK_TEAM_ID.trim();
  }
  return api('/monitors', { method: 'POST', body: JSON.stringify(payload) });
}

const existing = await listMonitors();
const byName = new Map(existing.map((m) => [m.attributes?.pronounceable_name || m.pronounceable_name, m]));

for (const spec of MONITORS) {
  if (byName.has(spec.pronounceable_name)) {
    console.log(`skip (exists): ${spec.pronounceable_name}`);
    continue;
  }
  const created = await createMonitor(spec);
  const id = created?.data?.id || created?.id;
  console.log(`created: ${spec.pronounceable_name} (id=${id}) → ${spec.url}`);
}
