/**
 * Post-import outbound: queue outside business hours, background instant calls when in-hours.
 * Extracted from server.js legacy /api/leads/import handler.
 *
 * DANGER: This function bypasses scheduleAtOptimalCallWindow and dials the
 * imported leads in a burst (delayBetweenCalls=2s, maxCallsPerBatch=50).
 * The audit found this was the root cause of the "$20 burned in minutes"
 * regression. The function has no live callers; it is kept gated behind
 * ALLOW_LEGACY_INSTANT_IMPORT_DIAL=1 strictly so a future operator who
 * comes looking for it has to opt in deliberately. Default behavior is
 * to throw.
 *
 * Use `runOutboundCallsForImportedLeads` (below) for the safe path.
 */

function isLegacyInstantImportDialAllowed() {
  const v = String(process.env.ALLOW_LEGACY_INSTANT_IMPORT_DIAL || '').trim().toLowerCase();
  return v !== '' && !['0', 'false', 'no', 'off'].includes(v);
}

export async function processLeadImportOutboundCalls({ clientKey, client, inserted }) {
  if (!isLegacyInstantImportDialAllowed()) {
    throw new Error(
      'processLeadImportOutboundCalls is disabled. It dials imported leads in a burst, bypassing ' +
        'scheduleAtOptimalCallWindow. Use runOutboundCallsForImportedLeads instead, or set ' +
        'ALLOW_LEGACY_INSTANT_IMPORT_DIAL=1 if you absolutely understand the spend implications.',
    );
  }
  const { dialLeadsNowBatch } = await import('./instant-calling.js');
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
    console.error('[LEAD IMPORT][bg] Missing client_key for dialLeadsNowBatch');
    return;
  }

  await dialLeadsNowBatch(leads, clientForQueue, {
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
  // Important: even when in-hours, we DO NOT immediately dial imported leads in the background.
  // Imports can be large and bursty; we always enqueue and let the insights/routing scheduling
  // system distribute dials across the day.
  const shouldCallNow = false;
  callSummary.inBusinessHours = inBusinessHours;
  callSummary.shouldCallNow = shouldCallNow;
  const scheduledBaseline = inBusinessHours ? new Date() : getNextBusinessHour(client);
  const importBanditArms = await getCallTimeBanditState(clientKey).catch(() => ({}));
  console.log('[LEAD IMPORT] Call decision:', {
    clientKey,
    allowEnvVapiFallback,
    inBusinessHours,
    shouldCallNow
  });

  let queuedCount = 0;
  const minSpacingMs = Math.max(
    0,
    Math.min(10 * 60_000, parseInt(process.env.LEAD_QUEUE_MIN_SPACING_MS || '15000', 10) || 15000)
  );
  let movingBaseline = new Date(scheduledBaseline);
  for (const lead of inserted) {
    try {
      const scheduledFor = await scheduleAtOptimalCallWindow(client, routing, movingBaseline, {
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
          businessHours: inBusinessHours ? 'within' : 'outside'
        }
      });
      queuedCount++;
      movingBaseline = new Date(Math.max(movingBaseline.getTime() + minSpacingMs, new Date(scheduledFor).getTime()));
      console.log('[LEAD IMPORT] Queued lead for next business hour:', lead.phone);
    } catch (err) {
      console.error('[LEAD IMPORT] Failed for lead:', lead.phone, err?.message);
    }
  }
  callSummary.queued = queuedCount;
  callSummary.called = 0;
  callSummary.reason = queuedCount > 0 ? 'queued_for_routing_distribution' : null;
  console.log('[LEAD IMPORT]', `${queuedCount} queued for next business hour`);
  return callSummary;
}
