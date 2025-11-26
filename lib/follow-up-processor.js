// lib/follow-up-processor.js
// Process scheduled follow-up messages from retry_queue
// Enhanced with opt-out checking, booking status verification, and better error handling

import { query } from '../db.js';
import messagingService from './messaging-service.js';

/**
 * Check if lead has opted out
 */
async function checkOptOut(phone) {
  try {
    const { isOptedOut } = await import('./lead-deduplication.js');
    return await isOptedOut(phone);
  } catch (error) {
    console.warn('[FOLLOW-UP] Could not check opt-out status:', error.message);
    return false; // Fail open - don't block if check fails
  }
}

/**
 * Check if lead has already booked an appointment
 */
async function hasBookedAppointment(clientKey, leadPhone) {
  try {
    const result = await query(`
      SELECT COUNT(*) as count
      FROM appointments a
      JOIN leads l ON a.lead_id = l.id
      WHERE l.client_key = $1 
        AND l.phone = $2
        AND a.status = 'booked'
        AND a.start_iso > NOW()
      LIMIT 1
    `, [clientKey, leadPhone]);
    
    return parseInt(result.rows[0]?.count || 0) > 0;
  } catch (error) {
    console.warn('[FOLLOW-UP] Could not check booking status:', error.message);
    return false; // Fail open
  }
}

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
    let skipped = 0;
    const skipReasons = {
      optedOut: 0,
      alreadyBooked: 0,
      noEmail: 0,
      invalidData: 0
    };
    
    for (const followUp of dueFollowUps.rows) {
      try {
        const data = typeof followUp.retry_data === 'string' 
          ? JSON.parse(followUp.retry_data) 
          : followUp.retry_data;
        
        const clientKey = followUp.client_key || data.clientKey;
        const leadPhone = followUp.lead_phone;
        
        // Pre-flight checks
        // 1. Check opt-out status (GDPR compliance)
        if (await checkOptOut(leadPhone)) {
          console.log(`[FOLLOW-UP QUEUE] ⚠️ Skipped ${leadPhone} - opted out`);
          skipReasons.optedOut++;
          
          // Cancel all pending follow-ups for this lead
          await query(`
            UPDATE retry_queue 
            SET status = 'cancelled', updated_at = now()
            WHERE client_key = $1 AND lead_phone = $2 AND status = 'pending'
          `, [clientKey, leadPhone]);
          
          continue;
        }
        
        // 2. Check if lead has already booked (no need to follow up)
        if (await hasBookedAppointment(clientKey, leadPhone)) {
          console.log(`[FOLLOW-UP QUEUE] ⚠️ Skipped ${leadPhone} - already booked`);
          skipReasons.alreadyBooked++;
          
          // Cancel remaining follow-ups for this lead
          await query(`
            UPDATE retry_queue 
            SET status = 'cancelled', updated_at = now()
            WHERE client_key = $1 AND lead_phone = $2 AND status = 'pending'
          `, [clientKey, leadPhone]);
          
          continue;
        }
        
        // 3. Validate data
        if (!data || !data.message) {
          console.log(`[FOLLOW-UP QUEUE] ⚠️ Skipped ${followUp.id} - invalid data`);
          skipReasons.invalidData++;
          
          await query(`
            UPDATE retry_queue 
            SET status = 'failed', updated_at = now()
            WHERE id = $1
          `, [followUp.id]);
          
          continue;
        }
        
        // Send based on channel type
        if (followUp.retry_type === 'sms') {
          await sendFollowUpSMS({
            to: leadPhone,
            message: data.message,
            clientKey
          });
        } else if (followUp.retry_type === 'email') {
          // Look up lead email from database
          const leadResult = await query(`
            SELECT email, name 
            FROM leads 
            WHERE phone = $1 AND client_key = $2
            ORDER BY created_at DESC
            LIMIT 1
          `, [followUp.lead_phone, followUp.client_key || data.clientKey]);
          
          if (leadResult.rows.length > 0 && leadResult.rows[0].email) {
            const leadEmail = leadResult.rows[0].email;
            const leadName = leadResult.rows[0].name || data.leadName || 'there';
            
            await sendFollowUpEmail({
              to: leadEmail,
              subject: data.subject || 'Following up on your inquiry',
              message: data.message,
              leadName,
              clientKey: followUp.client_key || data.clientKey
            });
          } else {
            // No email found - skip but log it
            console.log(`[FOLLOW-UP QUEUE] ⚠️ Email follow-up skipped - no email stored for ${followUp.lead_phone}`);
            skipReasons.noEmail++;
            // Mark as completed anyway (no point retrying without email)
          }
        } else if (followUp.retry_type === 'call') {
          // Retry call functionality
          await sendRetryCall({
            clientKey: followUp.client_key,
            leadPhone: followUp.lead_phone,
            data
          });
        }
        
        // Mark as completed
        await query(`
          UPDATE retry_queue 
          SET status = 'completed', updated_at = now()
          WHERE id = $1
        `, [followUp.id]);
        
        processed++;
        console.log(`[FOLLOW-UP QUEUE] ✅ Sent ${followUp.retry_type} follow-up to ${leadPhone}`);
        
      } catch (error) {
        failed++;
        console.error(`[FOLLOW-UP QUEUE] Error processing follow-up ${followUp.id}:`, error);
        
        // Determine if error is retryable
        const isRetryable = error.message?.includes('rate limit') || 
                           error.message?.includes('timeout') ||
                           error.message?.includes('503') ||
                           error.message?.includes('502');
        
        const retryAttempt = (followUp.retry_attempt || 0) + 1;
        const maxRetries = followUp.max_retries || 3;
        
        if (isRetryable && retryAttempt < maxRetries) {
          // Reschedule for retry (exponential backoff: 1h, 2h, 4h)
          const retryDelay = Math.pow(2, retryAttempt - 1) * 60 * 60 * 1000; // Hours
          const nextRetry = new Date(Date.now() + retryDelay);
          
          await query(`
            UPDATE retry_queue 
            SET status = 'pending', 
                retry_attempt = $1, 
                scheduled_for = $2, 
                updated_at = now()
            WHERE id = $3
          `, [retryAttempt, nextRetry.toISOString(), followUp.id]);
          
          console.log(`[FOLLOW-UP QUEUE] ⏳ Retry ${retryAttempt}/${maxRetries} scheduled for ${nextRetry.toISOString()}`);
        } else {
          // Mark as failed (max retries or non-retryable error)
          await query(`
            UPDATE retry_queue 
            SET status = 'failed', updated_at = now()
            WHERE id = $1
          `, [followUp.id]);
          
          // Log error for monitoring
          try {
            const { logError } = await import('./error-monitoring.js');
            await logError({
              errorType: 'FOLLOW_UP_SEND_FAILED',
              errorMessage: error.message || 'Unknown error',
              stack: error.stack,
              context: {
                followUpId: followUp.id,
                clientKey: followUp.client_key,
                leadPhone: followUp.lead_phone,
                retryType: followUp.retry_type,
                retryAttempt,
                maxRetries
              },
              severity: retryAttempt >= maxRetries ? 'error' : 'warning',
              service: 'follow-up-processor'
            });
          } catch (logError) {
            // Don't fail if logging fails
            console.warn('[FOLLOW-UP] Could not log error:', logError.message);
          }
        }
      }
    }
    
    // Log summary
    if (processed > 0 || failed > 0 || skipped > 0) {
      console.log(`[FOLLOW-UP QUEUE] Summary: ${processed} sent, ${failed} failed, ${skipped} skipped`);
      if (skipReasons.optedOut > 0) console.log(`  - Opted out: ${skipReasons.optedOut}`);
      if (skipReasons.alreadyBooked > 0) console.log(`  - Already booked: ${skipReasons.alreadyBooked}`);
      if (skipReasons.noEmail > 0) console.log(`  - No email: ${skipReasons.noEmail}`);
      if (skipReasons.invalidData > 0) console.log(`  - Invalid data: ${skipReasons.invalidData}`);
    }
    
    return { 
      processed, 
      failed, 
      skipped,
      skipReasons,
      total: dueFollowUps.rows.length 
    };
    
  } catch (error) {
    console.error('[FOLLOW-UP QUEUE ERROR]', error);
    return { processed: 0, failed: 0, error: error.message };
  }
}

/**
 * Send follow-up SMS
 */
async function sendFollowUpSMS({ to, message, clientKey }) {
  try {
    // Double-check opt-out before sending
    if (await checkOptOut(to)) {
      throw new Error('Lead has opted out');
    }
    
    const result = await messagingService.sendSMS({ to, body: message });
    
    if (!result.success) {
      console.error('[FOLLOW-UP SMS ERROR]', result.error);
      throw new Error(result.error);
    }
    
    // Log successful send
    console.log(`[FOLLOW-UP SMS] ✅ Sent to ${to} (client: ${clientKey})`);
    
    return result;
    
  } catch (error) {
    console.error('[FOLLOW-UP SMS ERROR]', error);
    throw error;
  }
}

/**
 * Send retry call via Vapi
 */
async function sendRetryCall({ clientKey, leadPhone, data }) {
  try {
    // Get client data
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);
    
    if (!client) {
      console.error(`[RETRY CALL] Client not found: ${clientKey}`);
      throw new Error(`Client not found: ${clientKey}`);
    }
    
    // Get lead data
    const leadResult = await query(`
      SELECT name, phone, service, email
      FROM leads 
      WHERE phone = $1 AND client_key = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [leadPhone, clientKey]);
    
    if (leadResult.rows.length === 0) {
      console.error(`[RETRY CALL] Lead not found: ${leadPhone}`);
      throw new Error(`Lead not found: ${leadPhone}`);
    }
    
    const lead = leadResult.rows[0];
    
    // Use instant calling function to make the call
    const { callLeadInstantly } = await import('./instant-calling.js');
    
    const callResult = await callLeadInstantly({
      clientKey,
      lead: {
        name: lead.name || data.leadName || 'Prospect',
        phone: lead.phone,
        service: lead.service || data.service || 'consultation',
        email: lead.email
      },
      client
    });
    
    if (callResult.ok) {
      console.log(`[RETRY CALL] ✅ Successfully initiated retry call to ${leadPhone}`);
    } else {
      console.error(`[RETRY CALL] ❌ Failed to initiate call: ${callResult.error}`);
      throw new Error(callResult.error || 'Call initiation failed');
    }
    
    return callResult;
    
  } catch (error) {
    console.error('[RETRY CALL ERROR]', error);
    throw error;
  }
}

/**
 * Send follow-up email
 */
async function sendFollowUpEmail({ to, subject, message, leadName, clientKey }) {
  try {
    // Double-check opt-out before sending (check by email domain if possible)
    // Note: Opt-out is primarily by phone, but we check anyway
    
    // Convert plain text message to HTML if needed
    const htmlMessage = message.replace(/\n/g, '<br>');
    
    const result = await messagingService.sendEmail({
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>Hi ${leadName},</p>
          <div style="margin: 20px 0;">
            ${htmlMessage}
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated follow-up message. If you'd like to unsubscribe, please reply STOP.
          </p>
        </div>
      `,
      text: message
    });
    
    if (!result.success) {
      console.error('[FOLLOW-UP EMAIL ERROR]', result.error);
      throw new Error(result.error);
    }
    
    // Log successful send
    console.log(`[FOLLOW-UP EMAIL] ✅ Sent to ${to} (client: ${clientKey})`);
    
    return result;
    
  } catch (error) {
    console.error('[FOLLOW-UP EMAIL ERROR]', error);
    throw error;
  }
}

export default {
  processFollowUpQueue
};

