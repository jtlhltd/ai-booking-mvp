import { poolQuerySelect } from '../db.js';
import { allowOutboundWeekendCalls, clampOutboundDialToAllowedWindow } from './business-hours.js';
import { resolveTenantTimezone } from './timezone-resolver.js';

const DEFAULT_TZ = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

export async function fetchLeadNamesForRetryQueuePhones(clientKey, queuePhones) {
  const phones = [...new Set((queuePhones || []).filter((p) => p != null && String(p) !== ''))];
  if (phones.length === 0) return new Map();
  const res = await poolQuerySelect(
    `
    WITH qn AS (
      SELECT DISTINCT p AS phone_raw,
             regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS qdig,
             CASE
               WHEN LENGTH(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g')) >= 10
               THEN RIGHT(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g'), 10)
               ELSE NULLIF(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g'), '')
             END AS qkey
      FROM unnest($2::text[]) AS x(p)
      WHERE p IS NOT NULL AND p <> ''
    ),
    lead_index AS (
      SELECT phone, phone_match_key, name, created_at
      FROM leads
      WHERE client_key = $1
    )
    SELECT DISTINCT ON (qn.phone_raw)
      qn.phone_raw,
      li.name
    FROM qn
    JOIN lead_index li ON (
      li.phone = qn.phone_raw
      OR (
        li.phone_match_key IS NOT NULL
        AND qn.qkey IS NOT NULL
        AND li.phone_match_key = qn.qkey
      )
    )
    ORDER BY qn.phone_raw, li.created_at DESC NULLS LAST
    `,
    [clientKey, phones]
  );
  const m = new Map();
  for (const row of res.rows || []) {
    if (row.phone_raw != null) m.set(row.phone_raw, row.name);
  }
  return m;
}

/**
 * Retry-queue API: for outbound dials, show the next allowed dial instant (weekdays + hours),
 * not a raw scheduled_for that may fall on Sat/Sun or outside hours (e.g. "tomorrow 9am" from Fri).
 * SMS/email follow-ups keep the stored time unchanged.
 */
export function effectiveDialScheduledForApiDisplay(row, tenant) {
  if (!row?.scheduled_for) return null;
  const raw = new Date(row.scheduled_for);
  if (Number.isNaN(raw.getTime())) return null;
  if (allowOutboundWeekendCalls()) return raw;
  const t = String(row.retry_type || '').toLowerCase();
  const isOutboundDial =
    row.source === 'call_queue' ||
    (row.source === 'retry_queue' && (t === 'vapi_call' || t === 'call'));
  if (!isOutboundDial) return raw;
  return clampOutboundDialToAllowedWindow(tenant, raw, resolveTenantTimezone(tenant, DEFAULT_TZ));
}
