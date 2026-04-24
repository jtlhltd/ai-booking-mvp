import express from 'express';
import { handleLeadsImport } from '../lib/leads-import.js';

export function createImportLeadsRouter(deps) {
  const {
    getFullClient,
    isBusinessHours,
    // /api/leads/import deps
    query,
    getClientFromHeader,
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
    TIMEZONE
  } = deps || {};
  const router = express.Router();

  // Debug endpoint: verify JSON body parsing / headers (kept for backward compat)
  router.post('/leads/import-test', async (req, res) => {
    console.log('[TEST ENDPOINT] Request received');
    console.log('[TEST ENDPOINT] Headers:', req.headers);
    console.log('[TEST ENDPOINT] Body:', req.body);
    console.log('[TEST ENDPOINT] Body type:', typeof req.body);
    console.log('[TEST ENDPOINT] Body keys:', req.body ? Object.keys(req.body) : 'no body');
    res.json({
      ok: true,
      received: true,
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      }
    });
  });

  // Legacy import alias (same handler)
  router.post('/leads/import__legacy', async (req, res) =>
    handleLeadsImport(req, res, {
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
      TIMEZONE
    })
  );

  router.post('/leads/import', async (req, res) =>
    handleLeadsImport(req, res, {
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
      TIMEZONE
    })
  );

  router.post('/import-leads/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { csvData, columnMapping, autoStartCampaign } = req.body;

      if (!csvData) {
        return res.status(400).json({ ok: false, error: 'No CSV data provided' });
      }

      const { parseCSV, importLeads } = await import('../lib/lead-import.js');
      const { notifyLeadUpload } = await import('../lib/notifications.js');
      const { calculateLeadScore } = await import('../lib/lead-intelligence.js');
      const { bulkProcessLeads } = await import('../lib/lead-deduplication.js');

      const leads = parseCSV(csvData, columnMapping || {});

      console.log(
        `[LEAD DEDUP] Processing ${leads.length} leads for validation and deduplication...`
      );
      const dedupResults = await bulkProcessLeads(leads, clientKey);

      console.log(
        `[LEAD DEDUP] Results: ${dedupResults.valid} valid, ${dedupResults.invalid} invalid, ${dedupResults.duplicates} duplicates, ${dedupResults.optedOut} opted-out`
      );

      const validLeads = dedupResults.validLeads;

      validLeads.forEach((lead) => {
        lead.leadScore = calculateLeadScore(lead);
      });
      validLeads.sort((a, b) => b.leadScore - a.leadScore);

      console.log(
        `[LEAD IMPORT] Top lead score: ${validLeads[0]?.leadScore}, Lowest: ${
          validLeads[validLeads.length - 1]?.leadScore
        }`
      );

      const results = await importLeads(clientKey, validLeads, {
        validatePhones: false,
        skipDuplicates: false,
        autoStartCampaign: autoStartCampaign === true
      });

      results.validation = {
        totalProcessed: leads.length,
        valid: dedupResults.valid,
        invalid: dedupResults.invalid,
        duplicates: dedupResults.duplicates,
        optedOut: dedupResults.optedOut,
        invalidReasons: dedupResults.invalidLeads
          .slice(0, 5)
          .map((l) => ({ phone: l.phone, issues: l.issues }))
      };

      const client = await getFullClient(clientKey);

      await notifyLeadUpload({
        clientKey,
        clientName: client?.business_name || clientKey,
        leadCount: results.imported,
        importMethod: 'csv_upload'
      });

      let callResults = null;
      if (
        autoStartCampaign !== false &&
        results.imported > 0 &&
        client &&
        isBusinessHours(client)
      ) {
        console.log(`[INSTANT CALLING] Starting immediate calls for ${results.imported} leads...`);

        const { processCallQueue, estimateCallTime } = await import('../lib/instant-calling.js');

        const leadsToCall = validLeads
          .filter((l) => {
            return l.phone && l.leadScore > 0;
          })
          .slice(0, results.imported);

        const estimate = estimateCallTime(leadsToCall.length, 2000);
        console.log(
          `[INSTANT CALLING] ETA: ${estimate.formatted} (complete by ${estimate.completionTime})`
        );

        processCallQueue(leadsToCall, client, {
          maxConcurrent: 1,
          delayBetweenCalls: 2000,
          maxCallsPerBatch: 50
        })
          .then((callResults) => {
            console.log(`[INSTANT CALLING] ✅ Campaign complete: ${callResults.initiated} calls made`);
          })
          .catch((error) => {
            console.error(`[INSTANT CALLING] ❌ Campaign failed:`, error);
          });

        callResults = {
          status: 'started',
          totalLeads: leadsToCall.length,
          estimatedTime: estimate.formatted,
          completionTime: estimate.completionTime,
          message: `Campaign started! Calling ${leadsToCall.length} leads now...`
        };
      }

      res.json({
        ok: true,
        message: `Imported ${results.imported} leads${callResults ? ' - Campaign started!' : ''}`,
        results,
        avgLeadScore:
          validLeads.length > 0
            ? Math.round(validLeads.reduce((sum, l) => sum + l.leadScore, 0) / validLeads.length)
            : 0,
        calling: callResults
      });
    } catch (error) {
      console.error('[LEAD IMPORT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

