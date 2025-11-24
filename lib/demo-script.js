import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime, Duration } from 'luxon';

const CACHE_TTL_MS = 10_000;
const DEFAULT_TIMEZONE = 'Europe/London';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultScript = Object.freeze({
  meta: { version: 1, description: 'No demo script configured', lastUpdated: null },
  defaults: { overrides: {} },
  scenarios: []
});

let cached = null;

const weekdayLookup = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7
};

function resolveScriptPath() {
  const custom = process.env.DEMO_SCRIPT_PATH;
  if (custom) return path.resolve(custom);
  return path.resolve(__dirname, '..', 'config', 'demo-script.json');
}

export function isDemoModeEnabled() {
  return String(process.env.DEMO_MODE ?? '').toLowerCase() === 'true';
}

export async function loadDemoScript({ force = false } = {}) {
  const now = Date.now();
  if (!force && cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const scriptPath = resolveScriptPath();
  try {
    const raw = await fs.readFile(scriptPath, 'utf8');
    const parsed = JSON.parse(raw);
    const script = normalizeScript(parsed);
    cached = { data: script, loadedAt: now };
    return script;
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[demo-script] Failed to load script', err?.message || err);
    }
    cached = { data: defaultScript, loadedAt: now };
    return defaultScript;
  }
}

export function clearDemoScriptCache() {
  cached = null;
}

export async function getDemoScenario(context = {}, { forceReload = false } = {}) {
  const script = await loadDemoScript({ force: forceReload });
  return findScenario(script, context);
}

export async function getDemoOverrides(context = {}, { now, timezone, forceReload = false } = {}) {
  if (!isDemoModeEnabled()) return null;

  const script = await loadDemoScript({ force: forceReload });
  const scenario = findScenario(script, context);
  if (!scenario) return null;

  const defaults = script?.defaults?.overrides || {};
  const overrides = deepMerge(defaults, scenario.overrides || {});

  const zone = timezone || context?.timezone || DEFAULT_TIMEZONE;
  const reference = ensureDateTime(now, zone);

  const resolved = {
    scenarioId: scenario.id || null,
    raw: overrides
  };

  if (overrides.slot) {
    const slotIso = resolveSlotOverride(overrides.slot, { now: reference, timezone: zone });
    if (slotIso) {
      resolved.slot = { iso: slotIso };
    }
  }

  if (overrides.sms) {
    resolved.sms = overrides.sms;
  }

  return resolved;
}

export function resolveSlotOverride(slotConfig, { now, timezone } = {}) {
  if (!slotConfig) return null;
  const zone = timezone || DEFAULT_TIMEZONE;
  const reference = ensureDateTime(now, zone);
  if (!reference?.isValid) return null;

  if (slotConfig.iso) {
    const dt = DateTime.fromISO(String(slotConfig.iso), { zone });
    if (!dt.isValid) return null;
    return ensureFuture(dt, reference, slotConfig).toISO();
  }

  const coerced = { ...slotConfig };

  if (typeof coerced.offsetMinutes === 'number') {
    const dt = reference.plus({ minutes: coerced.offsetMinutes });
    return dt.set({ second: coerced.second ?? 0, millisecond: 0 }).toISO();
  }

  if (coerced.weekday && coerced.time) {
    const [hour, minute, second] = parseTime(coerced.time);
    const targetWeekday = parseWeekday(coerced.weekday);
    if (!targetWeekday) return null;

    let dt = reference.set({ hour, minute, second, millisecond: 0 });
    let diff = (targetWeekday - reference.weekday + 7) % 7;
    // If same day but time already passed, push to next week
    if (diff === 0 && dt <= reference) diff = 7;
    dt = dt.plus({ days: diff });

    if (Number.isFinite(coerced.weekOffset) && coerced.weekOffset !== 0) {
      dt = dt.plus({ weeks: coerced.weekOffset });
    }
    if (Number.isFinite(coerced.dayOffset) && coerced.dayOffset !== 0) {
      dt = dt.plus({ days: coerced.dayOffset });
    }
    if (Number.isFinite(coerced.minuteOffset) && coerced.minuteOffset !== 0) {
      dt = dt.plus({ minutes: coerced.minuteOffset });
    }

    dt = ensureFuture(dt, reference, coerced);
    return dt.set({ millisecond: 0 }).toISO();
  }

  if (coerced.time) {
    const [hour, minute, second] = parseTime(coerced.time);
    let dt = reference.set({ hour, minute, second, millisecond: 0 });
    if (dt <= reference) {
      dt = dt.plus({ days: 1 });
    }
    dt = ensureFuture(dt, reference, coerced);
    return dt.toISO();
  }

  return null;
}

function normalizeScript(raw) {
  if (!raw || typeof raw !== 'object') return defaultScript;
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const defaults = raw.defaults && typeof raw.defaults === 'object' ? raw.defaults : {};
  const scenarios = Array.isArray(raw.scenarios) ? raw.scenarios.filter(Boolean) : [];
  return {
    meta: {
      version: meta.version ?? 1,
      description: meta.description ?? '',
      lastUpdated: meta.lastUpdated ?? null
    },
    defaults: {
      overrides: defaults.overrides && typeof defaults.overrides === 'object'
        ? defaults.overrides
        : {}
    },
    scenarios
  };
}

function findScenario(script, context = {}) {
  if (!script?.scenarios?.length) return null;
  return script.scenarios.find((scenario) => scenarioMatchesContext(scenario, context)) || null;
}

function scenarioMatchesContext(scenario, context = {}) {
  const match = scenario?.match;
  if (!match || typeof match !== 'object') return false;

  return Object.entries(match).every(([key, expected]) => {
    if (expected == null) return true;
    const actual = context[key];
    if (actual == null) return false;

    if (typeof expected === 'string') {
      return String(actual).toLowerCase() === expected.toLowerCase();
    }

    if (Array.isArray(expected)) {
      const normalizedActual = String(actual).toLowerCase();
      return expected.some((value) => String(value).toLowerCase() === normalizedActual);
    }

    return actual === expected;
  });
}

function deepMerge(base = {}, extra = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function ensureDateTime(value, timezone = DEFAULT_TIMEZONE) {
  if (!value) return DateTime.now().setZone(timezone);
  if (DateTime.isDateTime?.(value)) {
    return value.setZone(timezone);
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: timezone });
  }
  if (typeof value === 'number') {
    return DateTime.fromMillis(value, { zone: timezone });
  }
  if (typeof value === 'string') {
    const dt = DateTime.fromISO(value, { zone: timezone });
    if (dt.isValid) return dt;
    const parsed = DateTime.fromMillis(Number(value), { zone: timezone });
    if (parsed.isValid) return parsed;
  }
  return DateTime.now().setZone(timezone);
}

function parseTime(timeString) {
  if (typeof timeString !== 'string') return [0, 0, 0];
  const parts = timeString.split(':').map((p) => Number.parseInt(p, 10));
  const [hour = 0, minute = 0, second = 0] = parts;
  return [
    clamp(hour, 0, 23),
    clamp(minute, 0, 59),
    clamp(second, 0, 59)
  ];
}

function parseWeekday(value) {
  if (value == null) return null;
  if (typeof value === 'number' && value >= 1 && value <= 7) return value;
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    return weekdayLookup[key] || null;
  }
  return null;
}

function ensureFuture(dt, reference, options = {}) {
  if (options.ensureFuture === false) return dt;
  if (dt > reference) return dt;

  const bumpWeeks = Number.isFinite(options.bumpWeeks) ? options.bumpWeeks : 1;
  const minimumWeeks = Math.max(1, bumpWeeks);
  let result = dt;
  while (result <= reference) {
    result = result.plus({ weeks: minimumWeeks });
  }
  return result;
}

function clamp(num, min, max) {
  return Math.min(Math.max(Number.isFinite(num) ? num : min, min), max);
}

export function formatOverridesForTelemetry(overrides) {
  if (!overrides) return null;
  return {
    scenarioId: overrides.scenarioId || null,
    slotIso: overrides.slot?.iso || null,
    smsTemplate: overrides.sms?.message || null,
    smsSkip: overrides.sms?.skip ?? false
  };
}



















