import express from 'express';

export function createBookDemoRouter(deps) {
  const { bookingSystem, smsEmailPipeline } = deps || {};
  const router = express.Router();

  router.post('/book-demo', async (req, res) => {
    try {
      if (!bookingSystem) {
        return res.status(503).json({
          success: false,
          message: 'Booking system not available'
        });
      }

      console.log('[BOOKING DEMO] Request body:', req.body);

      let leadData, preferredTimes;

      if (req.body.leadData) {
        leadData = req.body.leadData;
        preferredTimes = req.body.preferredTimes;
      } else {
        const { name, email, company, phone, slotId } = req.body;

        if (!name || !email) {
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: name and email are required'
          });
        }

        leadData = {
          businessName: company || 'Unknown Company',
          decisionMaker: name,
          email: email,
          phone: phone || null
        };

        if (slotId) {
          preferredTimes = [
            {
              startDateTime: slotId,
              endDateTime: new Date(new Date(slotId).getTime() + 60 * 60 * 1000).toISOString()
            }
          ];
        }
      }

      if (!leadData || !leadData.businessName || !leadData.decisionMaker || !leadData.email) {
        return res.status(400).json({
          success: false,
          message: 'Missing required lead data: businessName, decisionMaker, and email are required'
        });
      }

      let slotsToUse;

      if (preferredTimes && Array.isArray(preferredTimes) && preferredTimes.length > 0) {
        slotsToUse = preferredTimes;
      } else if (preferredTimes && typeof preferredTimes === 'object') {
        const values = [];
        for (const key in preferredTimes) {
          if (preferredTimes.hasOwnProperty(key)) values.push(preferredTimes[key]);
        }
        slotsToUse = values.length > 0 ? values : bookingSystem.generateTimeSlots(7);
      } else {
        slotsToUse = bookingSystem.generateTimeSlots(7);
      }

      console.log('[BOOKING DEMO] leadData:', leadData);
      console.log('[BOOKING DEMO] preferredTimes:', preferredTimes);
      console.log('[BOOKING DEMO] slotsToUse:', slotsToUse);

      const result = await bookingSystem.bookDemo(leadData, slotsToUse, smsEmailPipeline);
      res.json(result);
    } catch (error) {
      console.error('[BOOKING ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Booking failed',
        error: error.message
      });
    }
  });

  return router;
}

