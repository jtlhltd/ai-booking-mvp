/**
 * Leads import handler extracted from `server.js` for testability and coverage.
 * Intentionally keeps logic close to the existing implementation to avoid behavior drift.
 */
import { scrubBody } from './log-scrubber.js';

export async function handleLeadsImport(req, res, deps) {
  const {
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
  } = deps || {};

  // CRITICAL: Log immediately to ensure we see this
  console.error('[LEAD IMPORT API] ========== ENDPOINT HIT ==========');
  console.error('[LEAD IMPORT API] Timestamp:', new Date().toISOString());

  try {
    // Log raw request details
    console.error('[LEAD IMPORT API] ========== REQUEST RECEIVED ==========');
    console.error('[LEAD IMPORT API] Method:', req.method);
    console.error('[LEAD IMPORT API] URL:', req.url);
    console.error('[LEAD IMPORT API] Content-Type:', req.headers['content-type']);
    console.error('[LEAD IMPORT API] Content-Length:', req.headers['content-length']);
    console.error('[LEAD IMPORT API] Has body:', !!req.body);
    console.error('[LEAD IMPORT API] Body type:', typeof req.body);
    console.error('[LEAD IMPORT API] Body keys:', req.body ? Object.keys(req.body) : 'no body');
    console.error('[LEAD IMPORT API] Full body:', JSON.stringify(scrubBody(req.body), null, 2));
    console.error('[LEAD IMPORT API] body.leads type:', typeof req.body?.leads);
    console.error('[LEAD IMPORT API] body.leads isArray:', Array.isArray(req.body?.leads));
    console.error('[LEAD IMPORT API] body.leads constructor:', req.body?.leads?.constructor?.name);
    if (req.body?.leads && typeof req.body.leads === 'object' && !Array.isArray(req.body.leads)) {
      console.error('[LEAD IMPORT API] body.leads keys (if object):', Object.keys(req.body.leads));
      console.error(
        '[LEAD IMPORT API] body.leads stringified:',
        JSON.stringify(scrubBody(req.body.leads)).substring(0, 500),
      );
    }

    // Try to extract with case-insensitive matching
    const body = req.body || {};
    const clientKey = body.clientKey || body.clientkey || body.client_key || body.ClientKey;
    let leads = body.leads || body.Leads || body.leadList || [];

    // Handle case where leads might be a stringified JSON string
    if (typeof leads === 'string') {
      console.error('[LEAD IMPORT API] leads is a string, attempting to parse:', leads.substring(0, 200));
      try {
        leads = JSON.parse(leads);
        console.error('[LEAD IMPORT API] Successfully parsed leads from string');
      } catch (parseError) {
        console.error('[LEAD IMPORT API] Failed to parse leads string:', parseError);
        leads = [];
      }
    }

    // Handle case where leads is an object with numeric keys (array converted to object)
    if (leads && typeof leads === 'object' && !Array.isArray(leads)) {
      const keys = Object.keys(leads);
      const allNumericKeys = keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
      if (allNumericKeys) {
        console.error('[LEAD IMPORT API] leads is object with numeric keys, converting to array');
        leads = keys
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
          .map((key) => leads[key]);
        console.error('[LEAD IMPORT API] Converted to array with', leads.length, 'items');
      } else {
        console.error('[LEAD IMPORT API] leads is object but not array-like, treating as invalid');
        leads = [];
      }
    }

    console.error('[LEAD IMPORT API] Extracted values:', {
      clientKey,
      clientKeyType: typeof clientKey,
      leadsType: Array.isArray(leads) ? 'array' : typeof leads,
      leadsLength: Array.isArray(leads) ? leads.length : 'not array',
      leadsPreview: Array.isArray(leads) && leads.length > 0 ? scrubBody(leads[0]) : 'no leads',
      leadsConstructor: leads?.constructor?.name
    });

    if (!clientKey || !Array.isArray(leads) || leads.length === 0) {
      console.error('[LEAD IMPORT API] ========== VALIDATION FAILED ==========');
      return res.status(400).json({ ok: false, error: 'Missing clientKey or leads payload' });
    }

    let crmLeadCountBefore = null;
    try {
      const beforeCnt = await query?.('SELECT COUNT(*)::int AS n FROM leads WHERE client_key = $1', [clientKey]);
      crmLeadCountBefore = parseInt(beforeCnt?.rows?.[0]?.n ?? 0, 10);
    } catch (beforeErr) {
      console.error('[LEAD IMPORT] Could not count leads before import:', clientKey, beforeErr?.message);
    }

    const inserted = [];
    let skippedInvalidPhone = 0;
    let skippedOptedOut = 0;
    const LEADS_IMPORT_MAX_PER_REQUEST = 200;
    const leadsBatch = leads.slice(0, LEADS_IMPORT_MAX_PER_REQUEST);
    const truncated = leads.length > LEADS_IMPORT_MAX_PER_REQUEST;
    let failedWrites = 0;
    const failedWriteSamples = [];

    for (const payload of leadsBatch) {
      const phone = validateAndSanitizePhone?.(payload.phone);
      if (!phone) {
        skippedInvalidPhone += 1;
        continue;
      }
      if (await isOptedOut?.(clientKey, phone)) {
        skippedOptedOut += 1;
        continue;
      }
      const mk = phoneMatchKey?.(phone);
      if (!mk) {
        skippedInvalidPhone += 1;
        continue;
      }
      const name = sanitizeInput?.(payload.name || phone, 120);
      const service = sanitizeInput?.(payload.service || 'Lead Follow-Up', 120);
      const source = sanitizeInput?.(payload.source || 'Import', 120);

      try {
        const result = await query?.(
          `
              INSERT INTO leads (client_key, name, phone, phone_match_key, service, source, status)
              VALUES ($1, $2, $3, $4, $5, $6, 'new')
              ON CONFLICT (client_key, phone_match_key) DO UPDATE
              SET name = EXCLUDED.name,
                  phone = EXCLUDED.phone,
                  service = COALESCE(EXCLUDED.service, leads.service),
                  source = COALESCE(EXCLUDED.source, leads.source)
              RETURNING id, name, phone, service, source, status, notes
            `,
          [clientKey, name, phone, mk, service, source]
        );
        if (result?.rows?.[0]) inserted.push(result.rows[0]);
      } catch (insertError) {
        // Postgres 42P10: ON CONFLICT target missing (migrations lag) — upsert without requiring that index.
        if (insertError?.code === '42P10') {
          try {
            const upd = await query?.(
              `UPDATE leads
               SET name = $2,
                   phone = $3,
                   service = COALESCE($5, service),
                   source = COALESCE($6, source)
               WHERE client_key = $1 AND phone_match_key = $4
               RETURNING id, name, phone, service, source, status, notes`,
              [clientKey, name, phone, mk, service, source]
            );
            if (upd?.rows?.[0]) {
              inserted.push(upd.rows[0]);
            } else {
              const ins = await query?.(
                `INSERT INTO leads (client_key, name, phone, phone_match_key, service, source, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'new')
                 RETURNING id, name, phone, service, source, status, notes`,
                [clientKey, name, phone, mk, service, source]
              );
              if (ins?.rows?.[0]) inserted.push(ins.rows[0]);
            }
          } catch (fallbackErr) {
            failedWrites += 1;
            if (failedWriteSamples.length < 5) {
              failedWriteSamples.push({
                phone,
                message: fallbackErr?.message || 'insert failed (42P10 fallback)',
                code: fallbackErr?.code || insertError?.code || null
              });
            }
          }
        } else {
          failedWrites += 1;
          if (failedWriteSamples.length < 5) {
            failedWriteSamples.push({
              phone,
              message: insertError?.message || 'insert failed',
              code: insertError?.code || null
            });
          }
        }
      }
    }

    // Optionally kick off outbound processing (async)
    let callSummary = null;
    try {
      if (typeof runOutboundCallsForImportedLeads === 'function') {
        callSummary = await runOutboundCallsForImportedLeads({
          clientKey,
          inserted,
          getClientFromHeader,
          isBusinessHours,
          getNextBusinessHour,
          scheduleAtOptimalCallWindow,
          addToCallQueue,
          TIMEZONE
        });
      }
    } catch (e) {
      callSummary = { reason: 'error', error: e?.message || String(e) };
    }

    let totalLeadsInCrm = null;
    try {
      const afterCnt = await query?.('SELECT COUNT(*)::int AS n FROM leads WHERE client_key = $1', [clientKey]);
      totalLeadsInCrm = parseInt(afterCnt?.rows?.[0]?.n ?? 0, 10);
    } catch {
      /* best-effort count */
    }

    const netNewLeadsInCrm =
      totalLeadsInCrm != null && crmLeadCountBefore != null ? totalLeadsInCrm - crmLeadCountBefore : null;

    return res.json({
      ok: true,
      inserted: inserted.length,
      requestedCount: leads.length,
      receivedCount: leads.length,
      processedCount: leadsBatch.length,
      processedBatchCount: leadsBatch.length,
      maxPerRequest: LEADS_IMPORT_MAX_PER_REQUEST,
      truncated,
      skippedInvalidPhone,
      skippedOptedOut,
      failedWrites,
      failedWriteSamples: failedWriteSamples.length ? failedWriteSamples : undefined,
      crmLeadCountBefore,
      totalLeadsInCrm,
      netNewLeadsInCrm,
      leads: inserted.map((l) => (sanitizeLead ? sanitizeLead(l) : l)),
      callSummary: inserted.length > 0 ? callSummary : undefined
    });
  } catch (error) {
    console.error('[LEAD IMPORT ERROR]', error);
    const ck =
      req.body?.clientKey ||
      req.body?.client_key ||
      req.body?.clientkey ||
      req.body?.ClientKey ||
      'unknown';
    await sendOperatorAlert?.({
      subject: `Lead import API failed (${ck})`,
      html: `<p><code>/api/leads/import</code> returned 500.</p><pre>${JSON.stringify(
        { clientKey: ck, message: error?.message, stack: error?.stack?.split('\\n').slice(0, 12).join('\\n') },
        null,
        2
      )}</pre>`,
      dedupeKey: `lead-import-500:${String(ck)}`,
      throttleMinutes: 60
    }).catch?.(() => {});
    return res.status(500).json({ ok: false, error: error.message });
  }
}

