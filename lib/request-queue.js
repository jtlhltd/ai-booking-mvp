// lib/request-queue.js
// Request queuing for traffic spikes and rate limiting

import { query, dbType } from '../db.js';

const sqlNow = () => (dbType === 'postgres' ? 'NOW()' : `datetime('now')`);

/** `call_queue` rows drained by `processQueue` (never `vapi_call`). */
export const REQUEST_QUEUE_HANDLED_CALL_TYPES = Object.freeze(['sms_send', 'lead_import']);
const REQUEST_QUEUE_IN_LIST = REQUEST_QUEUE_HANDLED_CALL_TYPES.map((t) => `'${t}'`).join(', ');

const PRIORITY_LEVELS = {
  high: 1,
  normal: 5,
  low: 10
};

/**
 * Enqueue a request
 */
export async function enqueueRequest({
  clientKey,
  requestType,
  payload,
  priority = 'normal',
  scheduledFor = null
}) {
  try {
    if (requestType === 'vapi_call') {
      return {
        success: false,
        error: 'vapi_call rows must be created via addToCallQueue (dedupe/merge and main queue processor)'
      };
    }
    if (!scheduledFor) {
      scheduledFor = new Date();
    }
    
    const result = await query(`
      INSERT INTO call_queue (
        client_key,
        lead_phone,
        priority,
        scheduled_for,
        call_type,
        call_data,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      clientKey,
      payload.phone || payload.leadPhone || 'queue',
      PRIORITY_LEVELS[priority] || PRIORITY_LEVELS.normal,
      scheduledFor,
      requestType,
      JSON.stringify(payload),
      'pending'
    ]);
    
    console.log(`[REQUEST QUEUE] Enqueued ${requestType} (priority: ${priority}, ID: ${result.rows[0].id})`);
    return { success: true, queueId: result.rows[0].id };
  } catch (error) {
    console.error('[REQUEST QUEUE ERROR] Failed to enqueue:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process queue (called by cron job)
 */
export async function processQueue(options = {}) {
  const {
    maxConcurrent = 1,
    maxProcess = 50
  } = options;
  
  try {
    // Get pending requests, ordered by priority and scheduled time
    const pending = await query(
      `
      SELECT * FROM call_queue
      WHERE status = 'pending'
        AND call_type IN (${REQUEST_QUEUE_IN_LIST})
        AND scheduled_for <= ${sqlNow()}
      ORDER BY priority ASC, scheduled_for ASC
      LIMIT $1
    `,
      [maxProcess]
    );
    
    if (pending.rows.length === 0) {
      return { processed: 0, queued: 0 };
    }
    
    console.log(`[REQUEST QUEUE] Processing ${pending.rows.length} queued requests`);
    
    let processed = 0;
    let failed = 0;
    
    // Process in batches of maxConcurrent
    for (let i = 0; i < pending.rows.length; i += maxConcurrent) {
      const batch = pending.rows.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (item) => {
        try {
          // Mark as processing
          await query(
            `
            UPDATE call_queue
            SET status = 'processing', updated_at = ${sqlNow()}
            WHERE id = $1
          `,
            [item.id]
          );
          
          // Process based on type
          const payload = typeof item.call_data === 'string'
            ? JSON.parse(item.call_data)
            : item.call_data;
          
          await processRequest(item.call_type, payload, item.client_key);
          
          // Mark as completed
          await query(
            `
            UPDATE call_queue
            SET status = 'completed', updated_at = ${sqlNow()}
            WHERE id = $1
          `,
            [item.id]
          );
          
          processed++;
          return { success: true, id: item.id };
        } catch (error) {
          console.error(`[REQUEST QUEUE] Failed to process item ${item.id}:`, error);

          if (String(error.message || '').includes('outside_business_hours')) {
            const { getFullClient } = await import('../db.js');
            const { getNextBusinessOpenForTenant, getTenantTimezone } = await import('./business-hours.js');
            const rqClient = await getFullClient(item.client_key);
            const rqTz = rqClient
              ? getTenantTimezone(rqClient, process.env.TIMEZONE || process.env.TZ || 'Europe/London')
              : (process.env.TIMEZONE || process.env.TZ || 'Europe/London');
            const next = rqClient
              ? getNextBusinessOpenForTenant(rqClient, new Date(), rqTz, { forOutboundDial: true })
              : new Date(Date.now() + 60 * 60 * 1000);
            await query(
              `
              UPDATE call_queue
              SET status = 'pending',
                  scheduled_for = $1,
                  updated_at = ${sqlNow()}
              WHERE id = $2
            `,
              [next, item.id]
            );
            return { success: true, id: item.id, deferredHours: true };
          }
          
          // Mark as failed, schedule retry
          const retryAttempt = (item.retry_attempt || 0) + 1;
          if (retryAttempt < 3) {
            const nextRetry = new Date(Date.now() + (retryAttempt * 60000)); // 1min, 2min, 3min
            await query(
              `
              UPDATE call_queue
              SET status = 'pending', 
                  scheduled_for = $1,
                  updated_at = ${sqlNow()}
              WHERE id = $2
            `,
              [nextRetry, item.id]
            );
          } else {
            await query(
              `
              UPDATE call_queue
              SET status = 'failed', updated_at = ${sqlNow()}
              WHERE id = $1
            `,
              [item.id]
            );
          }
          
          failed++;
          return { success: false, id: item.id, error: error.message };
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    return { processed, failed, queued: pending.rows.length };
  } catch (error) {
    console.error('[REQUEST QUEUE ERROR] Failed to process queue:', error);
    return { processed: 0, failed: 0, error: error.message };
  }
}

/**
 * Process individual request based on type
 */
async function processRequest(requestType, payload, clientKey) {
  switch (requestType) {
    case 'sms_send':
      const messagingService = (await import('./messaging-service.js')).default;
      await messagingService.sendSMS({
        to: payload.to,
        message: payload.message,
        clientKey
      });
      break;
      
    case 'lead_import':
      const { bulkProcessLeads } = await import('./lead-deduplication.js');
      await bulkProcessLeads([payload], clientKey);
      break;
      
    default:
      throw new Error(`Unknown request type: ${requestType}`);
  }
}

/**
 * Get queue status
 */
export async function getQueueStatus(clientKey = null) {
  try {
    const avgWaitSql =
      dbType === 'postgres'
        ? 'AVG(EXTRACT(EPOCH FROM (NOW() - scheduled_for))) as avg_wait_seconds'
        : `AVG((julianday('now') - julianday(scheduled_for)) * 86400.0) as avg_wait_seconds`;
    let sql = `
      SELECT 
        status,
        COUNT(*) as count,
        ${avgWaitSql}
      FROM call_queue
      WHERE 1=1
    `;
    const params = [];
    
    if (clientKey) {
      sql += ` AND client_key = $1`;
      params.push(clientKey);
    }
    
    sql += ` GROUP BY status`;
    
    const result = await query(sql, params);
    
    return {
      byStatus: result.rows.reduce((acc, row) => {
        acc[row.status] = {
          count: parseInt(row.count),
          avgWaitSeconds: parseFloat(row.avg_wait_seconds || 0)
        };
        return acc;
      }, {}),
      total: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
    };
  } catch (error) {
    console.error('[REQUEST QUEUE ERROR] Failed to get status:', error);
    return { byStatus: {}, total: 0 };
  }
}

