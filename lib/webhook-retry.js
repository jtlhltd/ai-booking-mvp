// lib/webhook-retry.js
// Webhook retry mechanism for failed VAPI/Twilio webhooks

import { query } from '../db.js';
import messagingService from './messaging-service.js';

/**
 * Add a failed webhook to the retry queue
 */
export async function addWebhookToRetryQueue({
  webhookType, // 'vapi', 'twilio_status', 'twilio_voice', etc.
  webhookUrl, // The endpoint that should receive the webhook
  payload, // The original webhook payload
  headers = {}, // Original headers
  attempt = 1,
  maxAttempts = 5,
  nextRetryAt = null,
  error = null
}) {
  try {
    // Calculate next retry time (exponential backoff)
    if (!nextRetryAt) {
      const delayMinutes = Math.min(5 * Math.pow(2, attempt - 1), 60); // 5min, 10min, 20min, 40min, 60min max
      nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    }
    
    const clientKey = payload?.metadata?.clientKey || payload?.clientKey || 'unknown';
    const leadPhone = payload?.metadata?.leadPhone || payload?.leadPhone || payload?.customer?.number || payload?.call?.customer?.number || payload?.phone || 'unknown';
    
    const result = await query(`
      INSERT INTO retry_queue (
        client_key,
        lead_phone,
        retry_type,
        retry_reason,
        retry_data,
        scheduled_for,
        retry_attempt,
        max_retries,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      clientKey,
      leadPhone,
      `webhook_${webhookType}`,
      error?.message || 'webhook_processing_failed',
      JSON.stringify({
        webhookType,
        webhookUrl,
        payload,
        headers,
        originalError: error?.message || null
      }),
      nextRetryAt,
      attempt,
      maxAttempts,
      'pending'
    ]);
    
    console.log(`[WEBHOOK RETRY] Added to retry queue: ${webhookType} (attempt ${attempt}/${maxAttempts})`);
    return { success: true, id: result.rows[0].id };
    
  } catch (error) {
    console.error('[WEBHOOK RETRY] Error adding to retry queue:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process webhook retry queue
 * Should be called by a cron job
 */
export async function processWebhookRetryQueue() {
  try {
    // Get webhook retries that are due
    const dueRetries = await query(`
      SELECT * FROM retry_queue
      WHERE retry_type LIKE 'webhook_%'
        AND status = 'pending'
        AND scheduled_for <= NOW()
        AND retry_attempt <= max_retries
      ORDER BY scheduled_for ASC
      LIMIT 10
    `);
    
    console.log(`[WEBHOOK RETRY] Processing ${dueRetries.rows.length} webhook retries`);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const retry of dueRetries.rows) {
      try {
        const retryData = typeof retry.retry_data === 'string' 
          ? JSON.parse(retry.retry_data) 
          : retry.retry_data;
        
        const { webhookType, webhookUrl, payload, headers } = retryData;
        
        // Update status to processing
        await query(`
          UPDATE retry_queue
          SET status = 'processing', updated_at = NOW()
          WHERE id = $1
        `, [retry.id]);
        
        // Retry the webhook by making an internal HTTP request
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const fullUrl = `${baseUrl}${webhookUrl}`;
        
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            'X-Retry-Attempt': retry.retry_attempt.toString(),
            'X-Retry-Id': retry.id.toString()
          },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          // Success - mark as completed
          await query(`
            UPDATE retry_queue
            SET status = 'completed', updated_at = NOW()
            WHERE id = $1
          `, [retry.id]);
          
          successCount++;
          console.log(`[WEBHOOK RETRY] ✅ Successfully retried ${webhookType} webhook (attempt ${retry.retry_attempt})`);
          
        } else {
          // Failed - schedule next retry or mark as failed
          if (retry.retry_attempt >= retry.max_retries) {
            await query(`
              UPDATE retry_queue
              SET status = 'failed', updated_at = NOW()
              WHERE id = $1
            `, [retry.id]);
            
            failureCount++;
            console.error(`[WEBHOOK RETRY] ❌ Failed after max retries: ${webhookType} (attempt ${retry.retry_attempt})`);
            
            // Send alert for permanently failed webhooks
            if (process.env.YOUR_EMAIL) {
              try {
                await messagingService.sendEmail({
                  to: process.env.YOUR_EMAIL,
                  subject: `⚠️ Webhook Retry Failed: ${webhookType}`,
                  body: `Webhook retry failed after ${retry.max_retries} attempts.\n\nType: ${webhookType}\nURL: ${webhookUrl}\nLast Error: ${response.status} ${response.statusText}\nTime: ${new Date().toISOString()}`
                });
              } catch (emailError) {
                console.error('[WEBHOOK RETRY] Failed to send alert email:', emailError.message);
              }
            }
            
          } else {
            // Schedule next retry
            const delayMinutes = Math.min(5 * Math.pow(2, retry.retry_attempt), 60);
            const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
            
            await query(`
              UPDATE retry_queue
              SET status = 'pending',
                  retry_attempt = retry_attempt + 1,
                  scheduled_for = $1,
                  updated_at = NOW()
              WHERE id = $2
            `, [nextRetryAt, retry.id]);
            
            console.log(`[WEBHOOK RETRY] ⏳ Scheduled retry ${retry.retry_attempt + 1} for ${webhookType} at ${nextRetryAt.toISOString()}`);
          }
        }
        
      } catch (error) {
        console.error(`[WEBHOOK RETRY] Error processing retry ${retry.id}:`, error);
        
        // Mark as failed if we've exceeded max attempts
        if (retry.retry_attempt >= retry.max_retries) {
          await query(`
            UPDATE retry_queue
            SET status = 'failed', updated_at = NOW()
            WHERE id = $1
          `, [retry.id]);
          failureCount++;
        } else {
          // Schedule next retry
          const delayMinutes = Math.min(5 * Math.pow(2, retry.retry_attempt), 60);
          const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
          
          await query(`
            UPDATE retry_queue
            SET status = 'pending',
                retry_attempt = retry_attempt + 1,
                scheduled_for = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [nextRetryAt, retry.id]);
        }
      }
    }
    
    return {
      processed: dueRetries.rows.length,
      success: successCount,
      failed: failureCount,
      pending: dueRetries.rows.length - successCount - failureCount
    };
    
  } catch (error) {
    console.error('[WEBHOOK RETRY] Error processing retry queue:', error);
    return { processed: 0, error: error.message };
  }
}

/**
 * Get webhook retry statistics
 */
export async function getWebhookRetryStats(clientKey = null) {
  try {
    let queryStr = `
      SELECT 
        retry_type,
        status,
        COUNT(*) as count,
        AVG(retry_attempt) as avg_attempts,
        MAX(retry_attempt) as max_attempts
      FROM retry_queue
      WHERE retry_type LIKE 'webhook_%'
    `;
    
    const params = [];
    if (clientKey) {
      queryStr += ` AND client_key = $1`;
      params.push(clientKey);
    }
    
    queryStr += ` GROUP BY retry_type, status ORDER BY retry_type, status`;
    
    const result = await query(queryStr, params);
    
    return {
      success: true,
      stats: result.rows,
      summary: {
        total: result.rows.reduce((sum, row) => sum + parseInt(row.count || 0), 0),
        byStatus: result.rows.reduce((acc, row) => {
          acc[row.status] = (acc[row.status] || 0) + parseInt(row.count || 0);
          return acc;
        }, {}),
        byType: result.rows.reduce((acc, row) => {
          acc[row.retry_type] = (acc[row.retry_type] || 0) + parseInt(row.count || 0);
          return acc;
        }, {})
      }
    };
    
  } catch (error) {
    console.error('[WEBHOOK RETRY] Error getting stats:', error);
    return { success: false, error: error.message };
  }
}

export default {
  addWebhookToRetryQueue,
  processWebhookRetryQueue,
  getWebhookRetryStats
};

