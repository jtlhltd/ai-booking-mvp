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
              leadName
            });
          } else {
            // No email found - skip but log it
            console.log(`[FOLLOW-UP QUEUE] ⚠️ Email follow-up skipped - no email stored for ${followUp.lead_phone}`);
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
async function sendFollowUpEmail({ to, subject, message, leadName }) {
  try {
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
    
    return result;
    
  } catch (error) {
    console.error('[FOLLOW-UP EMAIL ERROR]', error);
    throw error;
  }
}

export default {
  processFollowUpQueue
};

