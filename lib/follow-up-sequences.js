// lib/follow-up-sequences.js
// Automated follow-up sequences for different call outcomes

/**
 * Follow-up sequence templates based on call outcome
 */
export const FOLLOW_UP_SEQUENCES = {
  no_answer: {
    name: "No Answer Sequence",
    steps: [
      {
        delay: 2 * 60 * 60 * 1000, // 2 hours
        channel: 'sms',
        template: `Hi {name}, I tried calling earlier about our booking automation system. Would you like to chat? Reply YES for a quick call back.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 24 * 60 * 60 * 1000, // 1 day (from first attempt)
        channel: 'email',
        subject: 'Quick question about {businessName} bookings',
        template: `Hi {name},\n\nI tried reaching you about helping {businessName} get more bookings through automation.\n\nWe work with similar {industry} businesses and typically help them:\n- Get 30% more appointments\n- Save 10 hours/week on admin\n- Reduce no-shows by 50%\n\nWorth a 5-minute chat? Reply to schedule.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 days
        channel: 'call',
        template: `Second attempt call with social proof emphasis`,
        nextAction: 'final_attempt'
      }
    ]
  },
  
  voicemail: {
    name: "Voicemail Sequence",
    steps: [
      {
        delay: 30 * 60 * 1000, // 30 minutes
        channel: 'sms',
        template: `Hi, I just left you a voicemail about booking automation for {businessName}. Here's a quick 2-min video: [link]. Reply YES if interested!`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 4 * 60 * 60 * 1000, // 4 hours
        channel: 'email',
        subject: 'Following up on voicemail - {businessName}',
        template: `Hi {name},\n\nI left you a voicemail earlier. I'll keep this brief:\n\nWe help {industry} businesses like yours automate appointment bookings.\n\nResults: 30% more bookings, 10 hours/week saved.\n\nInterested in a 5-minute demo?\n\nBest,\n[Your Name]`,
        nextAction: 'wait_for_response'
      }
    ]
  },
  
  not_interested: {
    name: "Not Interested Nurture Sequence",
    steps: [
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 1 week
        channel: 'email',
        subject: 'One thing I forgot to mention...',
        template: `Hi {name},\n\nI know you said you weren't interested last week, and that's totally fine.\n\nBut I realized I forgot to mention: we have a 14-day free trial. No credit card, no commitment.\n\nIf you're ever curious, just reply to this email.\n\nNo hard feelings if not!\n\nBest,\n[Your Name]`,
        nextAction: 'end_sequence'
      },
      {
        delay: 30 * 24 * 60 * 60 * 1000, // 30 days
        channel: 'sms',
        template: `Hey {name}, just checking in. Are you still handling bookings manually at {businessName}? We've added some new features you might like. Reply YES for details.`,
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
    name: "Interested But Didn't Book Sequence",
    steps: [
      {
        delay: 2 * 60 * 60 * 1000, // 2 hours
        channel: 'email',
        subject: 'Here's that demo I mentioned - {businessName}',
        template: `Hi {name},\n\nGreat chatting with you earlier! As promised, here's a quick demo of how our system works:\n\n[Demo Video Link]\n\nKey features for {businessName}:\n- Automated appointment booking\n- SMS reminders (50% fewer no-shows)\n- Calendar sync\n- Real-time analytics\n\nReady to try it? Reply to schedule setup (takes 15 minutes).\n\nBest,\n[Your Name]`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 days
        channel: 'sms',
        template: `Hi {name}, did you get a chance to watch the demo? Have any questions? Reply YES to chat or STOP to unsubscribe.`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 7 * 24 * 60 * 60 * 1000, // 1 week
        channel: 'call',
        template: `Follow-up call with case study: "A {industry} business like yours got 40% more bookings with our system..."`,
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
        template: `Sorry, we had trouble reaching you (technical issue). Can we try again? Reply YES or call us at [number].`,
        nextAction: 'wait_for_response'
      },
      {
        delay: 4 * 60 * 60 * 1000, // 4 hours
        channel: 'email',
        subject: 'We tried calling - {businessName}',
        template: `Hi {name},\n\nWe tried calling earlier but had a technical issue.\n\nRather than keep trying, here's what we wanted to share:\n\n[Quick pitch with video/link]\n\nInterested? Reply with a good time to call.\n\nBest,\n[Your Name]`,
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
    const { addToRetryQueue } = await import('../db.js');
    
    for (const step of sequence.steps) {
      const scheduledFor = new Date(now + step.delay);
      
      // Personalize template
      let message = step.template
        .replace(/{name}/g, leadName || 'there')
        .replace(/{businessName}/g, businessName || 'your business')
        .replace(/{industry}/g, industry || 'your industry');
      
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
          originalCallId: callId
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

