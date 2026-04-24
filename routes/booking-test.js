import express from 'express';

export function createBookingTestRouter(deps) {
  const { bookingSystem, getApiKey, getFullClient } = deps || {};
  const router = express.Router();

  router.get('/test-booking', async (_req, res) => {
    try {
      const testLead = {
        businessName: 'Test Business',
        decisionMaker: 'John Smith',
        email: 'john@testbusiness.co.uk',
        phoneNumber: '+447491683261',
        industry: 'retail',
        location: 'London'
      };

      const timeSlots = bookingSystem.generateTimeSlots(3);
      const result = await bookingSystem.bookDemo(testLead, timeSlots.slice(0, 3));

      res.json({
        success: true,
        message: 'Booking system test completed',
        result: result,
        availableSlots: timeSlots.length
      });
    } catch (error) {
      console.error('[BOOKING TEST ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Booking system test failed',
        error: error.message
      });
    }
  });

  router.get('/test-booking-calendar', async (_req, res) => {
    try {
      if (!bookingSystem) {
        return res.status(503).json({
          success: false,
          message: 'Booking system not available',
        });
      }

      const result = await bookingSystem.testCalendarConnection();
      res.json(result);
    } catch (error) {
      console.error('[BOOKING CALENDAR TEST ERROR]', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  router.post('/test-calendar-booking', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
      if (!apiKey || apiKey !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantKey, leadPhone, appointmentTime, duration, service, notes } = req.body || {};
      if (!tenantKey || !leadPhone || !appointmentTime) {
        return res.status(400).json({ error: 'tenantKey, leadPhone, and appointmentTime required' });
      }

      const client = await getFullClient?.(tenantKey);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      console.log('[CALENDAR BOOKING TEST]', {
        tenantKey,
        leadPhone,
        appointmentTime,
        duration,
        service,
        notes,
      });

      return res.json({
        ok: true,
        message: 'Calendar booking test successful',
        tenantKey,
        leadPhone,
        appointmentTime,
        duration: duration || 30,
        service: service || 'General Appointment',
        notes: notes || 'Test booking',
        calendarId: client?.booking?.calendarId || 'primary',
        timezone: client?.booking?.timezone || 'Europe/London',
      });
    } catch (e) {
      console.error('[CALENDAR BOOKING TEST ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

