// lib/optimal-call-window.js
// Nudges queued dial times toward hours/weekdays that performed best in call_insights (bounded delay).

import { DateTime } from 'luxon';
import { getTenantTimezone, getBusinessHoursConfig, isBusinessHoursForTenant } from './business-hours.js';

function parseRouting(routing) {
  if (routing == null) return null;
  if (typeof routing === 'string') {
    try {
      return JSON.parse(routing);
    } catch {
      return null;
    }
  }
  return typeof routing === 'object' ? routing : null;
}

/** True when insights used the scored bucket (enough attempts per hour), not volume-only fallback. */
function hasLearnedHourWindows(r) {
  const hrs = r?.recommendations?.bestHours;
  if (!Array.isArray(hrs) || hrs.length === 0) return false;
  return hrs.some(h => Number.isFinite(Number(h.score)));
}

/**
 * @param {object|null} tenant - getFullClient-style row
 * @param {object|string|null} routing - JSON from call_insights.routing
 * @param {Date} baseline - earliest time we would already schedule (next open or now)
 * @param {object} [options]
 * @param {string} [options.fallbackTz]
 * @returns {Date}
 */
export function scheduleAtOptimalCallWindow(tenant, routing, baseline, options = {}) {
  const fallbackTz = options.fallbackTz || process.env.TZ || process.env.TIMEZONE || 'Europe/London';
  const disabled =
    process.env.OPTIMAL_CALL_SCHEDULING === '0' ||
    process.env.OPTIMAL_CALL_SCHEDULING === 'false';
  const maxDelayMs = Number(process.env.OPTIMAL_CALL_MAX_DELAY_MS) > 0
    ? Number(process.env.OPTIMAL_CALL_MAX_DELAY_MS)
    : 6 * 60 * 60 * 1000;

  const base = baseline instanceof Date ? baseline : new Date(baseline);
  if (disabled || !tenant) return base;

  const r = parseRouting(routing);
  if (!r || !hasLearnedHourWindows(r)) return base;

  const tz = getTenantTimezone(tenant, fallbackTz);
  const cfg = getBusinessHoursConfig(tenant);
  const tenantDays = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];

  const bestHours = [...(r.recommendations?.bestHours || [])].filter(h =>
    Number.isFinite(Number(h.score))
  );
  if (bestHours.length === 0) return base;

  bestHours.sort(
    (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || Number(a.hour) - Number(b.hour)
  );
  const preferredHourList = [
    ...new Set(
      bestHours
        .map(h => Number(h.hour))
        .filter(h => Number.isFinite(h) && h >= 0 && h <= 23)
    )
  ];

  const wdRaw = r.recommendations?.bestWeekdays || [];
  const wdScored = wdRaw.filter(d => Number.isFinite(Number(d.score)));
  const preferredWeekdays = wdScored.length
    ? new Set(
      wdScored
        .map(d => Number(d.weekday))
        .filter(w => Number.isFinite(w) && w >= 1 && w <= 7)
    )
    : null;

  const baseDt = DateTime.fromJSDate(base, { zone: tz });
  if (!baseDt.isValid) return base;

  const candidates = [];

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d0 = baseDt.startOf('day').plus({ days: dayOffset });
    const luxWd = d0.weekday;
    if (preferredWeekdays && !preferredWeekdays.has(luxWd)) continue;

    const jsDay = luxWd === 7 ? 0 : luxWd;
    if (!tenantDays.includes(jsDay)) continue;

    for (const hour of preferredHourList) {
      const cand = d0.set({ hour, minute: 0, second: 0, millisecond: 0 });
      if (cand < baseDt) continue;
      if (!isBusinessHoursForTenant(tenant, cand.toJSDate(), fallbackTz)) continue;
      const delay = cand.toMillis() - baseDt.toMillis();
      if (delay > maxDelayMs) continue;
      candidates.push(cand);
    }
  }

  if (candidates.length === 0) return base;

  candidates.sort((a, b) => a.toMillis() - b.toMillis());
  const chosen = candidates[0].toJSDate();
  if (chosen.getTime() !== base.getTime()) {
    console.log('[OPTIMAL CALL WINDOW] Adjusted scheduled time', {
      baseline: base.toISOString(),
      chosen: chosen.toISOString(),
      maxDelayHrs: maxDelayMs / 3600000
    });
  }
  return chosen;
}
