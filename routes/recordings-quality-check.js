import express from 'express';

export function createRecordingsQualityCheckRouter(deps) {
  const { query } = deps || {};
  const router = express.Router();

  router.get('/recordings/quality-check/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const limit = parseInt(req.query.limit, 10) || 10;

      const recordings = await query(
        `
      SELECT id, call_id, recording_url, created_at
      FROM calls
      WHERE client_key = $1
        AND recording_url IS NOT NULL
        AND recording_url != ''
      ORDER BY created_at DESC
      LIMIT $2
    `,
        [clientKey, limit]
      );

      const checks = [];
      for (const rec of recordings.rows || []) {
        let accessible = false;
        let statusCode = null;

        if (rec.recording_url) {
          try {
            const response = await fetch(rec.recording_url, { method: 'HEAD', timeout: 5000 });
            accessible = response.ok;
            statusCode = response.status;
          } catch (error) {
            accessible = false;
          }
        }

        checks.push({
          callId: rec.call_id,
          recordingUrl: rec.recording_url,
          accessible,
          statusCode,
          createdAt: rec.created_at
        });
      }

      const brokenCount = checks.filter((c) => !c.accessible).length;

      // Alert if broken recordings found
      if (brokenCount > 0 && process.env.YOUR_EMAIL) {
        try {
          const messagingService = (await import('../lib/messaging-service.js')).default;
          await messagingService.sendEmail({
            to: process.env.YOUR_EMAIL,
            subject: `⚠️ ${brokenCount} Broken Recording${brokenCount > 1 ? 's' : ''} Found`,
            body: `Found ${brokenCount} inaccessible recording(s) for ${clientKey}\n\nCheck the /api/recordings/quality-check/${clientKey} endpoint for details.`
          });
        } catch (emailError) {
          console.error('[RECORDING QUALITY] Failed to send alert:', emailError.message);
        }
      }

      res.json({
        ok: true,
        total: checks.length,
        accessible: checks.filter((c) => c.accessible).length,
        broken: brokenCount,
        checks
      });
    } catch (error) {
      console.error('[RECORDING QUALITY ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

