// lib/request-queue.js
// Request queuing for traffic spikes and rate limiting

import { query } from '../db.js';

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
    maxConcurrent = 10,
    maxProcess = 50
  } = options;
  
  try {
    // Get pending requests, ordered by priority and scheduled time
    const pending = await query(`
      SELECT * FROM call_queue
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
      ORDER BY priority ASC, scheduled_for ASC
      LIMIT $1
    `, [maxProcess]);
    
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
          await query(`
            UPDATE call_queue
            SET status = 'processing', updated_at = NOW()
            WHERE id = $1
          `, [item.id]);
          
          // Process based on type
          const payload = typeof item.call_data === 'string'
            ? JSON.parse(item.call_data)
            : item.call_data;
          
          await processRequest(item.call_type, payload, item.client_key);
          
          // Mark as completed
          await query(`
            UPDATE call_queue
            SET status = 'completed', updated_at = NOW()
            WHERE id = $1
          `, [item.id]);
          
          processed++;
          return { success: true, id: item.id };
        } catch (error) {
          console.error(`[REQUEST QUEUE] Failed to process item ${item.id}:`, error);
          
          // Mark as failed, schedule retry
          const retryAttempt = (item.retry_attempt || 0) + 1;
          if (retryAttempt < 3) {
            const nextRetry = new Date(Date.now() + (retryAttempt * 60000)); // 1min, 2min, 3min
            await query(`
              UPDATE call_queue
              SET status = 'pending', 
                  scheduled_for = $1,
                  updated_at = NOW()
              WHERE id = $2
            `, [nextRetry, item.id]);
          } else {
            await query(`
              UPDATE call_queue
              SET status = 'failed', updated_at = NOW()
              WHERE id = $1
            `, [item.id]);
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
    case 'vapi_call':
      const { callLeadInstantly } = await import('./instant-calling.js');
      const { getFullClient } = await import('../db.js');
      
      // Get client data
      const client = await getFullClient(clientKey);
      
      // Map call queue payload to lead format expected by callLeadInstantly
      const lead = {
        phone: payload.leadPhone || payload.phone,
        name: payload.leadName || payload.name,
        service: payload.leadService || payload.service,
        source: payload.leadSource || payload.source,
        leadScore: payload.leadScore || 50,
        ...payload // Include any other fields
      };
      
      await callLeadInstantly({
        clientKey,
        lead,
        client
      });
      break;
      
    case 'sms_send':
      const messagingService = (await import('./messaging-service.js')).default;
      await messagingService.sendSMS({
        to: payload.to,
        message: payload.message,
        clientKey
      });
      break;
      
    case 'lead_import':
      const { processBulkLeads } = await import('./lead-deduplication.js');
      await processBulkLeads(clientKey, [payload]);
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
    let sql = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (NOW() - scheduled_for))) as avg_wait_seconds
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

