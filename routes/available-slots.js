import express from 'express';

export function createAvailableSlotsRouter(deps) {
  const { bookingSystem } = deps || {};
  const router = express.Router();

  router.get('/available-slots', async (req, res) => {
    try {
      if (!bookingSystem) {
        return res.status(503).json({
          success: false,
          message: 'Booking system not available'
        });
      }

      const { days = 7 } = req.query;
      const slots = bookingSystem.generateTimeSlots(parseInt(days));

      res.json({
        success: true,
        slots: slots,
        totalSlots: slots.length
      });
    } catch (error) {
      console.error('[SLOTS ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get available slots',
        error: error.message
      });
    }
  });

  return router;
}

