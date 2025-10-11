// lib/follow-up-processor.js
// Process scheduled follow-up messages from retry_queue

import { query } from '../db.js';
import messagingService from './messaging-service.js';

/**
 * Process follow-up queue (called by cron job every 5 minutes)
 * Sends scheduled SMS and Email follow-ups from retry_queue
 */
export async function processFollowUpQueue() {
  try {
    // Get follow-ups that are due now (within next 5 minutes) - database-agnostic
    const { getFollowUpsDue } = await import('./database-health.js');
    const dueFollowUps = await getFollowUpsDue(5);
    
    console.log(`[FOLLOW-UP QUEUE] Processing ${dueFollowUps.rows.length} due follow-ups`);
    
    let processed = 0;
    let failed = 0;
    
    for (const followUp of dueFollowUps.rows) {
      try {
        const data = typeof followUp.retry_data === 'string' 
          ? JSON.parse(followUp.retry_data) 
          : followUp.retry_data;
        
        // Send based on channel type
        if (followUp.retry_type === 'sms') {
          await sendFollowUpSMS({
            to: followUp.lead_phone,
            message: data.message
          });
        } else if (followUp.retry_type === 'email') {
          // Extract email from lead data (you'll need to store this)
          // For now, we'll skip email follow-ups if no email is available
          console.log(`[FOLLOW-UP QUEUE] ⚠️ Email follow-up skipped - no email stored for ${followUp.lead_phone}`);
        }
        
        // Mark as completed
        await query(`
          UPDATE retry_queue 
          SET status = 'completed', updated_at = now()
          WHERE id = $1
        `, [followUp.id]);
        
        processed++;
        console.log(`[FOLLOW-UP QUEUE] ✅ Sent ${followUp.retry_type} follow-up to ${followUp.lead_phone}`);
        
      } catch (error) {
        failed++;
        console.error(`[FOLLOW-UP QUEUE] Error processing follow-up ${followUp.id}:`, error);
        
        // Mark as failed
        await query(`
          UPDATE retry_queue 
          SET status = 'failed', updated_at = now()
          WHERE id = $1
        `, [followUp.id]);
      }
    }
    
    return { processed, failed, total: dueFollowUps.rows.length };
    
  } catch (error) {
    console.error('[FOLLOW-UP QUEUE ERROR]', error);
    return { processed: 0, failed: 0, error: error.message };
  }
}

/**
 * Send follow-up SMS
 */
async function sendFollowUpSMS({ to, message }) {
  try {
    const result = await messagingService.sendSMS({ to, body: message });
    
    if (!result.success) {
      console.error('[FOLLOW-UP SMS ERROR]', result.error);
      throw new Error(result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('[FOLLOW-UP SMS ERROR]', error);
    throw error;
  }
}

export default {
  processFollowUpQueue
};

