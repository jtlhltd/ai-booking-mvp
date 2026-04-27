import express from 'express';

export function createCallRecordingsStreamRouter(deps) {
  const { poolQuerySelect } = deps || {};
  const router = express.Router();

  const TRUSTED_VAPI_RECORDING_HOSTS = new Set([
    'storage.vapi.ai',
    'api.vapi.ai',
    'vapi-call-recordings.s3.us-west-2.amazonaws.com'
  ]);

  const hostLogState = {
    lastLogAtByHost: new Map(),
    lastSummaryAtMs: 0,
    seenHosts: new Set()
  };

  function maybeLogRecordingHost(host, extra = {}) {
    const h = String(host || '').toLowerCase().trim();
    if (!h) return;
    hostLogState.seenHosts.add(h);
    const now = Date.now();
    const last = hostLogState.lastLogAtByHost.get(h) || 0;
    if (now - last > 10 * 60 * 1000) {
      hostLogState.lastLogAtByHost.set(h, now);
      console.log('[RECORDING STREAM] upstream host', { host: h, ...extra });
    }
    if (now - hostLogState.lastSummaryAtMs > 60 * 60 * 1000) {
      hostLogState.lastSummaryAtMs = now;
      console.log('[RECORDING STREAM] hosts seen (hourly)', { hosts: Array.from(hostLogState.seenHosts).sort() });
    }
  }

  function pickUpstreamAuthHeaders(urlString) {
    try {
      const u = new URL(String(urlString || ''));
      const host = String(u.hostname || '').toLowerCase();
      const trusted = TRUSTED_VAPI_RECORDING_HOSTS.has(host);
      if (!trusted) return { headers: {}, authUsed: false, host };
      const token = process.env.VAPI_PRIVATE_KEY || '';
      if (!token) return { headers: {}, authUsed: false, host };
      return { headers: { Authorization: `Bearer ${token}` }, authUsed: true, host };
    } catch {
      return { headers: {}, authUsed: false, host: '' };
    }
  }

  async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
  }

  router.get('/call-recordings/:clientKey/stream/:callRowId', async (req, res) => {
    const { Readable } = await import('stream');
    try {
      const { clientKey, callRowId } = req.params;
      const idNum = parseInt(String(callRowId || ''), 10);
      if (!Number.isFinite(idNum) || idNum <= 0) {
        return res.status(400).json({ ok: false, error: 'Invalid recording id' });
      }
      // poolQuerySelect: no pgQueryLimiter / perf tracker (many <audio> tags + pool wait were firing critical alerts).
      const row = await poolQuerySelect(
        `SELECT recording_url FROM calls WHERE id = $1 AND client_key = $2
         AND recording_url IS NOT NULL AND TRIM(recording_url) <> ''`,
        [idNum, clientKey]
      );
      const recordingUrl = (row.rows?.[0]?.recording_url || '').trim();
      if (!recordingUrl) {
        return res.status(404).json({ ok: false, error: 'Recording not found' });
      }

      const range = req.headers.range;
      const fetchHeaders = {};
      if (range) fetchHeaders.Range = range;
      const upstreamAuth = pickUpstreamAuthHeaders(recordingUrl);
      Object.assign(fetchHeaders, upstreamAuth.headers);

      maybeLogRecordingHost(upstreamAuth.host, { authUsed: upstreamAuth.authUsed, hasRange: !!range });

      let upstream;
      const maxAttempts = 3;
      const attemptTimeoutMs = 8000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const ac = new AbortController();
        const kill = setTimeout(() => ac.abort(), attemptTimeoutMs);
        try {
          upstream = await fetch(recordingUrl, {
            redirect: 'follow',
            signal: ac.signal,
            headers: fetchHeaders
          });
          break;
        } catch (e) {
          const msg = String(e?.message || e || '');
          const retryable = e?.name === 'AbortError' || msg.toLowerCase().includes('fetch failed');
          const willRetry = retryable && attempt < maxAttempts;
          console.warn('[RECORDING STREAM] upstream fetch failed', {
            attempt,
            willRetry,
            host: upstreamAuth.host || undefined,
            authUsed: upstreamAuth.authUsed,
            hasRange: !!range,
            error: msg
          });
          if (!willRetry) {
            return res.status(502).json({
              ok: false,
              error: 'upstream_fetch_failed',
              hint: 'Recording host unavailable; try again',
              details: msg
            });
          }
          await sleep(200 * attempt);
        } finally {
          clearTimeout(kill);
        }
      }

      if (!upstream) {
        return res.status(502).json({ ok: false, error: 'upstream_fetch_failed', details: 'No upstream response' });
      }

      if (!upstream.ok) {
        console.warn('[RECORDING STREAM] upstream non-OK', {
          host: upstreamAuth.host || undefined,
          authUsed: upstreamAuth.authUsed,
          hasRange: !!range,
          status: upstream.status
        });
        return res.status(502).json({
          ok: false,
          error: 'upstream_status',
          hint: 'Recording host returned an error; try again',
          status: upstream.status
        });
      }

      const ct = upstream.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Content-Type', ct);
      res.set('Cache-Control', 'private, max-age=300');

      if (upstream.status === 206) {
        res.status(206);
        const cr = upstream.headers.get('content-range');
        if (cr) res.setHeader('Content-Range', cr);
        const ar = upstream.headers.get('accept-ranges');
        if (ar) res.setHeader('Accept-Ranges', ar);
      }

      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);

      if (!upstream.body) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        return res.send(buf);
      }

      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.on('error', (err) => {
        console.warn('[RECORDING STREAM] pipe error:', err?.message || err);
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      nodeStream.pipe(res);
    } catch (error) {
      console.error('[RECORDING STREAM ERROR]', error);
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: 'stream_failed', details: error?.message || 'Stream failed' });
      }
    }
  });

  return router;
}

