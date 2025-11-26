// lib/follow-up-sequences.js
// Automated follow-up sequences for different call outcomes

import messagingService from './messaging-service.js';
import { getFullClient } from '../db.js';

/**
 * Follow-up sequence templates based on call outcome
 */
export const FOLLOW_UP_SEQUENCES = {
  no_answer: {
    name: "No Answer Sequence (6 touches)",
    steps: [
      {
        delay: 2 * 60 * 60 * 1000, // 2 hours
        channel: 'sms',
        template: `Hi {name}, we tried calling about your {service} inquiry with {businessName}. Still interested? Reply YES to book or call {businessPhone}.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 6 * 60 * 60 * 1000, // 6 hours
        channel: 'email',
        subject: 'Following up on your {service} inquiry',
        template: `Hi {name},\n\nWe tried reaching you about your {service} inquiry with {businessName}.\n\nAre you still interested? We'd love to help you with:\n- {benefit1}\n- {benefit2}\n- {benefit3}\n\nReady to book? Click here: {bookingLink}\nOr reply with a good time to call you back.\n\nThanks,\n{businessName}`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 24 * 60 * 60 * 1000, // 1 day
        channel: 'call',
        template: `Second attempt call - following up`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 2 * 24 * 60 * 60 * 1000, // 2 days
        channel: 'sms',
        template: `Hi {name}, just checking in from {businessName}. Still interested in {service}? Reply YES to book or call {businessPhone}.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 4 * 24 * 60 * 60 * 1000, // 4 days
        channel: 'email',
        subject: 'Last chance - {service} at {businessName}',
        template: `Hi {name},\n\nThis is our final follow-up about your {service} inquiry.\n\nWe'd still love to help you! Here's why customers choose us:\n- {benefit1}\n- {benefit2}\n- {benefit3}\n\nReady to book? Click here: {bookingLink}\nOr call us: {businessPhone}\n\nThanks,\n{businessName}`,
        nextAction: 'final_attempt'
      },
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 7 days
        channel: 'call',
        template: `Final attempt call - last chance`,
        nextAction: 'final_attempt'
      }
    ]
  },
  
  voicemail: {
    name: "Voicemail Sequence (5 touches)",
    steps: [
      {
        delay: 30 * 60 * 1000, // 30 minutes
        channel: 'sms',
        template: `Hi {name}, we just left you a voicemail about your {service} inquiry with {businessName}. Reply YES to book or call {businessPhone}.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 4 * 60 * 60 * 1000, // 4 hours
        channel: 'email',
        subject: 'Voicemail follow-up - {service} at {businessName}',
        template: `Hi {name},\n\nWe left you a voicemail earlier about your {service} inquiry.\n\nWe'd love to help you! Most customers choose us because:\n- {benefit1}\n- {benefit2}\n- {benefit3}\n\nReady to book? Click here: {bookingLink}\nOr reply with a good time to call.\n\nThanks,\n{businessName}`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 24 * 60 * 60 * 1000, // 1 day
        channel: 'call',
        template: `Follow-up call after voicemail`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 days
        channel: 'sms',
        template: `Hi {name}, checking in from {businessName}. Still interested in {service}? Reply YES to book.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 7 days
        channel: 'email',
        subject: 'Final follow-up - {service} at {businessName}',
        template: `Hi {name},\n\nThis is our last follow-up about your {service} inquiry.\n\nWe're still here if you need us! To book:\n- Click here: {bookingLink}\n- Call us: {businessPhone}\n\nThanks,\n{businessName}`,
        nextAction: 'final_attempt'
      }
    ]
  },
  
  not_interested: {
    name: "Not Interested Nurture Sequence",
    steps: [
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 1 week
        channel: 'email',
        subject: 'Still here if you need us - {businessName}',
        template: `Hi {name},\n\nNo worries if the timing wasn't right last week.\n\nJust wanted you to know we're still here if you need {service} in the future.\n\nFeel free to reach out anytime: {businessPhone}\n\nThanks,\n{businessName}`,
        nextAction: 'end_sequence'
      },
      {
        delay: 30 * 24 * 60 * 60 * 1000, // 30 days
        channel: 'sms',
        template: `Hi {name}, checking in from {businessName}. Still need {service}? We'd love to help. Reply YES to book or STOP to unsubscribe.`,
        nextAction: 'end_sequence'
      }
    ]
  },
  
  callback_requested: {
    name: "Callback Requested Sequence",
    steps: [
      {
        delay: 0, // Immediate
        channel: 'sms',
        template: `Thanks for your interest! When's the best time to call you back? (e.g., "Tomorrow at 2pm")`,
        nextAction: 'wait_for_time'
      },
      {
        delay: 24 * 60 * 60 * 1000, // 1 day if no response
        channel: 'sms',
        template: `Hi {name}, still want that callback? Just let me know a good time and I'll ring you. Reply with a time or "not interested" to stop.`,
        nextAction: 'wait_for_response'
      }
    ]
  },
  
  interested_no_booking: {
    name: "Interested But Didn't Book Sequence (6 touches)",
    steps: [
      {
        delay: 2 * 60 * 60 * 1000, // 2 hours
        channel: 'email',
        subject: 'Ready to book your {service}? - {businessName}',
        template: `Hi {name},\n\nThanks for your interest in {service}!\n\nWe'd love to help you. Here's what you can expect:\n- {benefit1}\n- {benefit2}\n- {benefit3}\n\nReady to book? Click here: {bookingLink}\nOr reply with your preferred time.\n\nLooking forward to serving you!\n\n{businessName}\n{businessPhone}`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 6 * 60 * 60 * 1000, // 6 hours
        channel: 'sms',
        template: `Hi {name}, just a quick reminder - ready to book your {service} at {businessName}? Reply YES or call {businessPhone}.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 24 * 60 * 60 * 1000, // 1 day
        channel: 'call',
        template: `Follow-up call to help you book`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 days
        channel: 'email',
        subject: 'Still interested in {service}? - {businessName}',
        template: `Hi {name},\n\nWe noticed you were interested in {service} but haven't booked yet.\n\nIs there anything we can help with? We're here to answer any questions!\n\nReady to book? Click here: {bookingLink}\nOr call us: {businessPhone}\n\nThanks,\n{businessName}`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 5 * 24 * 60 * 60 * 1000, // 5 days
        channel: 'sms',
        template: `Hi {name}, last chance to book {service} at {businessName}. Reply YES or call {businessPhone}.`,
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
    steps: [
      {
        delay: 10 * 60 * 1000, // 10 minutes
        channel: 'sms',
        template: `Hi {name}, we had trouble reaching you about your {service} inquiry with {businessName}. Can we try again? Reply YES or call {businessPhone}.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 4 * 60 * 60 * 1000, // 4 hours
        channel: 'email',
        subject: 'Had trouble reaching you - {businessName}',
        template: `Hi {name},\n\nWe tried calling about your {service} inquiry but had a connection issue.\n\nWe'd still love to help you! To book:\n- Click here: {bookingLink}\n- Call us: {businessPhone}\n- Reply with a good time to call you\n\nThanks,\n{businessName}`,
        nextAction: 'end_sequence'
      }
    ]
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
  
  console.log(`[FOLLOW-UP] Scheduling "${sequence.name}" for ${leadPhone}`);
  
  const scheduledActions = [];
  const now = Date.now();
  
  try {
    // Pre-flight check: Don't schedule if lead has opted out
    const { isOptedOut } = await import('./lead-deduplication.js');
    if (await isOptedOut(leadPhone)) {
      console.log(`[FOLLOW-UP] ⚠️ Skipped scheduling for ${leadPhone} - opted out`);
      return [];
    }
    
    // Pre-flight check: Don't schedule if lead has already booked
    const { query } = await import('../db.js');
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
    
    const { addToRetryQueue } = await import('../db.js');
    
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
    const { cancelPendingRetries } = await import('../db.js');
    
    await cancelPendingRetries(clientKey, leadPhone);
    
    console.log(`[FOLLOW-UP] ✅ Cancelled all pending follow-ups for ${leadPhone}`);
  } catch (error) {
    console.error(`[FOLLOW-UP CANCEL ERROR]`, error);
  }
}

