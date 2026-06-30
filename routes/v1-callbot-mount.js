/**
 * Versioned Call Bot API for external consumers (per-tenant API keys).
 * Mounted at /api/v1
 */
import { Router } from 'express';
import { authenticateApiKey } from '../middleware/security.js';
import { handleLeadsImport } from '../lib/leads-import.js';

function rejectClientKeyMismatch(req, res) {
  const bodyKey = String(req.body?.clientKey || req.body?.client_key || req.query?.clientKey || '').trim();
  if (bodyKey && bodyKey !== req.clientKey) {
    res.status(403).json({ ok: false, error: 'client_key_mismatch', code: 'CLIENT_KEY_MISMATCH' });
    return true;
  }
  return false;
}

export function createV1CallbotRouter(deps) {
  const {
    query,
    getFullClient,
    isBusinessHours,
    getNextBusinessHour,
    scheduleAtOptimalCallWindow,
    addToCallQueue,
    validateAndSanitizePhone,
    phoneMatchKey,
    sanitizeInput,
    isOptedOut,
    sendOperatorAlert,
    sanitizeLead,
    runOutboundCallsForImportedLeads,
    TIMEZONE,
    upsertImportedLead,
    listLeadHandoff,
    getLeadHandoffByPhone,
    listOptOutList,
    dbType,
    DB_PATH,
    resolveLogisticsSpreadsheetId,
  } = deps || {};

  const router = Router();
  router.use(authenticateApiKey);

  router.use((req, res, next) => {
    if (!req.clientKey) {
      return res.status(401).json({ ok: false, error: 'tenant_not_resolved', code: 'INVALID_API_KEY' });
    }
    next();
  });

  router.post('/leads', async (req, res) => {
    if (rejectClientKeyMismatch(req, res)) return;
    req.body = { ...(req.body || {}), clientKey: req.clientKey };
    const getClientFromHeader = async () => getFullClient(req.clientKey);
    return handleLeadsImport(req, res, {
      query,
      getClientFromHeader,
      isBusinessHours,
      getNextBusinessHour,
      scheduleAtOptimalCallWindow,
      addToCallQueue,
      validateAndSanitizePhone,
      phoneMatchKey,
      sanitizeInput,
      isOptedOut,
      sendOperatorAlert,
      sanitizeLead,
      runOutboundCallsForImportedLeads,
      TIMEZONE,
      upsertImportedLead,
    });
  });

  router.post('/leads/:phone/dial', async (req, res) => {
    try {
      if (rejectClientKeyMismatch(req, res)) return;
      const clientKey = req.clientKey;
      const phone = String(req.params.phone || '').trim();
      if (!phone) return res.status(400).json({ ok: false, error: 'missing_phone' });

      const client = await getFullClient(clientKey);
      if (!client) return res.status(404).json({ ok: false, error: 'unknown_client' });

      if (!isBusinessHours(client)) {
        return res.status(403).json({ ok: false, error: 'outside_business_hours' });
      }

      const { addToCallQueue: enqueue, getLatestCallInsights, getCallTimeBanditState } = await import('../db.js');
      const { scheduleAtOptimalCallWindow: scheduleWindow } = await import('../lib/optimal-call-window.js');

      const insightsRow = await getLatestCallInsights(clientKey).catch(() => null);
      const routing = insightsRow?.routing;
      const banditArms = await getCallTimeBanditState(clientKey).catch(() => ({}));
      const scheduledFor = await scheduleWindow(client, routing, new Date(), {
        fallbackTz: client?.booking?.timezone || client?.timezone || TIMEZONE,
        clientKey,
        jitterKey: `recall:${clientKey}:${phone}`,
        banditArms,
      });

      const row = await enqueue({
        clientKey,
        leadPhone: phone,
        priority: 3,
        scheduledFor,
        callType: 'vapi_call',
        callData: {
          triggerType: 'api_v1_recall',
          outboundDialMode: 'classic',
          ...(req.body?.dialContext && typeof req.body.dialContext === 'object' ? { leadDialContext: req.body.dialContext } : {}),
        },
      });

      res.json({ ok: true, queued: true, queueId: row?.id ?? null, scheduledFor });
    } catch (error) {
      console.error('[V1 RECALL ERROR]', error);
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  router.get('/calls/:callId', async (req, res) => {
    try {
      const { callId } = req.params;
      const clientKey = req.clientKey;
      const result = await query(
        `
        SELECT call_id, id, lead_phone, status, outcome, duration, cost, transcript,
               summary, created_at, metadata
        FROM calls
        WHERE client_key = $1
          AND (call_id = $2 OR id::text = $2 OR lead_phone = $2)
        ORDER BY
          CASE WHEN call_id = $2 THEN 1 WHEN id::text = $2 THEN 2 ELSE 3 END,
          created_at DESC
        LIMIT 1
        `,
        [clientKey, callId]
      );
      const row = result.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: 'call_not_found' });
      res.json({
        ok: true,
        call: {
          id: row.call_id,
          leadPhone: row.lead_phone,
          status: row.status,
          outcome: row.outcome,
          durationSeconds: row.duration,
          costUsd: row.cost,
          summary: row.summary,
          transcriptAvailable: !!(row.transcript && String(row.transcript).length),
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  router.get('/calls/:callId/transcript', async (req, res) => {
    try {
      const { callId } = req.params;
      const clientKey = req.clientKey;
      const result = await query(
        `
        SELECT transcript, summary, duration, created_at, call_id, lead_phone
        FROM calls
        WHERE client_key = $2 AND (call_id = $1 OR id::text = $1)
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [callId, clientKey]
      );
      const row = result.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: 'call_not_found' });
      res.json({
        ok: true,
        callId: row.call_id,
        leadPhone: row.lead_phone,
        transcript: row.transcript || '',
        summary: row.summary || '',
        durationSeconds: row.duration,
        createdAt: row.created_at,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  router.get('/handoffs', async (req, res) => {
    try {
      const clientKey = req.clientKey;
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 120));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const rows = (await listLeadHandoff?.({ clientKey, limit: 500, offset: 0 })) || [];
      res.json({
        ok: true,
        total: rows.length,
        offset,
        limit,
        rows: rows.slice(offset, offset + limit),
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  router.get('/handoffs/:phone', async (req, res) => {
    try {
      const clientKey = req.clientKey;
      const phone = decodeURIComponent(String(req.params.phone || '').trim());
      const row = await getLeadHandoffByPhone?.({ clientKey, leadPhone: phone });
      if (!row) return res.status(404).json({ ok: false, error: 'handoff_not_found' });
      res.json({ ok: true, handoff: row });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  router.get('/health', async (req, res) => {
    try {
      const clientKey = req.clientKey;
      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId?.(client);
      const dncCountResult = await (async () => {
        try {
          const r = await query(
            dbType === 'sqlite'
              ? `SELECT COUNT(*) AS n FROM opt_out_list WHERE active = 1 AND client_key = $1`
              : `SELECT COUNT(*) AS n FROM opt_out_list WHERE active = TRUE AND client_key = $1`,
            [clientKey]
          );
          const n = parseInt(r.rows?.[0]?.n ?? '0', 10);
          return Number.isFinite(n) ? n : 0;
        } catch {
          return 0;
        }
      })();

      let walletGateActive = false;
      try {
        const mod = await import('../lib/instant-calling.js');
        walletGateActive = typeof mod?.isVapiWalletDepleted === 'function' ? !!mod.isVapiWalletDepleted() : false;
      } catch {
        walletGateActive = false;
      }

      const vapiConfigured = !!(
        process.env.VAPI_PRIVATE_KEY &&
        (client?.vapiAssistantId || process.env.VAPI_ASSISTANT_ID)
      );

      res.json({
        ok: true,
        tenant: { displayName: client?.displayName || null },
        db: { type: dbType || 'sqlite' },
        vapi: { configured: vapiConfigured, walletGateActive },
        dnc: { activeCount: dncCountResult },
        consumerWebhook: !!(client?.consumerWebhook?.url && client?.consumerWebhook?.enabled !== false),
        logisticsSheetInCore: process.env.LOGISTICS_SHEET_WRITES_IN_CORE !== '0',
        externalSheetConfigured: !!spreadsheetId,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  return router;
}
