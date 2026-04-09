// lib/optimal-call-window.js
// Schedules queued dials: Thompson sampling over hour-of-day (answered-rate bandit), then optional legacy routing heuristic.

import { DateTime } from 'luxon';
import { getTenantTimezone, getBusinessHoursConfig, isBusinessHoursForTenant } from './business-hours.js';
import { sampleBeta } from './thompson-sample.js';

function stableHashToInt(input) {
  // FNV-1a 32-bit
  const s = String(input ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function applyInHourJitter({ chosen, baseline, jitterKey, maxJitterSeconds, timeZone }) {
  if (!chosen || !(chosen instanceof Date)) return chosen;
  const tz = timeZone || process.env.TZ || process.env.TIMEZONE || 'UTC';
  const face = DateTime.fromJSDate(chosen, { zone: tz });
  if (!face.isValid) return chosen;
  // Tenant-local “top of the hour” (not Node’s TZ — Render is usually UTC).
  if (face.minute !== 0 || face.second !== 0 || face.millisecond !== 0) return chosen;

  const base = baseline instanceof Date ? baseline : new Date(baseline);
  const max = Math.max(0, Math.min(59 * 60 - 1, Number(maxJitterSeconds) || 0));
  if (max <= 0) return chosen;

  const key =
    jitterKey != null && String(jitterKey).trim() !== ''
      ? String(jitterKey)
      : `ephemeral:${chosen.getTime()}:${Math.random()}`;
  // 1..max seconds so we never stack many dials on the exact HH:00:00 instant (invariant + carrier load).
  const jitter = 1 + (stableHashToInt(key) % max);
  const jittered = new Date(chosen.getTime() + jitter * 1000);
  // Never move earlier than the baseline.
  if (jittered.getTime() < base.getTime()) return chosen;
  return jittered;
}

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

function hasLearnedHourWindows(r) {
  const hrs = r?.recommendations?.bestHours;
  if (!Array.isArray(hrs) || hrs.length === 0) return false;
  return hrs.some(h => Number.isFinite(Number(h.score)));
}

function businessHourList(tenant) {
  const cfg = getBusinessHoursConfig(tenant);
  const startH = Math.max(0, Math.min(23, Number(cfg.start ?? 9)));
  const endH = Math.max(0, Math.min(24, Number(cfg.end ?? 17)));
  const list = [];
  for (let h = startH; h < endH; h++) list.push(h);
  return list;
}

/** Collect DateTime slots >= baseline within maxDelay, on allowed weekdays, whole hours only. */
function collectCandidateSlots(tenant, baseline, { fallbackTz, maxDelayMs, preferredHourList = null, preferredWeekdays = null }) {
  const tz = getTenantTimezone(tenant, fallbackTz);
  const cfg = getBusinessHoursConfig(tenant);
  const tenantDays = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];
  const hourSource = preferredHourList && preferredHourList.length
    ? preferredHourList
    : businessHourList(tenant);

  const baseDt = DateTime.fromJSDate(baseline instanceof Date ? baseline : new Date(baseline), { zone: tz });
  if (!baseDt.isValid) return [];

  const candidates = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d0 = baseDt.startOf('day').plus({ days: dayOffset });
    const luxWd = d0.weekday;
    if (preferredWeekdays && preferredWeekdays.size && !preferredWeekdays.has(luxWd)) continue;

    const jsDay = luxWd === 7 ? 0 : luxWd;
    if (!tenantDays.includes(jsDay)) continue;

    for (const hour of hourSource) {
      const cand = d0.set({ hour, minute: 0, second: 0, millisecond: 0 });
      if (cand < baseDt) continue;
      if (!isBusinessHoursForTenant(tenant, cand.toJSDate(), fallbackTz)) continue;
      const delay = cand.toMillis() - baseDt.toMillis();
      if (delay > maxDelayMs) continue;
      candidates.push(cand);
    }
  }
  return candidates;
}

/**
 * Thompson: one Beta sample per distinct hour appearing in candidates; pick hour with max sample, earliest slot for that hour.
 * @returns {Date|null}
 */
function pickThompsonScheduledTime(tenant, arms, baseline, { fallbackTz, maxDelayMs }) {
  const candidates = collectCandidateSlots(tenant, baseline, { fallbackTz, maxDelayMs });
  if (candidates.length === 0) return null;

  const hourSet = [...new Set(candidates.map(c => c.hour))];
  let bestH = hourSet[0];
  let bestSample = -1;
  for (const h of hourSet) {
    const arm = arms[String(h)] || { a: 1, b: 1 };
    const a = Math.max(1e-6, Number(arm.a) || 1);
    const b = Math.max(1e-6, Number(arm.b) || 1);
    const s = sampleBeta(a, b);
    if (s > bestSample) {
      bestSample = s;
      bestH = h;
    }
  }

  const forHour = candidates.filter(c => c.hour === bestH).sort((a, b) => a.toMillis() - b.toMillis());
  const chosen = forHour[0];
  return chosen ? chosen.toJSDate() : null;
}

function scheduleWithRoutingHeuristic(tenant, routing, baseline, options) {
  const fallbackTz = options.fallbackTz || process.env.TZ || process.env.TIMEZONE || 'Europe/London';
  const maxDelayMs = options.maxDelayMs;

  const r = parseRouting(routing);
  if (!r || !hasLearnedHourWindows(r)) return null;

  const cfg = getBusinessHoursConfig(tenant);
  const tenantDays = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];

  const bestHours = [...(r.recommendations?.bestHours || [])].filter(h =>
    Number.isFinite(Number(h.score))
  );
  if (bestHours.length === 0) return null;

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

  const candidates = collectCandidateSlots(tenant, baseline, {
    fallbackTz,
    maxDelayMs,
    preferredHourList,
    preferredWeekdays
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.toMillis() - b.toMillis());
  return candidates[0].toJSDate();
}

/**
 * @param {object|null} tenant
 * @param {object|string|null} routing - call_insights.routing (legacy heuristic)
 * @param {Date} baseline
 * @param {object} [options]
 * @param {string} [options.fallbackTz]
 * @param {string} [options.clientKey] - load bandit from DB when Thompson enabled
 * @param {object} [options.banditArms] - optional in-memory override (tests)
 * @returns {Promise<Date>}
 */
export async function scheduleAtOptimalCallWindow(tenant, routing, baseline, options = {}) {
  const fallbackTz = options.fallbackTz || process.env.TZ || process.env.TIMEZONE || 'Europe/London';
  const disabled =
    process.env.OPTIMAL_CALL_SCHEDULING === '0' ||
    process.env.OPTIMAL_CALL_SCHEDULING === 'false';
  const maxDelayMs = Number(process.env.OPTIMAL_CALL_MAX_DELAY_MS) > 0
    ? Number(process.env.OPTIMAL_CALL_MAX_DELAY_MS)
    : 6 * 60 * 60 * 1000;
  const jitterMaxSeconds = Number(process.env.OPTIMAL_CALL_JITTER_MAX_SECONDS) > 0
    ? Number(process.env.OPTIMAL_CALL_JITTER_MAX_SECONDS)
    : 55 * 60; // spread calls within the chosen hour

  const jitterTz = getTenantTimezone(tenant, fallbackTz);

  const base = baseline instanceof Date ? baseline : new Date(baseline);
  if (disabled || !tenant) {
    return applyInHourJitter({
      chosen: base,
      baseline: base,
      jitterKey: options.jitterKey,
      maxJitterSeconds: jitterMaxSeconds,
      timeZone: jitterTz
    });
  }

  const tryLogDecision = async (chosen, source) => {
    const ck = options.clientKey;
    if (!ck || !chosen) return;
    if (Math.abs(chosen.getTime() - base.getTime()) < 60000) return;
    const { recordCallScheduleDecision } = await import('../db.js');
    const tz = getTenantTimezone(tenant, fallbackTz);
    const hourChosen = DateTime.fromJSDate(chosen, { zone: tz }).hour;
    const delayMinutes = Math.round((chosen.getTime() - base.getTime()) / 60000);
    await recordCallScheduleDecision({
      clientKey: ck,
      baselineAt: base,
      chosenAt: chosen,
      source: String(source),
      hourChosen,
      delayMinutes
    });
  };

  const thompsonOff =
    process.env.CALL_TIME_THOMPSON === '0' ||
    process.env.CALL_TIME_THOMPSON === 'false';

  let arms = options.banditArms;
  if (!thompsonOff && options.clientKey != null && arms === undefined) {
    const { getCallTimeBanditState } = await import('../db.js');
    arms = await getCallTimeBanditState(options.clientKey);
  }

  if (!thompsonOff && options.clientKey != null) {
    const th = pickThompsonScheduledTime(tenant, arms && typeof arms === 'object' ? arms : {}, base, {
      fallbackTz,
      maxDelayMs
    });
    if (th && th.getTime() !== base.getTime()) {
      const jittered = applyInHourJitter({
        chosen: th,
        baseline: base,
        jitterKey: options.jitterKey,
        maxJitterSeconds: jitterMaxSeconds,
        timeZone: jitterTz
      });
      if (jittered.getTime() !== th.getTime()) {
        await tryLogDecision(jittered, 'thompson_jitter').catch(() => {});
      }
      console.log('[THOMPSON CALL TIME] scheduled window', {
        baseline: base.toISOString(),
        chosen: th.toISOString()
      });
      await tryLogDecision(th, 'thompson').catch(() => {});
    }
    if (th) {
      return applyInHourJitter({
        chosen: th,
        baseline: base,
        jitterKey: options.jitterKey,
        maxJitterSeconds: jitterMaxSeconds,
        timeZone: jitterTz
      });
    }
  }

  const heuristic = scheduleWithRoutingHeuristic(tenant, routing, base, { fallbackTz, maxDelayMs });
  if (heuristic && heuristic.getTime() !== base.getTime()) {
    const jittered = applyInHourJitter({
      chosen: heuristic,
      baseline: base,
      jitterKey: options.jitterKey,
      maxJitterSeconds: jitterMaxSeconds,
      timeZone: jitterTz
    });
    if (jittered.getTime() !== heuristic.getTime()) {
      await tryLogDecision(jittered, 'routing_heuristic_jitter').catch(() => {});
    }
    console.log('[OPTIMAL CALL WINDOW] routing heuristic adjustment', {
      baseline: base.toISOString(),
      chosen: heuristic.toISOString()
    });
    await tryLogDecision(heuristic, 'routing_heuristic').catch(() => {});
  }
  return applyInHourJitter({
    chosen: heuristic || base,
    baseline: base,
    jitterKey: options.jitterKey,
    maxJitterSeconds: jitterMaxSeconds,
    timeZone: jitterTz
  });
}
