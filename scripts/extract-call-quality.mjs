import fs from 'node:fs';

const src = fs.readFileSync('routes/call-insights-mount.js', 'utf8');
const start = src.indexOf('const loadCallQualityPrimaryStats');
const end = src.indexOf('res.json({', start);
const body = src.slice(start, end);
const header = `import { isSandboxClientKey } from './sandbox-client-keys.js';

export async function loadDashboardCallQualityPayload(clientKey, { poolQuerySelect }) {
  if (!clientKey || !poolQuerySelect) return null;
  if (isSandboxClientKey(clientKey)) return null;
  try {
`;
const footer = `
    const bookingsFromCalls = parseInt(stats.bookings_from_calls || 0, 10);
    const totalCalls = parseInt(stats.total_calls || 0, 10);
    const uniqueLeads = parseInt(stats.unique_leads || 0, 10);
    const answeredAttempts = parseInt(stats.answered_attempts || 0, 10);
    const noPickupAttempts = parseInt(stats.no_pickup_attempts || 0, 10);
    const voicemailAttempts = parseInt(stats.voicemail_attempts || 0, 10);
    const avgSec = parseFloat(stats.avg_duration_sec) || 0;
    const bookingNumerator = Math.max(bookingsFromCalls, appts7d);
    const peak = peakHour.rows?.[0];
    let bestTime = '—';
    let bestTimeDialCount = 0;
    if (peak && peak.hour_of_day != null && Number(peak.cnt) > 0) {
      const h = Number(peak.hour_of_day);
      const endH = (h + 2) % 24;
      bestTime = \`\${String(h).padStart(2, '0')}:00–\${String(endH).padStart(2, '0')}:00\`;
      bestTimeDialCount = parseInt(peak.cnt, 10) || 0;
    }
    const reachRate = totalCalls > 0 ? Math.min(100, Math.round((answeredAttempts / totalCalls) * 100)) : 0;
    const pickupRate = reachRate;
    const bookingRate = totalCalls > 0 ? Math.min(100, Math.round((bookingNumerator / totalCalls) * 100)) : 0;
    const attemptsPerLead = uniqueLeads > 0 ? Math.round((totalCalls / uniqueLeads) * 10) / 10 : null;
    const voicemailRate = totalCalls > 0 ? Math.min(100, Math.round((voicemailAttempts / totalCalls) * 100)) : 0;
    return {
      ok: true,
      avgDurationSeconds: Math.round(avgSec),
      medianDurationSeconds,
      totalCalls,
      uniqueLeadsDialed7d: uniqueLeads,
      answeredAttempts7d: answeredAttempts,
      noPickupAttempts7d: noPickupAttempts,
      voicemailAttempts,
      voicemailRate,
      peakWeekdayLabel,
      peakWeekdayDialCount,
      pickupRate,
      reachRate,
      avgCallsToFirstPickup,
      leadsWithFirstPickup7d,
      bookingsFromCalls,
      appointments7d: appts7d,
      bookingRate,
      successRate: bookingRate,
      attemptsPerLead,
      bestTime,
      bestTimeDialCount
    };
  } catch (error) {
    console.error('[DASHBOARD CALL QUALITY]', error);
    return null;
  }
}
`;
fs.writeFileSync('lib/dashboard-call-quality.js', header + body + footer);
console.log('ok', fs.statSync('lib/dashboard-call-quality.js').size);
