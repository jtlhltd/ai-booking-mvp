// lib/call-insights-engine.js
// Lightweight analytics + "ML-ish" routing recommendations using existing call data.

import { DateTime } from 'luxon';
import { isAnsweredHeuristic } from './call-outcome-heuristics.js';

function safeJsonParse(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function tzHourDay(isoOrDate, timeZone) {
  const dt = DateTime.fromJSDate(new Date(isoOrDate)).setZone(timeZone || 'UTC');
  return {
    hour: dt.hour, // 0-23
    weekday: dt.weekday, // 1-7 (Mon-Sun)
    weekdayLabel: dt.toFormat('ccc')
  };
}

function topKFromMap(map, k = 8, minCount = 1) {
  const arr = Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .filter(x => x.count >= minCount)
    .sort((a, b) => b.count - a.count);
  return arr.slice(0, k);
}

function computeRoutingBuckets(rows, { timeZone }) {
  const byHour = Array.from({ length: 24 }, () => ({ attempts: 0, answered: 0, booked: 0 }));
  const byWeekday = Array.from({ length: 7 }, () => ({ attempts: 0, answered: 0, booked: 0, label: '' }));

  for (const r of rows) {
    const { hour, weekday, weekdayLabel } = tzHourDay(r.created_at || r.createdAt, timeZone);
    const wIdx = Math.max(0, Math.min(6, (weekday || 1) - 1));
    byHour[hour].attempts += 1;
    byWeekday[wIdx].attempts += 1;
    byWeekday[wIdx].label = weekdayLabel;

    const answered = isAnsweredHeuristic(r);
    if (answered) {
      byHour[hour].answered += 1;
      byWeekday[wIdx].answered += 1;
    }
    const outcome = (r?.outcome || '').toString().trim().toLowerCase();
    if (outcome === 'booked') {
      byHour[hour].booked += 1;
      byWeekday[wIdx].booked += 1;
    }
  }

  const hourScores = byHour.map((b, hour) => {
    const answeredRate = b.attempts ? b.answered / b.attempts : 0;
    const bookedRate = b.attempts ? b.booked / b.attempts : 0;
    // Simple blended score; booking signal is sparse so weight answered too.
    const score = bookedRate * 0.75 + answeredRate * 0.25;
    return { hour, ...b, answeredRate, bookedRate, score };
  });
  const weekdayScores = byWeekday.map((b, idx) => {
    const answeredRate = b.attempts ? b.answered / b.attempts : 0;
    const bookedRate = b.attempts ? b.booked / b.attempts : 0;
    const score = bookedRate * 0.75 + answeredRate * 0.25;
    return { weekday: idx + 1, label: b.label || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx], ...b, answeredRate, bookedRate, score };
  });

  const minAttempts = 6;
  const bestHours = [...hourScores]
    .filter(h => h.attempts >= minAttempts)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(h => ({
      hour: h.hour,
      label: `${String(h.hour).padStart(2, '0')}:00`,
      attempts: h.attempts,
      answeredRate: Math.round(h.answeredRate * 100),
      bookedRate: Math.round(h.bookedRate * 100),
      score: Math.round(h.score * 100)
    }));

  const bestWeekdays = [...weekdayScores]
    .filter(d => d.attempts >= minAttempts)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(d => ({
      weekday: d.weekday,
      label: d.label,
      attempts: d.attempts,
      answeredRate: Math.round(d.answeredRate * 100),
      bookedRate: Math.round(d.bookedRate * 100),
      score: Math.round(d.score * 100)
    }));

  const fallback = {
    bestHours: hourScores
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 3)
      .map(h => ({ hour: h.hour, label: `${String(h.hour).padStart(2, '0')}:00`, attempts: h.attempts })),
    bestWeekdays: weekdayScores
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 2)
      .map(d => ({ weekday: d.weekday, label: d.label, attempts: d.attempts }))
  };

  return {
    timeZone: timeZone || 'UTC',
    buckets: { byHour: hourScores, byWeekday: weekdayScores },
    recommendations: {
      bestHours: bestHours.length ? bestHours : fallback.bestHours,
      bestWeekdays: bestWeekdays.length ? bestWeekdays : fallback.bestWeekdays
    }
  };
}

function computeTranscriptPatterns(rows) {
  const objections = new Map();
  const phrases = new Map();
  const sentiments = new Map();
  const outcomes = new Map();

  for (const r of rows) {
    const outcome = (r?.outcome || '').toString().trim().toLowerCase() || 'unknown';
    outcomes.set(outcome, (outcomes.get(outcome) || 0) + 1);

    const sentiment = (r?.sentiment || '').toString().trim().toLowerCase();
    if (sentiment) sentiments.set(sentiment, (sentiments.get(sentiment) || 0) + 1);

    const obj = safeJsonParse(r?.objections);
    for (const o of toArray(obj)) {
      const key = typeof o === 'string' ? o : (o?.type || o?.label || o?.objection || o?.text || '');
      const normalized = (key || '').toString().trim().toLowerCase();
      if (!normalized) continue;
      objections.set(normalized, (objections.get(normalized) || 0) + 1);
    }

    const kp = safeJsonParse(r?.key_phrases ?? r?.keyPhrases);
    for (const p of toArray(kp)) {
      const key = typeof p === 'string' ? p : (p?.phrase || p?.text || '');
      const normalized = (key || '').toString().trim();
      if (!normalized) continue;
      const k = normalized.length > 80 ? `${normalized.slice(0, 80).trim()}…` : normalized;
      phrases.set(k, (phrases.get(k) || 0) + 1);
    }
  }

  const topObjections = topKFromMap(objections, 10, 2);
  const topPhrases = topKFromMap(phrases, 10, 2);
  const topOutcomes = topKFromMap(outcomes, 8, 1);
  const sentimentBreakdown = topKFromMap(sentiments, 8, 1);

  const suggestions = [];
  const objectionKeys = new Set(topObjections.map(o => o.key));
  if (objectionKeys.has('price') || objectionKeys.has('too expensive') || objectionKeys.has('cost')) {
    suggestions.push({
      title: 'Handle pricing earlier',
      detail: 'Add a one-sentence value + “range” framing before asking for a booking time, to reduce price objections.'
    });
  }
  if (objectionKeys.has('send email') || objectionKeys.has('email me') || objectionKeys.has('send info')) {
    suggestions.push({
      title: 'Add a “micro-commitment” option',
      detail: 'Offer: “I can send details — is it OK if I pencil a 10-min slot and you can cancel if it’s not a fit?”'
    });
  }
  const notInterested = outcomes.get('not_interested') || outcomes.get('declined') || 0;
  if (notInterested >= 10) {
    suggestions.push({
      title: 'Tighten the opener',
      detail: 'Test a shorter opener: who you are + why calling + question in <10 seconds. Many “not interested” outcomes indicate the hook isn’t landing.'
    });
  }

  return {
    topObjections,
    topPhrases,
    topOutcomes,
    sentimentBreakdown,
    suggestions
  };
}

export async function computeAndStoreCallInsights({
  query,
  clientKey,
  days = 30,
  timeZone = 'UTC',
  limit = 2000,
  upsertCallInsights
}) {
  const since = DateTime.now().minus({ days }).toUTC().toISO();
  const { rows } = await query(
    `
      SELECT
        call_id,
        client_key,
        lead_phone,
        status,
        outcome,
        duration,
        sentiment,
        transcript,
        recording_url,
        objections,
        key_phrases,
        created_at
      FROM calls
      WHERE client_key = $1
        AND created_at >= $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [clientKey, since, limit]
  );

  const callRows = rows || [];
  const answered = callRows.reduce((acc, r) => acc + (isAnsweredHeuristic(r) ? 1 : 0), 0);
  const booked = callRows.reduce((acc, r) => acc + (((r?.outcome || '').toString().trim().toLowerCase() === 'booked') ? 1 : 0), 0);
  const attempts = callRows.length;

  const routing = computeRoutingBuckets(callRows, { timeZone });
  const patterns = computeTranscriptPatterns(callRows);

  const insights = {
    periodDays: days,
    sampleSize: attempts,
    summary: {
      attempts,
      answered,
      booked,
      answeredRate: attempts ? Math.round((answered / attempts) * 100) : 0,
      bookedRate: attempts ? Math.round((booked / attempts) * 100) : 0
    },
    patterns
  };

  await upsertCallInsights({
    clientKey,
    periodDays: days,
    insights,
    routing,
    computedAt: new Date().toISOString()
  });

  return { insights, routing };
}

