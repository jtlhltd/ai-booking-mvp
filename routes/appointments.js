// routes/appointments.js
// API endpoints for appointment management (lookup, reschedule, cancel)

import express from 'express';
import { findAppointments, getUpcomingAppointments, getAppointmentById } from '../lib/appointment-lookup.js';
import { rescheduleAppointment, cancelAppointment } from '../lib/appointment-modifier.js';
import { authenticateApiKey, requireTenantAccess } from '../middleware/security.js';

const router = express.Router();

/**
 * GET /api/appointments/:clientKey/lookup
 * Lookup appointments by phone, name, email, or appointment ID
 */
router.get('/api/appointments/:clientKey/lookup', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { phone, name, email, appointmentId, status } = req.query;

    if (!phone && !name && !email && !appointmentId) {
      return res.status(400).json({
        success: false,
        error: 'Must provide phone, name, email, or appointmentId'
      });
    }

    const appointments = await findAppointments({
      clientKey,
      phoneNumber: phone || null,
      name: name || null,
      email: email || null,
      appointmentId: appointmentId || null,
      status: status || 'booked',
      limit: 20
    });

    res.json({
      success: true,
      count: appointments.length,
      appointments
    });

  } catch (error) {
    console.error('[APPOINTMENTS API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appointments/:clientKey/upcoming
 * Get upcoming appointments for a customer
 */
router.get('/api/appointments/:clientKey/upcoming', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number required'
      });
    }

    const appointments = await getUpcomingAppointments({
      clientKey,
      phoneNumber: phone,
      limit: 10
    });

    res.json({
      success: true,
      count: appointments.length,
      appointments
    });

  } catch (error) {
    console.error('[APPOINTMENTS API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appointments/:clientKey/:appointmentId/reschedule
 * Reschedule an appointment
 */
router.post('/api/appointments/:clientKey/:appointmentId/reschedule', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, appointmentId } = req.params;
    const { newTime, newEndTime, reason } = req.body;

    if (!newTime) {
      return res.status(400).json({
        success: false,
        error: 'newTime (ISO datetime) required'
      });
    }

    const result = await rescheduleAppointment({
      clientKey,
      appointmentId: parseInt(appointmentId),
      newStartTime: newTime,
      newEndTime: newEndTime || null,
      reason: reason || null
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[APPOINTMENTS API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appointments/:clientKey/:appointmentId/cancel
 * Cancel an appointment
 */
router.post('/api/appointments/:clientKey/:appointmentId/cancel', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, appointmentId } = req.params;
    const { reason, offerAlternatives } = req.body;

    const result = await cancelAppointment({
      clientKey,
      appointmentId: parseInt(appointmentId),
      reason: reason || null,
      offerAlternatives: offerAlternatives !== false
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[APPOINTMENTS API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appointments/:clientKey/:appointmentId
 * Get single appointment by ID
 */
router.get('/api/appointments/:clientKey/:appointmentId', authenticateApiKey, requireTenantAccess, async (req, res) => {
  try {
    const { clientKey, appointmentId } = req.params;

    const appointment = await getAppointmentById({
      clientKey,
      appointmentId: parseInt(appointmentId)
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      appointment
    });

  } catch (error) {
    console.error('[APPOINTMENTS API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;




