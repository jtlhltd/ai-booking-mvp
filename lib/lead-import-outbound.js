/**
 * Post-import outbound: queue outside business hours, background instant calls when in-hours.
 * Extracted from server.js legacy /api/leads/import handler.
 */

export async function processLeadImportOutboundCalls({ clientKey, client, inserted }) {
  const { processCallQueue } = await import('./instant-calling.js');
  const rows = inserted || [];
  if (!rows.length) return;

  const leads = rows.map((row) => ({
    phone: row.phone,
    name: row.name || row.phone,
    service: row.service || 'Lead Follow-Up',
    source: row.source || 'Import',
    leadScore: 50,
    correlationId: `import_${clientKey}_${row.id}_${Date.now()}`
  }));

  const clientForQueue = {
    ...client,
    client_key: clientKey || client?.clientKey
  };
  if (!clientForQueue.client_key) {
    console.error('[LEAD IMPORT][bg] Missing client_key for processCallQueue');
    return;
  }

  await processCallQueue(leads, clientForQueue, {
    maxConcurrent: 1,
    delayBetweenCalls: 2000,
    maxCallsPerBatch: 50
  });
}

export async function runOutboundCallsForImportedLeads({
  clientKey,
  inserted,
  isBusinessHours,
  getNextBusinessHour,
  scheduleAtOptimalCallWindow,
  addToCallQueue,
  TIMEZONE
}) {
  const { getFullClient, getLatestCallInsights, getCallTimeBanditState } = await import('../db.js');

  const callSummary = {
    inBusinessHours: null,
    shouldCallNow: null,
    called: 0,
    queued: 0,
    reason: null
  };
  if (!inserted?.length) return callSummary;

  const client = await getFullClient(clientKey);
  if (!client) {
    console.log('[LEAD IMPORT] No client found for', clientKey);
    callSummary.reason = 'client_not_found';
    return callSummary;
  }

  const allowEnvVapiFallback =
    String(process.env.IMPORT_ALLOW_ENV_VAPI_FALLBACK || '').trim() !== '' &&
    !['0', 'false', 'no', 'off'].includes(String(process.env.IMPORT_ALLOW_ENV_VAPI_FALLBACK).trim().toLowerCase());
  const hasVapi = !!(
    client.vapi?.assistantId ||
    client.vapiAssistantId ||
    (allowEnvVapiFallback && process.env.VAPI_ASSISTANT_ID)
  );
  const isEnabled = !!client.isEnabled || allowEnvVapiFallback;
  if (!isEnabled && !allowEnvVapiFallback) {
    console.log('[LEAD IMPORT] Client not enabled, skipping call/queue:', clientKey);
    callSummary.reason = 'client_not_enabled';
    return callSummary;
  }
  if (!hasVapi) {
    console.log('[LEAD IMPORT] Client missing VAPI assistantId (and no env fallback), skipping call/queue:', clientKey);
    callSummary.reason = 'vapi_not_configured';
    return callSummary;
  }

  const vapiConfigured =
    client &&
    (client.isEnabled || allowEnvVapiFallback) &&
    (client.vapi?.assistantId || client?.vapiAssistantId || (allowEnvVapiFallback && process.env.VAPI_ASSISTANT_ID));

  if (!vapiConfigured) {
    if (!callSummary.reason) callSummary.reason = 'client_not_enabled_or_no_vapi';
    console.log('[LEAD IMPORT] Client not enabled or missing VAPI config, skipping');
    return callSummary;
  }

  const insightsRow = await getLatestCallInsights(clientKey).catch(() => null);
  const routing = insightsRow?.routing;

  const inBusinessHours = isBusinessHours(client);
  const shouldCallNow = inBusinessHours;
  callSummary.inBusinessHours = inBusinessHours;
  callSummary.shouldCallNow = shouldCallNow;
  const scheduledBaseline = shouldCallNow ? new Date() : getNextBusinessHour(client);
  const importBanditArms = await getCallTimeBanditState(clientKey).catch(() => ({}));
  console.log('[LEAD IMPORT] Call decision:', {
    clientKey,
    allowEnvVapiFallback,
    inBusinessHours,
    shouldCallNow
  });

  if (shouldCallNow) {
    callSummary.reason = 'calls_background';
    callSummary.called = 0;
    callSummary.queued = 0;
    callSummary.pendingOutbound = inserted.length;
    console.log('[LEAD IMPORT] Starting outbound calls in background for', inserted.length, 'lead(s)');
    setImmediate(() => {
      processLeadImportOutboundCalls({ clientKey, client, inserted }).catch((e) =>
        console.error('[LEAD IMPORT][bg] Unhandled:', e?.message || e)
      );
    });
    return callSummary;
  }

  let queuedCount = 0;
  for (const lead of inserted) {
    try {
      const scheduledFor = await scheduleAtOptimalCallWindow(client, routing, scheduledBaseline, {
        fallbackTz: TIMEZONE,
        clientKey,
        jitterKey: `import:${clientKey}:${lead.id}:${lead.phone}`,
        banditArms: importBanditArms
      });
      await addToCallQueue({
        clientKey,
        leadPhone: lead.phone,
        priority: 8,
        scheduledFor,
        callType: 'vapi_call',
        callData: {
          triggerType: 'new_lead_import',
          leadId: lead.id,
          leadName: lead.name,
          leadService: lead.service,
          leadSource: lead.source,
          leadStatus: lead.status,
          businessHours: 'outside'
        }
      });
      queuedCount++;
      console.log('[LEAD IMPORT] Queued lead for next business hour:', lead.phone);
    } catch (err) {
      console.error('[LEAD IMPORT] Failed for lead:', lead.phone, err?.message);
    }
  }
  callSummary.queued = queuedCount;
  callSummary.called = 0;
  callSummary.reason = queuedCount > 0 ? 'outside_business_hours' : null;
  console.log('[LEAD IMPORT]', `${queuedCount} queued for next business hour`);
  return callSummary;
}
