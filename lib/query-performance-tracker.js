// Query Performance Tracker
// Tracks slow queries, stores in database, and provides optimization recommendations

import crypto from 'crypto';
import { query, dbType } from '../db.js';
import { sendCriticalAlert } from './error-monitoring.js';
import { reserveAlertEmailSlot, GLOBAL_SLOW_QUERY_KEY } from './alert-email-throttle.js';

const SLOW_QUERY_THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000; // 1 second
const CRITICAL_QUERY_THRESHOLD = parseInt(process.env.CRITICAL_QUERY_THRESHOLD) || 5000; // 5 seconds

/** Min ms between critical emails for the same query shape (per process; avoids bursts when DB is saturated). */
const SLOW_QUERY_EMAIL_COOLDOWN_MS = parseInt(process.env.SLOW_QUERY_EMAIL_COOLDOWN_MS, 10) || 30 * 60 * 1000;
/** Max critical slow-query emails in a sliding window across all shapes (per process). */
const SLOW_QUERY_EMAIL_GLOBAL_MAX = parseInt(process.env.SLOW_QUERY_EMAIL_GLOBAL_MAX, 10) || 6;
const SLOW_QUERY_EMAIL_GLOBAL_WINDOW_MS =
  parseInt(process.env.SLOW_QUERY_EMAIL_GLOBAL_WINDOW_MS, 10) || 60 * 60 * 1000;
/** Min ms between any critical slow-query email across all instances (Postgres; fixes multi-worker floods). */
const SLOW_QUERY_EMAIL_DB_MIN_INTERVAL_MS =
  parseInt(process.env.SLOW_QUERY_EMAIL_DB_MIN_INTERVAL_MS, 10) || 45 * 60 * 1000;

const lastCriticalEmailByQueryHash = new Map();
const criticalEmailTimestamps = [];

function pruneCriticalEmailState(now) {
  const windowStart = now - SLOW_QUERY_EMAIL_GLOBAL_WINDOW_MS;
  while (criticalEmailTimestamps.length > 0 && criticalEmailTimestamps[0] < windowStart) {
    criticalEmailTimestamps.shift();
  }
  const hashCutoff = now - SLOW_QUERY_EMAIL_COOLDOWN_MS * 2;
  for (const [hash, sentAt] of lastCriticalEmailByQueryHash) {
    if (sentAt < hashCutoff) {
      lastCriticalEmailByQueryHash.delete(hash);
    }
  }
}

function shouldSendCriticalSlowQueryEmail(queryHash, now) {
  pruneCriticalEmailState(now);
  if (criticalEmailTimestamps.length >= SLOW_QUERY_EMAIL_GLOBAL_MAX) {
    return { send: false, reason: 'global_cap' };
  }
  const lastForHash = lastCriticalEmailByQueryHash.get(queryHash) || 0;
  if (now - lastForHash < SLOW_QUERY_EMAIL_COOLDOWN_MS) {
    return { send: false, reason: 'per_query_cooldown' };
  }
  return { send: true };
}

function recordCriticalSlowQueryEmail(queryHash, now) {
  lastCriticalEmailByQueryHash.set(queryHash, now);
  criticalEmailTimestamps.push(now);
}

// In-memory cache for query hashes (to avoid DB lookups on every query)
const queryHashCache = new Map();

/**
 * Normalize SQL for email throttle grouping (literals and $n placeholders should not split buckets).
 */
function normalizeQueryShapeForThrottle(queryText) {
  const raw = queryText != null ? String(queryText) : '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\$(\d+)/g, '?')
    .replace(/'[^']*'/g, "'?'")
    .replace(/"[^"]*"/g, '"?"')
    .replace(/\b\d+\b/g, '?')
    .toLowerCase();
}

/**
 * Hash of logical query shape — use for email cooldown keys (not for query_performance rows).
 */
function hashQueryShapeForThrottle(queryText) {
  return crypto.createHash('sha256').update(normalizeQueryShapeForThrottle(queryText)).digest('hex').substring(0, 16);
}

/**
 * Generate a hash for a query (for deduplication)
 */
function hashQuery(queryText) {
  // Normalize query (remove extra whitespace, lowercase)
  const normalized = queryText.trim().replace(/\s+/g, ' ').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Track query performance
 * IMPORTANT: This function is fire-and-forget to avoid blocking the main query
 */
export async function trackQueryPerformance(queryText, duration, params = []) {
  try {
    const raw = queryText != null ? String(queryText) : '';
    const collapsed = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!collapsed) {
      return null;
    }

    // CRITICAL: Don't track queries to query_performance table (prevents feedback loop)
    if (collapsed.includes('query_performance') || collapsed.includes('insert into query_performance')) {
      return null;
    }
    if (collapsed.includes('query_performance_daily')) {
      return null;
    }

    if (collapsed.includes('alert_email_throttle')) {
      return null;
    }

    // DB saturation shows up as "slow" even for trivial probes — don't email for these
    if (
      collapsed.startsWith('select 1') ||
      collapsed.includes('select 1 as healthy') ||
      (collapsed.includes('as healthy') && collapsed.includes('now()'))
    ) {
      return null;
    }

    // Skip tracking for very fast queries (< 100ms) to reduce overhead
    if (duration < 100) {
      return null;
    }

    // Recording stream / poolQuerySelect path: skip tracker entirely (avoids query_performance write storms + false alerts).
    const isRecordingStreamLookup =
      collapsed.includes('recording_url') &&
      collapsed.includes('from calls') &&
      /\bwhere\b/.test(collapsed) &&
      /\bid\s*=\s*\$\d+/.test(collapsed) &&
      collapsed.includes('client_key');
    if (isRecordingStreamLookup) {
      if (duration >= CRITICAL_QUERY_THRESHOLD) {
        console.warn(
          `[SLOW QUERY] ${duration}ms (not tracked — recording stream lookup; duration is usually pool/queue wait, not SQL cost)`
        );
      }
      return null;
    }

    const queryHash = hashQuery(queryText);
    const queryPreview = raw.trim().substring(0, 200);

    // Single-row call_queue updates are often lock waits under load, not a missing index.
    const isCallQueuePkTouch =
      collapsed.includes('update call_queue') && /\bwhere\s+id\s*=/.test(collapsed);

    // PK lookup on call_time_bandit; slow = queue/contention, not a missing index.
    const isCallTimeBanditRead =
      collapsed.includes('from call_time_bandit') &&
      collapsed.includes('client_key');

    // Read-side A/B analytics over ab_test_results — often slow under DB saturation, not a surprise “bad query”.
    const isAbTestAnalyticsRead =
      collapsed.startsWith('select') && collapsed.includes('from ab_test_results');

    // Check if this is a slow query
    const isSlow = duration >= SLOW_QUERY_THRESHOLD;
    const pastCriticalThreshold = duration >= CRITICAL_QUERY_THRESHOLD;
    const isCritical =
      pastCriticalThreshold &&
      !isCallQueuePkTouch &&
      !isCallTimeBanditRead &&
      !isAbTestAnalyticsRead;

    // Log slow queries
    if (isSlow) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${queryPreview}...`);
    }

    if (pastCriticalThreshold && isCallQueuePkTouch) {
      console.warn(
        `[SLOW QUERY] ${duration}ms (critical threshold; no email — call_queue PK touch likely lock wait): ${queryPreview}...`
      );
    }

    if (pastCriticalThreshold && isCallTimeBanditRead) {
      console.warn(
        `[SLOW QUERY] ${duration}ms (critical threshold; no email — call_time_bandit read likely queue wait): ${queryPreview}...`
      );
    }

    if (pastCriticalThreshold && isAbTestAnalyticsRead) {
      console.warn(
        `[SLOW QUERY] ${duration}ms (critical threshold; no email — ab_test_results analytics read under load): ${queryPreview}...`
      );
    }

    // Send alert for critical queries (async, don't wait) — throttled so DB saturation does not flood email
    if (isCritical) {
      console.error(`[CRITICAL QUERY] ${duration}ms: ${queryPreview}...`);
      const now = Date.now();
      const throttleShapeHash = hashQueryShapeForThrottle(queryText);
      const emailDecision = shouldSendCriticalSlowQueryEmail(throttleShapeHash, now);
      if (!emailDecision.send) {
        console.warn(
          `[QUERY TRACKER] Critical slow query email suppressed (${emailDecision.reason}); check logs / DB metrics. ${duration}ms shapeHash=${throttleShapeHash}`
        );
      } else {
        reserveAlertEmailSlot(GLOBAL_SLOW_QUERY_KEY, SLOW_QUERY_EMAIL_DB_MIN_INTERVAL_MS)
          .then(dbAllowed => {
            if (!dbAllowed) {
              console.warn(
                `[QUERY TRACKER] Critical slow query email suppressed (db_cross_process_throttle, minIntervalMs=${SLOW_QUERY_EMAIL_DB_MIN_INTERVAL_MS}); ${duration}ms shapeHash=${throttleShapeHash}`
              );
              return;
            }
            recordCriticalSlowQueryEmail(throttleShapeHash, now);
            return sendCriticalAlert({
              message: `Critical slow query detected: ${duration}ms\nQuery: ${queryPreview}...`,
              errorType: 'Slow Query',
              severity: 'critical',
              metadata: {
                duration,
                queryPreview,
                queryHash,
                shapeHash: throttleShapeHash,
                threshold: CRITICAL_QUERY_THRESHOLD
              }
            });
          })
          .catch(err => {
            console.warn('[QUERY TRACKER] Failed to send alert:', err.message);
          });
      }
    }

    // Update query_performance table (async, fire-and-forget)
    // Use setImmediate to ensure this doesn't block the main query
    setImmediate(async () => {
      try {
        // Use a simpler, faster query - avoid complex calculations in ON CONFLICT
        await query(`
          INSERT INTO query_performance (query_hash, query_preview, avg_duration, max_duration, call_count, last_executed_at)
          VALUES ($1, $2, $3, $4, 1, NOW())
          ON CONFLICT (query_hash) 
          DO UPDATE SET
            avg_duration = (query_performance.avg_duration * query_performance.call_count::numeric + $3) / (query_performance.call_count + 1),
            max_duration = GREATEST(query_performance.max_duration, $4),
            call_count = query_performance.call_count + 1,
            last_executed_at = NOW()
        `, [queryHash, queryPreview, duration, duration]);
      } catch (dbError) {
        // Silently fail - don't log or alert on tracking failures
        // This prevents feedback loops
      }
    });

    return {
      queryHash,
      duration,
      isSlow,
      isCritical
    };
  } catch (error) {
    // Silently fail - don't let tracking errors break the application
    return null;
  }
}

/**
 * Get slow queries from the database
 */
export async function getSlowQueries(limit = 20, minDuration = SLOW_QUERY_THRESHOLD) {
  try {
    const { rows } = await query(`
      SELECT 
        query_hash,
        query_preview,
        avg_duration,
        max_duration,
        call_count,
        last_executed_at,
        created_at
      FROM query_performance
      WHERE avg_duration >= $1
      ORDER BY avg_duration DESC
      LIMIT $2
    `, [minDuration, limit]);

    return rows.map(row => ({
      hash: row.query_hash,
      preview: row.query_preview,
      avgDuration: parseFloat(row.avg_duration),
      maxDuration: parseFloat(row.max_duration),
      callCount: parseInt(row.call_count),
      lastExecuted: row.last_executed_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('[QUERY TRACKER] Error fetching slow queries:', error.message);
    return [];
  }
}

/**
 * Get query performance statistics
 */
export async function getQueryPerformanceStats() {
  try {
    const { rows } = await query(`
      SELECT 
        COUNT(*) as total_queries,
        COUNT(CASE WHEN avg_duration >= $1 THEN 1 END) as slow_queries,
        COUNT(CASE WHEN avg_duration >= $2 THEN 1 END) as critical_queries,
        AVG(avg_duration) as avg_duration,
        MAX(max_duration) as max_duration,
        SUM(call_count) as total_calls
      FROM query_performance
    `, [SLOW_QUERY_THRESHOLD, CRITICAL_QUERY_THRESHOLD]);

    if (rows.length === 0) {
      return {
        totalQueries: 0,
        slowQueries: 0,
        criticalQueries: 0,
        avgDuration: 0,
        maxDuration: 0,
        totalCalls: 0
      };
    }

    const row = rows[0];
    return {
      totalQueries: parseInt(row.total_queries),
      slowQueries: parseInt(row.slow_queries),
      criticalQueries: parseInt(row.critical_queries),
      avgDuration: parseFloat(row.avg_duration) || 0,
      maxDuration: parseFloat(row.max_duration) || 0,
      totalCalls: parseInt(row.total_calls) || 0
    };
  } catch (error) {
    console.error('[QUERY TRACKER] Error fetching performance stats:', error.message);
    return null;
  }
}

/**
 * Generate optimization recommendations for slow queries
 */
export async function getOptimizationRecommendations() {
  try {
    const slowQueries = await getSlowQueries(10);
    const recommendations = [];

    for (const query of slowQueries) {
      const preview = query.preview.toLowerCase();
      const rec = {
        queryHash: query.hash,
        queryPreview: query.preview,
        avgDuration: query.avgDuration,
        callCount: query.callCount,
        suggestions: []
      };

      // Check for common optimization opportunities
      if (preview.includes('select') && !preview.includes('where')) {
        rec.suggestions.push('Add WHERE clause to filter results');
      }

      if (preview.includes('select *')) {
        rec.suggestions.push('Select only needed columns instead of *');
      }

      if (preview.includes('order by') && !preview.includes('limit')) {
        rec.suggestions.push('Add LIMIT clause to reduce result set size');
      }

      if (preview.includes('join') && !preview.includes('on')) {
        rec.suggestions.push('Ensure JOIN conditions are properly indexed');
      }

      if (preview.includes('like') && preview.includes('%')) {
        rec.suggestions.push('Consider full-text search or indexed search instead of LIKE with wildcards');
      }

      if (query.callCount > 100) {
        rec.suggestions.push('High call count - consider adding result caching');
      }

      if (rec.suggestions.length > 0) {
        recommendations.push(rec);
      }
    }

    return recommendations;
  } catch (error) {
    console.error('[QUERY TRACKER] Error generating recommendations:', error.message);
    return [];
  }
}

/**
 * Clean up old query performance data (older than 30 days)
 */
export async function cleanupOldQueryData(daysToKeep = 30) {
  try {
    const { rowCount } = await query(`
      DELETE FROM query_performance
      WHERE last_executed_at < NOW() - INTERVAL '${daysToKeep} days'
        AND call_count < 5
    `);

    console.log(`[QUERY TRACKER] Cleaned up ${rowCount} old query performance records`);
    return rowCount;
  } catch (error) {
    console.error('[QUERY TRACKER] Error cleaning up old data:', error.message);
    return 0;
  }
}

/**
 * Best-effort bucket for heavy-read triage (no stack traces; SQL preview only).
 * @param {string} preview
 * @returns {string|null}
 */
export function inferHeavyReadSurface(preview) {
  const p = String(preview || '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!p) return null;
  // Distinctive shapes from demo-dashboard / client dashboard bundle
  if (p.includes('phone_match_key') && p.includes('from calls')) return 'demo_dashboard';
  if (p.includes('lead_lookup') && p.includes('from calls')) return 'demo_dashboard';
  if (p.includes('from appointments') && p.includes('left join leads')) return 'demo_dashboard';
  if (p.includes('from leads') && p.includes('group by') && p.includes('service')) return 'demo_dashboard';
  if (p.includes('call_queue') && p.includes('client_key')) return 'call_queue';
  if (p.includes('call_queue')) return 'call_queue';
  if (p.includes(' from leads') || p.includes('from leads')) return 'leads';
  if (p.includes('appointments')) return 'appointments';
  if (p.includes(' from calls') || p.includes('from calls')) return 'calls';
  if (p.includes(' from tenants') || p.includes('from tenants')) return 'tenants';
  if (p.includes(' from clients') || p.includes('from clients')) return 'admin_clients';
  if (p.includes('leads_portal') || p.includes('portal_lead')) return 'leads_portal';
  if (p.includes('analytics_events') || p.includes('conversion_funnel')) return 'analytics';
  return 'other';
}

/**
 * Top repeat offenders from query_performance (avg × call_count score).
 * p50/p95 are not stored per execution; response exposes avg_ms / max_ms as evidence.
 */
export async function getTopSlowQueryOffenders({ limit = 25, windowHours = 168, minAvgMs = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 25));
  const wh = Math.max(1, Math.min(24 * 60, Number(windowHours) || 168));
  const minAvg = Math.max(50, Number(minAvgMs) || 100);
  try {
    let rows;
    if (dbType === 'postgres') {
      const r = await query(
        `
        SELECT query_hash, query_preview, avg_duration, max_duration, call_count, last_executed_at
        FROM query_performance
        WHERE avg_duration >= $1
          AND last_executed_at >= NOW() - ($2 * INTERVAL '1 hour')
        ORDER BY (avg_duration * call_count::numeric) DESC NULLS LAST
        LIMIT $3
      `,
        [minAvg, wh, lim]
      );
      rows = r.rows || [];
    } else {
      const offset = `-${wh} hours`;
      const r = await query(
        `
        SELECT query_hash, query_preview, avg_duration, max_duration, call_count, last_executed_at
        FROM query_performance
        WHERE avg_duration >= $1
          AND datetime(last_executed_at) > datetime('now', $2)
        ORDER BY (avg_duration * call_count) DESC
        LIMIT $3
      `,
        [minAvg, offset, lim]
      );
      rows = r.rows || [];
    }

    return (rows || []).map((row) => {
      const preview = row.query_preview || '';
      const avg = Number(row.avg_duration) || 0;
      const max = Number(row.max_duration) || 0;
      const cnt = Number(row.call_count) || 0;
      return {
        queryHash: row.query_hash,
        queryPreview: preview,
        avgMs: avg,
        maxMs: max,
        callCount: cnt,
        evidenceNote: 'p50/p95 are not stored; avg_ms and max_ms come from query_performance aggregates.',
        score: avg * cnt,
        inferredSurface: inferHeavyReadSurface(preview),
        lastExecutedAt: row.last_executed_at
      };
    });
  } catch (error) {
    console.error('[QUERY TRACKER] getTopSlowQueryOffenders:', error?.message || error);
    return [];
  }
}

/** Persist top rows into query_performance_daily for trend analysis (PR-14). */
export async function appendQueryPerformanceDailySnapshot() {
  try {
    if (dbType === 'postgres') {
      await query(`
        INSERT INTO query_performance_daily (query_hash, query_preview, avg_duration, max_duration, call_count, inferred_surface)
        SELECT qp.query_hash, qp.query_preview, qp.avg_duration::double precision, qp.max_duration::double precision, qp.call_count,
               NULL
        FROM query_performance qp
        WHERE qp.call_count >= 2
        ORDER BY (qp.avg_duration * qp.call_count::numeric) DESC
        LIMIT 100
      `);
    } else {
      await query(`
        INSERT INTO query_performance_daily (query_hash, query_preview, avg_duration, max_duration, call_count, inferred_surface)
        SELECT qp.query_hash, qp.query_preview, qp.avg_duration, qp.max_duration, qp.call_count,
               NULL
        FROM query_performance qp
        WHERE qp.call_count >= 2
        ORDER BY (qp.avg_duration * qp.call_count) DESC
        LIMIT 100
      `);
    }
    return { ok: true };
  } catch (error) {
    console.warn('[QUERY TRACKER] appendQueryPerformanceDailySnapshot skipped:', error?.message || error);
    return { ok: false, error: String(error?.message || error) };
  }
}

