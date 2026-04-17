import express from 'express';

export function createBookingTestRouter(deps) {
  const { bookingSystem } = deps || {};
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

  return router;
}

