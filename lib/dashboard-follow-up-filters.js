export const DASHBOARD_COHORT_FILTERS = Object.freeze(['all', 'classic', 'sequence', 'abandoned']);

export const SEQUENCE_COMPLETED_HANDOFF_SOURCE = 'vapi_webhook.sequence_completed';
export const SEQUENCE_ABANDONED_HANDOFF_SOURCE = 'vapi_webhook.sequence_abandoned';

function uniqueTrimmed(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const trimmed = String(value || '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatDateKeyInTimezone(date, timeZone) {
  const dt = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(dt.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: String(timeZone || 'Europe/London'),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(dt);
    const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!partMap.year || !partMap.month || !partMap.day) return '';
    return `${partMap.year}-${partMap.month}-${partMap.day}`;
  } catch {
    return '';
  }
}

function buildInClause(startIndex, values) {
  return values.map((_, idx) => `$${startIndex + idx}`).join(', ');
}

function artifactKeysForPhone(phone, phoneMatchKey) {
  const trimmed = String(phone || '').trim();
  const keys = [];
  if (trimmed) keys.push(trimmed);
  const matchKey = typeof phoneMatchKey === 'function' ? phoneMatchKey(trimmed) : null;
  if (matchKey) keys.push(matchKey);
  return uniqueTrimmed(keys);
}

function setArtifactValue(map, phone, phoneMatchKey, patch) {
  const keys = artifactKeysForPhone(phone, phoneMatchKey);
  for (const key of keys) {
    const prior = map.get(key) || {};
    map.set(key, { ...prior, ...patch });
  }
}

export function normalizeDashboardCohortFilter(raw) {
  const trimmed = String(raw || '').trim().toLowerCase();
  return DASHBOARD_COHORT_FILTERS.includes(trimmed) ? trimmed : 'all';
}

export function getDashboardCohortMeta({
  handoffSource = '',
  hasSequenceState = false,
  leadCreatedAt = null,
  classicFollowUpCutoverDate = null,
  tenantTimezone = 'Europe/London',
  salvageDismissedAt = null,
} = {}) {
  const source = String(handoffSource || '').trim();
  const isAbandoned = source === SEQUENCE_ABANDONED_HANDOFF_SOURCE;
  const isCompleted = source === SEQUENCE_COMPLETED_HANDOFF_SOURCE;
  const isDismissedAbandoned = !!(isAbandoned && String(salvageDismissedAt || '').trim());
  const hasSequenceArtifact = !!hasSequenceState || isCompleted || isAbandoned;
  const leadCreatedDateKey = leadCreatedAt ? formatDateKeyInTimezone(leadCreatedAt, tenantTimezone) : '';
  const cutover = String(classicFollowUpCutoverDate || '').trim();
  const hasCutover = !!cutover;
  const beforeCutover = !!(hasCutover && leadCreatedDateKey && leadCreatedDateKey < cutover);
  const onOrAfterCutover = !!(hasCutover && leadCreatedDateKey && leadCreatedDateKey >= cutover);

  let cohort = 'unclassified';
  if (isDismissedAbandoned) {
    cohort = 'dismissed_abandoned';
  } else if (isAbandoned) {
    cohort = 'abandoned';
  } else if (hasCutover) {
    if (beforeCutover) cohort = 'classic';
    else if (onOrAfterCutover && hasSequenceArtifact) cohort = 'sequence';
  } else {
    cohort = hasSequenceArtifact ? 'sequence' : 'classic';
  }

  return {
    cohort,
    handoffSource: source || null,
    hasSequenceArtifact,
    hasSequenceState: !!hasSequenceState,
    leadCreatedDateKey: leadCreatedDateKey || null,
    classicFollowUpCutoverDate: cutover || null,
    salvageDismissedAt: salvageDismissedAt ? String(salvageDismissedAt) : null,
  };
}

export function matchesDashboardCohort(meta, filter) {
  const normalized = normalizeDashboardCohortFilter(filter);
  if (normalized === 'all') return true;
  return String(meta?.cohort || '') === normalized;
}

export async function loadDashboardArtifactMap({
  query,
  clientKey,
  phones = [],
  phoneMatchKey,
} = {}) {
  const artifactMap = new Map();
  if (typeof query !== 'function' || !clientKey) return artifactMap;

  const uniquePhones = uniqueTrimmed(phones);
  const matchKeys = uniqueTrimmed(uniquePhones.map((phone) => (typeof phoneMatchKey === 'function' ? phoneMatchKey(phone) : null)));

  if (!uniquePhones.length && !matchKeys.length) return artifactMap;

  if (uniquePhones.length || matchKeys.length) {
    const phoneClause = uniquePhones.length ? `lead_phone IN (${buildInClause(2, uniquePhones)})` : '';
    const matchClause =
      matchKeys.length
        ? `phone_match_key IN (${buildInClause(2 + uniquePhones.length, matchKeys)})`
        : '';
    const whereParts = [phoneClause, matchClause].filter(Boolean);
    const handoffSql = `
      SELECT
        lead_phone AS "leadPhone",
        phone_match_key AS "phoneMatchKey",
        source,
        updated_at AS "updatedAt",
        data_json AS "dataJson"
      FROM lead_handoff
      WHERE client_key = $1
        AND (${whereParts.join(' OR ')})
    `;
    const handoffArgs = [clientKey, ...uniquePhones, ...matchKeys];
    const handoffRes = await query(handoffSql, handoffArgs).catch(() => ({ rows: [] }));
    for (const row of handoffRes?.rows || []) {
      const handoffData = parseJsonObject(row.dataJson);
      const salvageDismissedAt = handoffData?.qual?._salvageDismissedAt || null;
      setArtifactValue(artifactMap, row.leadPhone, phoneMatchKey, {
        handoffSource: row.source || null,
        handoffUpdatedAt: row.updatedAt || null,
        salvageDismissedAt,
      });
      if (row.phoneMatchKey) {
        const prior = artifactMap.get(String(row.phoneMatchKey)) || {};
        artifactMap.set(String(row.phoneMatchKey), {
          ...prior,
          handoffSource: row.source || null,
          handoffUpdatedAt: row.updatedAt || null,
          salvageDismissedAt,
        });
      }
    }
  }

  if (uniquePhones.length || matchKeys.length) {
    const phoneClause = uniquePhones.length ? `phone IN (${buildInClause(2, uniquePhones)})` : '';
    const matchClause =
      matchKeys.length
        ? `phone_match_key IN (${buildInClause(2 + uniquePhones.length, matchKeys)})`
        : '';
    const whereParts = [phoneClause, matchClause].filter(Boolean);
    const leadsSql = `
      SELECT
        phone,
        phone_match_key AS "phoneMatchKey",
        created_at AS "createdAt"
      FROM leads
      WHERE client_key = $1
        AND (${whereParts.join(' OR ')})
      ORDER BY created_at DESC
    `;
    const leadArgs = [clientKey, ...uniquePhones, ...matchKeys];
    const leadRes = await query(leadsSql, leadArgs).catch(() => ({ rows: [] }));
    const seenLeadKey = new Set();
    for (const row of leadRes?.rows || []) {
      const keys = artifactKeysForPhone(row.phone, phoneMatchKey);
      if (row.phoneMatchKey) keys.push(String(row.phoneMatchKey));
      for (const key of uniqueTrimmed(keys)) {
        if (seenLeadKey.has(key)) continue;
        seenLeadKey.add(key);
        const prior = artifactMap.get(key) || {};
        artifactMap.set(key, {
          ...prior,
          leadCreatedAt: row.createdAt || null,
        });
      }
    }
  }

  const seqRes = await query(
    `
      SELECT
        lead_phone AS "leadPhone",
        status,
        updated_at AS "updatedAt"
      FROM lead_sequence_state
      WHERE client_key = $1
    `,
    [clientKey]
  ).catch(() => ({ rows: [] }));
  for (const row of seqRes?.rows || []) {
    const keys = artifactKeysForPhone(row.leadPhone, phoneMatchKey);
    for (const key of keys) {
      const prior = artifactMap.get(key) || {};
      artifactMap.set(key, {
        ...prior,
        hasSequenceState: true,
        sequenceStatus: row.status || null,
        sequenceUpdatedAt: row.updatedAt || null,
      });
    }
  }

  return artifactMap;
}
