import express from 'express';

export function createCallRecordingsStreamRouter(deps) {
  const { poolQuerySelect } = deps || {};
  const router = express.Router();

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

      const ac = new AbortController();
      const kill = setTimeout(() => ac.abort(), 120000);
      const range = req.headers.range;
      const fetchHeaders = {};
      if (range) fetchHeaders.Range = range;

      let upstream;
      try {
        upstream = await fetch(recordingUrl, {
          redirect: 'follow',
          signal: ac.signal,
          headers: fetchHeaders
        });
      } finally {
        clearTimeout(kill);
      }

      if (!upstream.ok) {
        return res.status(502).json({ ok: false, error: `Recording host returned ${upstream.status}` });
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
        res.status(500).json({ ok: false, error: error.message || 'Stream failed' });
      }
    }
  });

  return router;
}

