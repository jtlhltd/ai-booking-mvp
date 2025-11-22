// lib/dead-letter-queue.js
// Dead Letter Queue for permanently failed operations

import { query } from '../db.js';
import { sendCriticalAlert } from './error-monitoring.js';

/**
 * Move failed operation to dead letter queue
 */
export async function moveToDLQ({
  clientKey,
  originalTable,
  originalId,
  operationType,
  payload,
  errorHistory = [],
  failureReason,
  retryCount,
  maxRetries
}) {
  try {
    const result = await query(`
      INSERT INTO dead_letter_queue (
        client_key,
        original_table,
        original_id,
        operation_type,
        payload,
        error_history,
        failure_reason,
        retry_count,
        max_retries,
        first_failed_at,
        last_attempted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `, [
      clientKey,
      originalTable,
      originalId,
      operationType,
      JSON.stringify(payload),
      JSON.stringify(errorHistory),
      failureReason,
      retryCount,
      maxRetries
    ]);
    
    console.log(`[DLQ] Moved ${operationType} to DLQ (ID: ${result.rows[0].id})`);
    
    // Send alert for critical operations
    if (operationType === 'booking' || operationType === 'reminder') {
      await sendCriticalAlert({
        message: `Operation moved to DLQ: ${operationType} for ${clientKey}`,
        errorType: 'Dead Letter Queue',
        severity: 'warning',
        metadata: {
          clientKey,
          operationType,
          failureReason,
          retryCount,
          dlqId: result.rows[0].id
        }
      });
    }
    
    return { success: true, dlqId: result.rows[0].id };
  } catch (error) {
    console.error('[DLQ ERROR] Failed to move to DLQ:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all items in DLQ
 */
export async function getDLQItems(filters = {}) {
  try {
    let sql = 'SELECT * FROM dead_letter_queue WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (filters.clientKey) {
      sql += ` AND client_key = $${++paramCount}`;
      params.push(filters.clientKey);
    }
    
    if (filters.operationType) {
      sql += ` AND operation_type = $${++paramCount}`;
      params.push(filters.operationType);
    }
    
    if (filters.resolved === false) {
      sql += ` AND resolved_at IS NULL`;
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${++paramCount}`;
    params.push(filters.limit || 100);
    
    const result = await query(sql, params);
    
    return result.rows.map(row => ({
      id: row.id,
      clientKey: row.client_key,
      operationType: row.operation_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      errorHistory: typeof row.error_history === 'string' ? JSON.parse(row.error_history) : row.error_history,
      failureReason: row.failure_reason,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      firstFailedAt: row.first_failed_at,
      lastAttemptedAt: row.last_attempted_at,
      resolvedAt: row.resolved_at,
      resolutionNotes: row.resolution_notes,
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('[DLQ ERROR] Failed to get DLQ items:', error);
    return [];
  }
}

/**
 * Retry a DLQ item
 */
export async function retryDLQItem(dlqId, retryFunction) {
  try {
    const item = await query('SELECT * FROM dead_letter_queue WHERE id = $1', [dlqId]);
    if (item.rows.length === 0) {
      return { success: false, error: 'DLQ item not found' };
    }
    
    const dlqItem = item.rows[0];
    const payload = typeof dlqItem.payload === 'string' 
      ? JSON.parse(dlqItem.payload) 
      : dlqItem.payload;
    
    // Attempt retry
    try {
      await retryFunction(payload);
      
      // Success - mark as resolved
      await query(`
        UPDATE dead_letter_queue
        SET resolved_at = NOW(), resolution_notes = 'Manually retried and succeeded'
        WHERE id = $1
      `, [dlqId]);
      
      return { success: true, message: 'Retry successful' };
    } catch (retryError) {
      // Retry failed - update error history
      const errorHistory = typeof dlqItem.error_history === 'string'
        ? JSON.parse(dlqItem.error_history)
        : dlqItem.error_history;
      
      errorHistory.push({
        timestamp: new Date().toISOString(),
        error: retryError.message,
        attempt: 'manual_retry'
      });
      
      await query(`
        UPDATE dead_letter_queue
        SET error_history = $1, last_attempted_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(errorHistory), dlqId]);
      
      return { success: false, error: retryError.message };
    }
  } catch (error) {
    console.error('[DLQ ERROR] Failed to retry DLQ item:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Resolve a DLQ item (mark as handled)
 */
export async function resolveDLQItem(dlqId, resolutionNotes = '') {
  try {
    await query(`
      UPDATE dead_letter_queue
      SET resolved_at = NOW(), resolution_notes = $1
      WHERE id = $2
    `, [resolutionNotes, dlqId]);
    
    return { success: true };
  } catch (error) {
    console.error('[DLQ ERROR] Failed to resolve DLQ item:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up old resolved DLQ items (older than 90 days)
 */
export async function cleanupDLQ() {
  try {
    const result = await query(`
      DELETE FROM dead_letter_queue
      WHERE resolved_at IS NOT NULL
        AND resolved_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `);
    
    console.log(`[DLQ CLEANUP] Deleted ${result.rows.length} old resolved items`);
    return { deleted: result.rows.length };
  } catch (error) {
    console.error('[DLQ CLEANUP ERROR]', error);
    return { deleted: 0, error: error.message };
  }
}

