import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';

const router = express.Router();

// Enhanced VAPI webhook handler with comprehensive call tracking
router.post('/webhooks/vapi', async (req, res) => {
  try {
    const body = req.body || {};
    const callId = body.call?.id || body.id;
    const status = body.call?.status || body.status;
    const outcome = body.call?.outcome || body.outcome;
    const duration = body.call?.duration || body.duration;
    const cost = body.call?.cost || body.cost;
    const metadata = body.call?.metadata || body.metadata || {};
    
    console.log('[VAPI WEBHOOK]', { 
      callId, 
      status, 
      outcome, 
      duration, 
      cost,
      metadata: Object.keys(metadata).length > 0 ? metadata : 'none'
    });

    // Extract tenant and lead information
    const tenantKey = metadata.tenantKey || metadata.clientKey;
    const leadPhone = metadata.leadPhone || body.customer?.number;
    
    if (!tenantKey || !leadPhone) {
      console.log('[VAPI WEBHOOK SKIP]', { reason: 'missing_tenant_or_phone', tenantKey: !!tenantKey, leadPhone: !!leadPhone });
      return res.status(200).json({ ok: true });
    }

    // Update call tracking in database
    await updateCallTracking({
      callId,
      tenantKey,
      leadPhone,
      status,
      outcome,
      duration,
      cost,
      metadata,
      timestamp: new Date().toISOString()
    });

    // Handle specific outcomes
    if (outcome === 'booked' || body.booked === true) {
      await handleBookingOutcome({
        tenantKey,
        leadPhone,
        callId,
        bookingStart: body.bookingStart || body.slotStart || '',
        bookingEnd: body.bookingEnd || body.slotEnd || '',
        metadata
      });
    } else if (outcome === 'no-answer' || outcome === 'busy' || outcome === 'declined') {
      await handleFailedCall({
        tenantKey,
        leadPhone,
        callId,
        reason: outcome,
        metadata
      });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[VAPI WEBHOOK ERROR]', { 
      error: e?.message || e,
      stack: e?.stack?.substring(0, 200)
    });
    res.status(200).json({ ok: true });
  }
});

// Update call tracking in the database
async function updateCallTracking({ callId, tenantKey, leadPhone, status, outcome, duration, cost, metadata, timestamp }) {
  try {
    // Import database functions
    const { upsertCall, trackCost } = await import('../db.js');
    
    // Store call data in database
    await upsertCall({
      callId,
      clientKey: tenantKey,
      leadPhone,
      status,
      outcome,
      duration,
      cost,
      metadata
    });
    
    // Track cost if available
    if (cost && cost > 0) {
      await trackCost({
        clientKey: tenantKey,
        callId,
        costType: 'vapi_call',
        amount: cost,
        currency: 'USD',
        description: `VAPI call ${status} - ${outcome || 'unknown outcome'}`,
        metadata: {
          duration,
          outcome,
          leadPhone,
          timestamp
        }
      });
      
      console.log('[COST TRACKED]', {
        callId,
        tenantKey,
        cost: `$${cost}`,
        type: 'vapi_call'
      });
    }
    
    console.log('[CALL TRACKING UPDATE]', {
      callId,
      tenantKey,
      leadPhone,
      status,
      outcome,
      duration: duration ? `${duration}s` : 'unknown',
      cost: cost ? `$${cost}` : 'unknown',
      timestamp,
      stored: true
    });
  } catch (error) {
    console.error('[CALL TRACKING ERROR]', error);
  }
}

// Handle successful booking outcomes
async function handleBookingOutcome({ tenantKey, leadPhone, callId, bookingStart, bookingEnd, metadata }) {
  try {
    console.log('[BOOKING OUTCOME]', {
      tenantKey,
      leadPhone,
      callId,
      bookingStart,
      bookingEnd
    });

    // Update lead status to booked
    // This would integrate with the existing lead management system
    // await store.leads.updateOnBooked(leadPhone, { 
    //   status: 'booked', 
    //   booked: true, 
    //   booking_start: bookingStart, 
    //   booking_end: bookingEnd,
    //   callId
    // });

    // Update Google Sheets if configured
    // const tenant = await store.tenants.findByKey(tenantKey);
    // if (tenant?.gsheet_id) {
    //   await sheets.updateLead(tenant.gsheet_id, {
    //     leadPhone,
    //     patch: { 
    //       'Status': 'booked',
    //       'Booked?': 'TRUE',
    //       'Booking Start': bookingStart,
    //       'Booking End': bookingEnd,
    //       'Call ID': callId
    //     }
    //   });
    // }
  } catch (error) {
    console.error('[BOOKING OUTCOME ERROR]', error);
  }
}

// Handle failed call scenarios
async function handleFailedCall({ tenantKey, leadPhone, callId, reason, metadata }) {
  try {
    console.log('[FAILED CALL]', {
      tenantKey,
      leadPhone,
      callId,
      reason
    });

    // Implement retry logic for failed calls
    const retryableReasons = ['no-answer', 'busy'];
    if (retryableReasons.includes(reason)) {
      // Schedule a retry call (implement retry queue)
      console.log('[SCHEDULE RETRY]', {
        tenantKey,
        leadPhone,
        callId,
        reason,
        retryAfter: '2 hours' // Configurable retry delay
      });
    }

    // Update lead status
    // await store.leads.updateCallStatus(leadPhone, {
    //   status: 'call_failed',
    //   lastCallId: callId,
    //   lastCallReason: reason,
    //   nextRetryAt: retryableReasons.includes(reason) ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null
    // });
  } catch (error) {
    console.error('[FAILED CALL ERROR]', error);
  }
}

export default router;
