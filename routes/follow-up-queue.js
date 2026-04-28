import express from 'express';

export function createFollowUpQueueRouter(deps) {
  const { getFullClient, resolveLogisticsSpreadsheetId, sheets } = deps || {};
  const router = express.Router();

  function isFollowUpQueueDemoClient(clientKey) {
    const k = String(clientKey || '').toLowerCase().trim();
    return k === 'demo_client' || k === 'demo-client' || k === 'stay-focused-fitness-chris';
  }

  router.get('/follow-up-queue/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store');
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 80));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

      if (isFollowUpQueueDemoClient(clientKey)) {
        const demoRows = [
          {
            Timestamp: new Date(Date.now() - 2 * 3600000).toLocaleString('en-GB', {
              timeZone: 'Europe/London'
            }),
            'Business Name': 'Northbridge Freight Ltd',
            'Decision Maker': 'Alex Morgan',
            Phone: '+447700900111',
            Email: 'alex.m@northbridge.example',
            'International (Y/N)': 'Y',
            'Main Couriers': 'DHL, FedEx',
            'International Shipments per Week': '120',
            'Main Countries': 'DE, FR, US',
            'Call ID': 'demo-sheet-1',
            'Transcript Snippet':
              'Interested in comparing international rates; asked for a callback Thursday PM.',
            'Recording URI': '',
            'Called Number': '+442033344555',
            'Receptionist Name': 'Sam'
          },
          {
            Timestamp: new Date(Date.now() - 26 * 3600000).toLocaleString('en-GB', {
              timeZone: 'Europe/London'
            }),
            'Business Name': 'Coastal Packaging Co',
            'Decision Maker': 'Jordan Lee',
            Phone: '+447700900222',
            Email: '',
            'International (Y/N)': 'N',
            'UK Shipments per Week': '400',
            'UK Courier': 'DPD',
            'Call ID': 'demo-sheet-2',
            'Transcript Snippet':
              'Confirmed they use multi-parcel daily; not ready to switch until Q3.',
            'Recording URI': '',
            'Called Number': '+442033344555',
            'Receptionist Name': ''
          }
        ];
        const rows = demoRows;
        const total = rows.length;
        return res.json({
          ok: true,
          demo: true,
          configured: true,
          source: 'demo',
          total,
          offset,
          limit,
          rows: rows.slice(offset, offset + limit)
        });
      }

      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      if (!spreadsheetId) {
        return res.json({
          ok: true,
          configured: false,
          source: 'sheet',
          total: 0,
          rows: [],
          message:
            'No logistics Google Sheet is linked to this workspace. Add logisticsSheetId (or gsheet_id) on the client, or set LOGISTICS_SHEET_ID.'
        });
      }

      await sheets.ensureLogisticsHeader(spreadsheetId);
      const { rows: rawRows } = await sheets.readSheet(spreadsheetId, 'Sheet1!A:Z');
      let records = sheets.logisticsSheetRowsToRecords(rawRows).map((r, idx) => ({
        ...r,
        _row: idx + 2
      }));
      records.reverse();
      const total = records.length;
      res.json({
        ok: true,
        demo: false,
        configured: true,
        source: 'sheet',
        total,
        offset,
        limit,
        rows: records.slice(offset, offset + limit)
      });
    } catch (error) {
      console.error('[FOLLOW-UP QUEUE ERROR]', error);
      const msg = error?.message || String(error);
      res.status(502).json({
        ok: false,
        configured: true,
        error: 'sheet_read_failed',
        message: msg,
        rows: []
      });
    }
  });

  router.get('/follow-up-queue/:clientKey/stats', async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store');

      function classifyRowStatus(row) {
        const statusRaw = String(row?.Status || row?.['Status'] || '').trim();
        const dispRaw = String(row?.Disposition || row?.['Disposition'] || '').trim();
        const status = (statusRaw || dispRaw || 'To call').toLowerCase();
        if (status === 'called') return 'called';
        if (status === 'quoted') return 'quoted';
        if (status.includes('do not call') || status === 'dnc') return 'dnc';
        if (status.includes('disqual')) return 'disqualified';
        return 'todo';
      }

      function parseUkTimestampToMs(s) {
        const m = String(s || '')
          .trim()
          .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!m) return NaN;
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        const h = Number(m[4]);
        const mi = Number(m[5]);
        const se = m[6] != null ? Number(m[6]) : 0;
        const t = new Date(y, mo - 1, d, h, mi, se).getTime();
        return Number.isFinite(t) ? t : NaN;
      }

      function parseAnyTimestampToMs(s) {
        const uk = parseUkTimestampToMs(s);
        if (Number.isFinite(uk)) return uk;
        const iso = Date.parse(String(s || '').trim());
        return Number.isFinite(iso) ? iso : NaN;
      }

      function computeStats(rows) {
        const now = Date.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const startMs = todayStart.getTime();

        const out = {
          total: 0,
          todo: 0,
          called: 0,
          quoted: 0,
          dnc: 0,
          disqualified: 0,
          today: { total: 0, todo: 0, called: 0, quoted: 0, dnc: 0, disqualified: 0 }
        };
        for (const row of rows || []) {
          const kind = classifyRowStatus(row);
          out.total += 1;
          out[kind] += 1;
          const createdMs = parseAnyTimestampToMs(row?.Timestamp);
          if (Number.isFinite(createdMs) && createdMs >= startMs && createdMs <= now) {
            out.today.total += 1;
          }
          const outcomeMs = parseAnyTimestampToMs(
            row?.['Last Outcome At'] || row?.['Last Outcome'] || ''
          );
          const effectiveMs = Number.isFinite(outcomeMs) ? outcomeMs : createdMs;
          if (Number.isFinite(effectiveMs) && effectiveMs >= startMs && effectiveMs <= now) {
            out.today[kind] += 1;
          }
        }
        return out;
      }

      if (isFollowUpQueueDemoClient(clientKey)) {
        const demoRows = [
          {
            Timestamp: new Date(Date.now() - 2 * 3600000).toLocaleString('en-GB', {
              timeZone: 'Europe/London'
            }),
            Status: 'To call'
          },
          {
            Timestamp: new Date(Date.now() - 26 * 3600000).toLocaleString('en-GB', {
              timeZone: 'Europe/London'
            }),
            Status: 'Called'
          }
        ];
        return res.json({
          ok: true,
          demo: true,
          configured: true,
          source: 'demo',
          stats: computeStats(demoRows)
        });
      }

      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      if (!spreadsheetId) {
        return res.json({
          ok: true,
          configured: false,
          source: 'sheet',
          stats: computeStats([])
        });
      }

      await sheets.ensureLogisticsHeader(spreadsheetId);
      const { rows: rawRows } = await sheets.readSheet(spreadsheetId, 'Sheet1!A:Z');
      const records = sheets.logisticsSheetRowsToRecords(rawRows);
      res.json({ ok: true, demo: false, configured: true, source: 'sheet', stats: computeStats(records) });
    } catch (error) {
      console.error('[FOLLOW-UP QUEUE STATS ERROR]', error);
      res.status(502).json({
        ok: false,
        error: 'stats_failed',
        message: error?.message || String(error)
      });
    }
  });

  router.post('/follow-up-queue/:clientKey/status', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { row, called, callId, phone } = req.body || {};
      const rowNumber = parseInt(row, 10);
      if (!Number.isFinite(rowNumber) || rowNumber < 2) {
        return res.status(400).json({ ok: false, error: 'invalid_row' });
      }
      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      if (!spreadsheetId) {
        return res.status(400).json({ ok: false, error: 'sheet_not_configured' });
      }
      const isCalled = !!called;
      let ok = await sheets.updateLogisticsStatusByRow(spreadsheetId, rowNumber, { called: isCalled });
      if (!ok) {
        ok = await sheets.updateLogisticsCalledFlag(spreadsheetId, { callId, phone, called: isCalled });
      }
      if (!ok) {
        return res.status(502).json({ ok: false, error: 'update_failed' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('[FOLLOW-UP STATUS UPDATE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  });

  router.post('/follow-up-queue/:clientKey/patch', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { row, patch } = req.body || {};
      const rowNumber = parseInt(row, 10);
      if (!Number.isFinite(rowNumber) || rowNumber < 2) {
        return res.status(400).json({ ok: false, error: 'invalid_row' });
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return res.status(400).json({ ok: false, error: 'invalid_patch' });
      }

      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      if (!spreadsheetId) {
        return res.status(400).json({ ok: false, error: 'sheet_not_configured' });
      }

      const ok = await sheets.patchLogisticsRowByNumber(spreadsheetId, rowNumber, patch);
      if (!ok) {
        try {
          const { addToRetryQueue } = await import('../db.js');
          await addToRetryQueue({
            clientKey,
            leadPhone: '__sheet__',
            retryType: 'sheet_patch',
            retryReason: 'follow_up_patch',
            retryData: { rowNumber, patch, error: 'sheet_patch_failed' },
            scheduledFor: new Date(),
            retryAttempt: 1,
            maxRetries: 5
          });
        } catch (e) {
          console.warn('[FOLLOW-UP PATCH] failed to enqueue retry:', e?.message || e);
        }
        return res.status(502).json({ ok: false, error: 'update_failed' });
      }
      res.json({ ok: true });
    } catch (error) {
      globalThis.__opsLastFollowUpPatchError = {
        at: new Date().toISOString(),
        message: error?.message || String(error)
      };
      console.error('[FOLLOW-UP PATCH ERROR]', error);
      try {
        const { addToRetryQueue } = await import('../db.js');
        await addToRetryQueue({
          clientKey: req.params?.clientKey,
          leadPhone: '__sheet__',
          retryType: 'sheet_patch',
          retryReason: 'follow_up_patch_exception',
          retryData: {
            rowNumber: parseInt(req.body?.row, 10),
            patch: req.body?.patch || null,
            error: String(error?.message || error)
          },
          scheduledFor: new Date(Date.now() + 60_000),
          retryAttempt: 1,
          maxRetries: 5
        });
      } catch {}
      res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  });

  router.post('/follow-up-queue/:clientKey/batchPatch', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { patches } = req.body || {};
      if (!Array.isArray(patches) || patches.length < 1) {
        return res.status(400).json({ ok: false, error: 'invalid_patches' });
      }
      if (patches.length > 200) {
        return res
          .status(400)
          .json({ ok: false, error: 'too_many', message: 'Max 200 patches per request' });
      }

      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      if (!spreadsheetId) {
        return res.status(400).json({ ok: false, error: 'sheet_not_configured' });
      }

      const results = [];
      let okCount = 0;
      for (const item of patches) {
        const rowNumber = parseInt(item?.row, 10);
        const patch = item?.patch;
        if (
          !Number.isFinite(rowNumber) ||
          rowNumber < 2 ||
          !patch ||
          typeof patch !== 'object' ||
          Array.isArray(patch)
        ) {
          results.push({ ok: false, row: item?.row, error: 'invalid_item' });
          continue;
        }
        const ok = await sheets.patchLogisticsRowByNumber(spreadsheetId, rowNumber, patch);
        results.push({ ok: !!ok, row: rowNumber });
        if (ok) okCount += 1;
        if (!ok) {
          try {
            const { addToRetryQueue } = await import('../db.js');
            await addToRetryQueue({
              clientKey,
              leadPhone: '__sheet__',
              retryType: 'sheet_patch',
              retryReason: 'follow_up_batch_patch',
              retryData: { rowNumber, patch, error: 'sheet_patch_failed' },
              scheduledFor: new Date(Date.now() + 60_000),
              retryAttempt: 1,
              maxRetries: 5
            });
          } catch (e) {
            console.warn('[FOLLOW-UP BATCH PATCH] failed to enqueue retry:', e?.message || e);
          }
        }
      }

      res.json({ ok: true, updated: okCount, total: patches.length, results });
    } catch (error) {
      globalThis.__opsLastFollowUpPatchError = {
        at: new Date().toISOString(),
        message: error?.message || String(error)
      };
      console.error('[FOLLOW-UP BATCH PATCH ERROR]', error);
      res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  });

  return router;
}

