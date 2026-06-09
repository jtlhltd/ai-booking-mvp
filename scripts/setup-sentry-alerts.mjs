/**
 * Create Sentry workflow alerts with severity-tiered routing.
 *
 * Usage:
 *   SENTRY_AUTH_TOKEN=sntryu_... node scripts/setup-sentry-alerts.mjs
 *
 * Optional env:
 *   SENTRY_NOTIFY_USER_ID_CRITICAL  (default: SENTRY_NOTIFY_USER_ID or 4654133)
 *   SENTRY_NOTIFY_USER_ID_WARNING   (defaults to critical user)
 */
import 'dotenv/config';

const ORG = 'jtlh-ltd';
const REGION = 'https://de.sentry.io';
const DEFAULT_USER = '4654133';
const token = process.env.SENTRY_AUTH_TOKEN?.trim();
const criticalUser =
  process.env.SENTRY_NOTIFY_USER_ID_CRITICAL?.trim()
  || process.env.SENTRY_NOTIFY_USER_ID?.trim()
  || DEFAULT_USER;
const warningUser = process.env.SENTRY_NOTIFY_USER_ID_WARNING?.trim() || criticalUser;

if (!token) {
  console.error('Missing SENTRY_AUTH_TOKEN (org auth token with alerts:write).');
  process.exit(1);
}

const workflows = [
  {
    name: 'AI Booking — critical production error',
    appTag: 'ai-booking-mvp',
    level: 50,
    userId: criticalUser,
    trigger: 'first_seen_event',
    frequency: 15,
  },
  {
    name: 'Terry Spec Converter — critical production error',
    appTag: 'terry-spec-converter',
    level: 50,
    userId: criticalUser,
    trigger: 'first_seen_event',
    frequency: 15,
  },
  {
    name: 'AI Booking — error spike (10/hr)',
    appTag: 'ai-booking-mvp',
    level: 40,
    userId: criticalUser,
    spike: true,
    frequency: 60,
  },
  {
    name: 'Terry Spec Converter — error spike (10/hr)',
    appTag: 'terry-spec-converter',
    level: 40,
    userId: criticalUser,
    spike: true,
    frequency: 60,
  },
  {
    name: 'AI Booking — warning digest (issue regression)',
    appTag: 'ai-booking-mvp',
    level: 30,
    userId: warningUser,
    trigger: 'regression_event',
    frequency: 120,
  },
  {
    name: 'Terry Spec Converter — warning digest (issue regression)',
    appTag: 'terry-spec-converter',
    level: 30,
    userId: warningUser,
    trigger: 'regression_event',
    frequency: 120,
  },
];

function emailAction(userId) {
  return {
    type: 'email',
    integrationId: null,
    data: {},
    config: {
      targetType: 'user',
      targetIdentifier: userId,
      targetDisplay: null,
    },
    status: 'active',
  };
}

function buildWorkflow(spec) {
  const conditions = [
    {
      type: 'tagged_event',
      comparison: { key: 'app', match: 'eq', value: spec.appTag },
      conditionResult: true,
    },
    {
      type: 'level',
      comparison: { level: spec.level, match: 'gte' },
      conditionResult: true,
    },
  ];

  if (spec.spike) {
    conditions.push({
      type: 'event_frequency_count',
      comparison: { value: 10, interval: '1h' },
      conditionResult: true,
    });
  }

  const triggerType = spec.spike
    ? { type: 'event_frequency_count', comparison: { value: 10, interval: '1h' }, conditionResult: true }
    : { type: spec.trigger || 'first_seen_event', comparison: true, conditionResult: true };

  return {
    name: spec.name,
    enabled: true,
    environment: 'production',
    config: { frequency: spec.frequency || 30 },
    triggers: {
      logicType: 'any-short',
      conditions: [triggerType],
      actions: [],
    },
    actionFilters: [
      {
        logicType: 'all',
        conditions,
        actions: [emailAction(spec.userId)],
      },
    ],
  };
}

async function listWorkflows() {
  const response = await fetch(`${REGION}/api/0/organizations/${ORG}/workflows/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`List workflows failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function createWorkflow(payload) {
  const response = await fetch(`${REGION}/api/0/organizations/${ORG}/workflows/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (response.status !== 201) {
    throw new Error(`Create "${payload.name}" failed: ${response.status} ${body}`);
  }
  return JSON.parse(body);
}

const existing = await listWorkflows();
const existingNames = new Set((existing || []).map((w) => w.name));

for (const spec of workflows) {
  if (existingNames.has(spec.name)) {
    console.log(`skip (exists): ${spec.name}`);
    continue;
  }
  const created = await createWorkflow(buildWorkflow(spec));
  console.log(`created: ${spec.name} → https://${ORG}.sentry.io/monitors/alerts/${created.id}/`);
}

console.log('\nNote: legacy workflows named "— new production error" can be disabled in Sentry UI if redundant.');
