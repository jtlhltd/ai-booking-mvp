import express from 'express';

export function createRecordingsQualityCheckRouter(deps) {
  const { query } = deps || {};
  const router = express.Router();

  function pickUpstreamAuthHeaders(urlString) {
    try {
      const u = new URL(String(urlString || ''));
      const host = String(u.hostname || '').toLowerCase();
      const looksLikeVapi = host === 'api.vapi.ai' || host.endsWith('.vapi.ai');
      if (!looksLikeVapi) return {};
      const token = process.env.VAPI_PRIVATE_KEY || '';
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    } catch {
      return {};
    }
  }

  async function fetchWithTimeout(url, init, timeoutMs) {
    const ac = new AbortController();
    const kill = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(init || {}), signal: ac.signal });
    } finally {
      clearTimeout(kill);
    }
  }

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
            const headers = pickUpstreamAuthHeaders(rec.recording_url);
            // Prefer HEAD to keep this cheap, but fall back to a 1-byte range GET when HEAD is blocked.
            let response = await fetchWithTimeout(rec.recording_url, { method: 'HEAD', headers }, 5000);
            if (!response.ok && (response.status === 405 || response.status === 403)) {
              response = await fetchWithTimeout(
                rec.recording_url,
                { method: 'GET', headers: { ...headers, Range: 'bytes=0-0' } },
                5000
              );
            }
            accessible = !!response.ok;
            statusCode = response.status ?? null;
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

