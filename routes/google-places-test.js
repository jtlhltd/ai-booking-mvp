import express from 'express';

export function createGooglePlacesTestRouter() {
  const router = express.Router();

  router.post('/test-google-places', async (_req, res) => {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Google Places API key not configured' });
      }

      const testQuery = 'dental practice London';
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        testQuery
      )}&key=${apiKey}`;

      console.log(`[TEST] Making Google Places API call: ${searchUrl}`);

      const response = await fetch(searchUrl);
      const data = await response.json();

      console.log(`[TEST] Google Places API response:`, data);

      res.json({
        success: true,
        apiKey: apiKey.substring(0, 10) + '...',
        testQuery,
        response: data
      });
    } catch (error) {
      console.error('[TEST] Google Places API error:', error);
      res.status(500).json({
        error: 'Google Places API test failed',
        message: error.message
      });
    }
  });

  return router;
}

