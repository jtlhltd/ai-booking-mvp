/**
 * Create Sentry workflow alerts for both production apps.
 *
 * Usage:
 *   SENTRY_AUTH_TOKEN=sntryu_... node scripts/setup-sentry-alerts.mjs
 *
 * Token needs alerts:write (or org:write) on jtlh-ltd.
 */
import 'dotenv/config';

const ORG = 'jtlh-ltd';
const REGION = 'https://de.sentry.io';
const NOTIFY_USER_ID = '4654133';
const token = process.env.SENTRY_AUTH_TOKEN?.trim();

if (!token) {
  console.error('Missing SENTRY_AUTH_TOKEN (org auth token with alerts:write).');
  process.exit(1);
}

const workflows = [
  {
    name: 'AI Booking — new production error',
    appTag: 'ai-booking-mvp',
  },
  {
    name: 'Terry Spec Converter — new production error',
    appTag: 'terry-spec-converter',
  },
  {
    name: 'AI Booking — error spike (10/hr)',
    appTag: 'ai-booking-mvp',
    spike: true,
  },
  {
    name: 'Terry Spec Converter — error spike (10/hr)',
    appTag: 'terry-spec-converter',
    spike: true,
  },
];

function buildWorkflow({ name, appTag, spike = false }) {
  const conditions = [
    {
      type: 'tagged_event',
      comparison: { key: 'app', match: 'eq', value: appTag },
      conditionResult: true,
    },
    {
      type: 'level',
      comparison: { level: 40, match: 'gte' },
      conditionResult: true,
    },
  ];

  if (spike) {
    conditions.push({
      type: 'event_frequency_count',
      comparison: { value: 10, interval: '1hr' },
      conditionResult: true,
    });
  }

  return {
    name,
    enabled: true,
    environment: 'production',
    config: { frequency: spike ? 60 : 30 },
    triggers: {
      logicType: 'any-short',
      conditions: [
        spike
          ? { type: 'event_frequency_count', comparison: { value: 10, interval: '1hr' }, conditionResult: true }
          : { type: 'first_seen_event', comparison: true, conditionResult: true },
      ],
      actions: [],
    },
    actionFilters: [
      {
        logicType: 'all',
        conditions,
        actions: [
          {
            type: 'email',
            integrationId: null,
            data: {},
            config: {
              targetType: 'user',
              targetIdentifier: NOTIFY_USER_ID,
              targetDisplay: null,
            },
            status: 'active',
          },
        ],
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
