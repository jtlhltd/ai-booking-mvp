// lib/follow-up-sequences.js
// Automated follow-up sequences for different call outcomes

import { getFullClient } from '../db.js';
import { computeSameWeekWeekdayFollowUpSlots } from './business-hours.js';

/**
 * Follow-up sequence templates based on call outcome
 */
export const FOLLOW_UP_SEQUENCES = {
  no_answer: {
    name: 'No Answer — one Mon–Fri pass (calls only)',
    scheduleMode: 'same_week_weekdays',
    callTemplate: `Weekday follow-up call — we could not reach you (attempt {attempt} this week)`,
    steps: []
  },

  voicemail: {
    name: 'Voicemail — one Mon–Fri pass (calls only)',
    scheduleMode: 'same_week_weekdays',
    callTemplate: `Weekday follow-up call after voicemail (attempt {attempt} this week)`,
    steps: []
  },
  
  not_interested: {
    name: "Not Interested Nurture Sequence",
    steps: []
  },
  
  callback_requested: {
    name: "Callback Requested Sequence",
    steps: []
  },
  
  interested_no_booking: {
    name: "Interested But Didn't Book Sequence (calls only)",
    steps: [
      {
        delay: 24 * 60 * 60 * 1000, // 1 day
        channel: 'call',
        template: `Follow-up call to help you book`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 7 days
        channel: 'call',
        template: `Final follow-up call - last chance to book`,
        nextAction: 'final_attempt'
      }
    ]
  },
  
  technical_issues: {
    name: "Call Failed - Technical Issues Sequence",
    steps: []
  }
};

/**
 * Get appropriate follow-up sequence for a call outcome
 * @param {string} outcome - Call outcome (no_answer, voicemail, not_interested, etc.)
 * @returns {Object} - Follow-up sequence
 */
export function getFollowUpSequence(outcome) {
  // Map various outcomes to sequence types
  const outcomeMap = {
    'no-answer': 'no_answer',
    'no_answer': 'no_answer',
    'busy': 'no_answer',
    'voicemail': 'voicemail',
    'not_interested': 'not_interested',
    'not-interested': 'not_interested',
    'declined': 'not_interested',
    'callback_requested': 'callback_requested',
    'callback-requested': 'callback_requested',
    'interested': 'interested_no_booking',
    'failed': 'technical_issues',
    'error': 'technical_issues'
  };
  
  const sequenceType = outcomeMap[outcome] || 'no_answer';
  return FOLLOW_UP_SEQUENCES[sequenceType];
}

/**
 * Schedule follow-up actions for a lead
 * @param {Object} params - Follow-up parameters
 * @returns {Array} - Scheduled actions
 */
export async function scheduleFollowUps({ clientKey, leadPhone, leadName, businessName, industry, outcome, callId }) {
  const sequence = getFollowUpSequence(outcome);
  
  if (!sequence) {
    console.log(`[FOLLOW-UP] No sequence defined for outcome: ${outcome}`);
    return [];
  }
  if (sequence.scheduleMode !== 'same_week_weekdays' && sequence.steps.length === 0) {
    console.log(`[FOLLOW-UP] No steps in "${sequence.name}" for outcome: ${outcome}, skipping`);
    return [];
  }
  
  console.log(`[FOLLOW-UP] Scheduling "${sequence.name}" for ${leadPhone}`);
  
  const scheduledActions = [];
  const now = Date.now();
  
  try {
    // Pre-flight check: Don't schedule if lead has opted out
    const { isOptedOut } = await import('./lead-deduplication.js');
    if (await isOptedOut(clientKey, leadPhone)) {
      console.log(`[FOLLOW-UP] ⚠️ Skipped scheduling for ${leadPhone} - opted out`);
      return [];
    }
    
    // Pre-flight check: Don't schedule if lead has already booked
    const { query, cancelPendingFollowUps, addToRetryQueue } = await import('../db.js');
    const bookingCheck = await query(`
      SELECT COUNT(*) as count
      FROM appointments a
      JOIN leads l ON a.lead_id = l.id
      WHERE l.client_key = $1 
        AND l.phone = $2
        AND a.status = 'booked'
        AND a.start_iso > NOW()
      LIMIT 1
    `, [clientKey, leadPhone]);
    
    if (parseInt(bookingCheck.rows[0]?.count || 0) > 0) {
      console.log(`[FOLLOW-UP] ⚠️ Skipped scheduling for ${leadPhone} - already booked`);
      return [];
    }
    
    // Get client data from database
    const client = await getFullClient(clientKey);
    const actualBusinessName = businessName || client?.displayName || clientKey;
    const businessPhone = client?.phone || client?.businessPhone || 'your business phone';
    const bookingLink = client?.bookingLink || `${process.env.BASE_URL || 'https://yourdomain.com'}/booking?client=${clientKey}`;
    const service = client?.defaultService || 'appointment';
    
    // Get benefits from client config or use defaults
    const benefits = client?.benefits || [
      'Fast service',
      'Professional team',
      'Great results'
    ];

    await cancelPendingFollowUps(clientKey, leadPhone);

    if (sequence.scheduleMode === 'same_week_weekdays') {
      const slots = computeSameWeekWeekdayFollowUpSlots(client, new Date(), client?.timezone || client?.booking?.timezone);
      if (slots.length === 0) {
        console.log(`[FOLLOW-UP] No remaining weekday slots this week for ${leadPhone} (${sequence.name})`);
        return [];
      }
      const tmpl = sequence.callTemplate || `Weekday follow-up call (attempt {attempt} this week)`;
      for (let i = 0; i < slots.length; i++) {
        const scheduledFor = slots[i];
        const attemptNum = i + 1;
        const message = tmpl.replace(/\{attempt\}/g, String(attemptNum));
        await addToRetryQueue({
          clientKey,
          leadPhone,
          retryType: 'call',
          retryReason: `follow_up_${outcome}`,
          retryData: {
            message,
            nextAction: attemptNum < slots.length ? 'wait_for_response' : 'final_attempt',
            sequenceName: sequence.name,
            stepIndex: i,
            originalCallId: callId,
            businessName: actualBusinessName,
            bookingLink,
            leadName: leadName || 'there'
          },
          scheduledFor: scheduledFor.toISOString(),
          retryAttempt: attemptNum,
          maxRetries: slots.length
        });
        scheduledActions.push({
          channel: 'call',
          scheduledFor: scheduledFor.toISOString(),
          delay: `weekday ${attemptNum}`,
          message: message.substring(0, 100) + (message.length > 100 ? '...' : '')
        });
        console.log(`[FOLLOW-UP] Scheduled call for ${scheduledFor.toLocaleString()}`);
      }
      console.log(`[FOLLOW-UP] ✅ Scheduled ${scheduledActions.length} weekday follow-up call(s) for ${leadPhone}`);
      return scheduledActions;
    }

    for (const step of sequence.steps) {
      const scheduledFor = new Date(now + step.delay);
      
      // Personalize template with actual client data
      let message = step.template
        .replace(/{name}/g, leadName || 'there')
        .replace(/{businessName}/g, actualBusinessName)
        .replace(/{industry}/g, industry || client?.industry || 'your industry')
        .replace(/{service}/g, service)
        .replace(/{businessPhone}/g, businessPhone)
        .replace(/{bookingLink}/g, bookingLink)
        .replace(/{benefit1}/g, benefits[0] || 'Great service')
        .replace(/{benefit2}/g, benefits[1] || 'Professional team')
        .replace(/{benefit3}/g, benefits[2] || 'Excellent results');
      
      // Add to retry queue
      await addToRetryQueue({
        clientKey,
        leadPhone,
        retryType: step.channel, // 'sms', 'email', 'call'
        retryReason: `follow_up_${outcome}`,
        retryData: {
          message,
          subject: step.subject,
          nextAction: step.nextAction,
          sequenceName: sequence.name,
          stepIndex: sequence.steps.indexOf(step),
          originalCallId: callId,
          businessName: actualBusinessName,
          bookingLink: bookingLink
        },
        scheduledFor: scheduledFor.toISOString(),
        retryAttempt: sequence.steps.indexOf(step) + 1,
        maxRetries: sequence.steps.length
      });
      
      scheduledActions.push({
        channel: step.channel,
        scheduledFor: scheduledFor.toISOString(),
        delay: `${Math.round(step.delay / (60 * 60 * 1000))} hours`,
        message: message.substring(0, 100) + '...'
      });
      
      console.log(`[FOLLOW-UP] Scheduled ${step.channel} for ${scheduledFor.toLocaleString()}`);
    }
    
    console.log(`[FOLLOW-UP] ✅ Scheduled ${scheduledActions.length} follow-up actions for ${leadPhone}`);
    
    return scheduledActions;
    
  } catch (error) {
    console.error(`[FOLLOW-UP ERROR]`, error);
    return [];
  }
}

/**
 * Cancel follow-up sequence (e.g., if lead books or opts out)
 * @param {string} clientKey - Client identifier
 * @param {string} leadPhone - Lead's phone number
 */
export async function cancelFollowUpSequence(clientKey, leadPhone) {
  try {
    const { cancelPendingFollowUps } = await import('../db.js');

    await cancelPendingFollowUps(clientKey, leadPhone);

    console.log(`[FOLLOW-UP] ✅ Cancelled all pending follow-ups for ${leadPhone}`);
  } catch (error) {
    console.error(`[FOLLOW-UP CANCEL ERROR]`, error);
  }
}

