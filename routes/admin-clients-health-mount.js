import { Router } from 'express';

export function createAdminClientsHealthRouter(deps) {
  const {
    getApiKey,
    loadDb,
    getFullClient,
    listFullClients,
    upsertFullClient,
    normalizePhoneE164,
    calculateLeadScore,
    query,
    isPostgres,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
  } = deps || {};

  const router = Router();

  function requireAdminKey(req, res) {
    const apiKey = req.get('X-API-Key');
    const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
    if (!apiKey || apiKey !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  async function loadDbOrImport() {
    if (typeof loadDb === 'function') return loadDb();
    return import('../db.js');
  }

  // Get all clients
  router.get('/admin/clients', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      console.log('[CLIENT LIST REQUESTED]', {
        requestedBy: req.ip,
      });

      const db = await loadDbOrImport();
      const clients = await db.listFullClients();

      const clientsWithLeads = await Promise.all(
        clients.map(async (client) => {
          const leads = await db.getLeadsByClient(client.key);
          return {
            ...client,
            leads: leads || [],
            leadCount: leads ? leads.length : 0,
          };
        }),
      );

      return res.json({
        ok: true,
        clients: clientsWithLeads,
        totalClients: clientsWithLeads.length,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[CLIENT LIST ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Get specific client
  router.get('/admin/clients/:clientKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { clientKey } = req.params;

      console.log('[CLIENT DETAILS REQUESTED]', {
        clientKey,
        requestedBy: req.ip,
      });

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const db = await loadDbOrImport();
      const leads = await db.getLeadsByClient(clientKey);

      return res.json({
        ok: true,
        client: {
          ...client,
          leads: leads || [],
          leadCount: leads ? leads.length : 0,
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[CLIENT DETAILS ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/admin/system-health', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const vapiEnv = {
        hasPrivateKey: !!process.env.VAPI_PRIVATE_KEY,
        hasAssistantId: !!process.env.VAPI_ASSISTANT_ID,
        hasPhoneNumberId: !!process.env.VAPI_PHONE_NUMBER_ID,
      };

      const health = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          nodeVersion: process.version,
          platform: process.platform,
        },
        database: {
          status: 'unknown',
          lastCheck: new Date().toISOString(),
        },
        external: {
          vapi: 'unknown',
          twilio: 'unknown',
          google: 'unknown',
        },
        dialing: {
          vapiEnv,
          lastProcessCallQueueAt: globalThis.__opsLastProcessCallQueueAt || null,
          lastQueueNewLeadsAt: globalThis.__opsLastQueueNewLeadsAt || null,
          lastQueueNewLeadsCronAt: globalThis.__opsLastQueueNewLeadsCronAt || null,
          lastOverdueReschedule: globalThis.__opsLastOverdueReschedule || null,
          vapiConcurrency: null,
          callQueue: null,
        },
        performance: {
          avgResponseTime: 0,
          errorRate: 0,
          requestCount: 0,
        },
      };

      // Test database connectivity
      try {
        await listFullClients();
        health.database.status = 'connected';
      } catch (e) {
        health.database.status = 'disconnected';
        health.database.error = e.message;
      }

      // Test external services
      try {
        const vapiKeyProbe =
          (process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY || '').trim();
        if (vapiKeyProbe) {
          const vapiDefaultBase = 'https://api.vapi.ai';
          const vapiBase = (process.env.VAPI_ORIGIN && String(process.env.VAPI_ORIGIN).trim())
            ? String(process.env.VAPI_ORIGIN).trim().replace(/\/+$/, '')
            : vapiDefaultBase;
          const headers = { 'Authorization': `Bearer ${vapiKeyProbe}` };
          const assistantId = String(process.env.VAPI_ASSISTANT_ID || '').trim();
          const phoneNumberId = String(process.env.VAPI_PHONE_NUMBER_ID || '').trim();

          health.external.vapiProbe = {
            base: vapiBase,
            assistantIdPresent: !!assistantId,
            phoneNumberIdPresent: !!phoneNumberId,
            attempted: null,
            status: null,
          };

          let ok = false;
          if (assistantId) {
            const url = `${vapiBase}/assistant/${encodeURIComponent(assistantId)}`;
            health.external.vapiProbe.attempted = url;
            const r = await fetch(url, { method: 'GET', headers });
            health.external.vapiProbe.status = r.status;
            ok = r.ok;
          } else if (phoneNumberId) {
            const url = `${vapiBase}/phone-number/${encodeURIComponent(phoneNumberId)}`;
            health.external.vapiProbe.attempted = url;
            const r = await fetch(url, { method: 'GET', headers });
            health.external.vapiProbe.status = r.status;
            ok = r.ok;
          } else {
            const url = `${vapiBase}/assistant`;
            health.external.vapiProbe.attempted = url;
            const r = await fetch(url, { method: 'GET', headers });
            health.external.vapiProbe.status = r.status;
            ok = r.ok;
          }
          health.external.vapi = ok ? 'connected' : 'error';
        }
      } catch (e) {
        health.external.vapi = 'error';
        health.external.vapiProbe = health.external.vapiProbe || {};
        health.external.vapiProbe.error = String(e?.message || e).slice(0, 240);
      }

      // Dialing diagnostics (non-fatal)
      try {
        const { getVapiConcurrencyState } = await import('../lib/instant-calling.js');
        health.dialing.vapiConcurrency = getVapiConcurrencyState();
      } catch {
        health.dialing.vapiConcurrency = null;
      }
      try {
        if (isPostgres) {
          const { rows } = await query(
            `
          SELECT
            (SELECT COUNT(*)::int FROM call_queue WHERE status = 'pending') AS pending_total,
            (SELECT COUNT(*)::int FROM call_queue WHERE status = 'pending' AND scheduled_for <= NOW()) AS due_now_total,
            (SELECT COUNT(*)::int FROM call_queue WHERE status = 'processing') AS processing_total,
            (SELECT MIN(scheduled_for) FROM call_queue WHERE status = 'pending') AS next_scheduled_for
          `
          );
          const r = rows?.[0] || {};
          health.dialing.callQueue = {
            pendingTotal: parseInt(r.pending_total, 10) || 0,
            dueNowTotal: parseInt(r.due_now_total, 10) || 0,
            processingTotal: parseInt(r.processing_total, 10) || 0,
            nextScheduledFor: r.next_scheduled_for ? new Date(r.next_scheduled_for).toISOString() : null,
          };
        } else {
          health.dialing.callQueue = null;
        }
      } catch {
        health.dialing.callQueue = null;
      }

      try {
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
          const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`;
          const twilioTest = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
            },
          });
          health.external.twilioProbe = { attempted: url, status: twilioTest.status };
          health.external.twilio = twilioTest.ok ? 'connected' : 'error';
        }
      } catch (e) {
        health.external.twilio = 'error';
        health.external.twilioProbe = health.external.twilioProbe || {};
        health.external.twilioProbe.error = String(e?.message || e).slice(0, 240);
      }

      console.log('[SYSTEM HEALTH]', {
        database: health.database.status,
        vapi: health.external.vapi,
        twilio: health.external.twilio,
        memory: Math.round(health.system.memory.heapUsed / 1024 / 1024) + 'MB',
      });

      res.json({
        ok: true,
        health,
        status: health.database.status === 'connected' ? 'healthy' : 'degraded',
      });
    } catch (e) {
      console.error('[SYSTEM HEALTH ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Real-time metrics dashboard
  router.get('/admin/metrics', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const clients = await listFullClients();

      const leads = clients.flatMap((c) => c.leads || []);

      const db = await loadDbOrImport();
      const allCalls = [];
      for (const client of clients) {
         
        const clientCalls = await db.getCallsByTenant(client.clientKey, 1000);
        allCalls.push(...clientCalls);
      }
      const calls = allCalls;

      const metrics = {
        overview: {
          totalLeads: leads.length,
          totalCalls: calls.length,
          activeTenants: clients.length,
          uptime: process.uptime(),
          lastUpdated: now.toISOString(),
        },
        last24h: {
          newLeads: leads.filter((l) => new Date(l.createdAt || l.lastInboundAt) > last24h).length,
          totalCalls: calls.filter((c) => new Date(c.createdAt) > last24h).length,
          optIns: leads.filter((l) => l.consentSms && new Date(l.updatedAt) > last24h).length,
          optOuts: leads.filter((l) => l.status === 'opted_out' && new Date(l.updatedAt) > last24h).length,
        },
        last7d: {
          newLeads: leads.filter((l) => new Date(l.createdAt || l.lastInboundAt) > last7d).length,
          totalCalls: calls.filter((c) => new Date(c.createdAt) > last7d).length,
          conversionRate: 0,
          avgCallDuration: 0,
        },
        byTenant: {},
        costs: {
          estimatedVapiCost: calls.length * 0.05,
          last24hCost: calls.filter((c) => new Date(c.createdAt) > last24h).length * 0.05,
          last7dCost: calls.filter((c) => new Date(c.createdAt) > last7d).length * 0.05,
        },
        performance: {
          successRate: (calls.filter((c) => c.status === 'completed').length / Math.max(calls.length, 1)) * 100,
          avgResponseTime: 0,
          errorRate: (calls.filter((c) => c.status === 'failed').length / Math.max(calls.length, 1)) * 100,
        },
        vapi: {
          totalCalls: calls.length,
          callsToday: calls.filter((c) => new Date(c.createdAt) > last24h).length,
          callsThisWeek: calls.filter((c) => new Date(c.createdAt) > last7d).length,
          successfulCalls: calls.filter((c) => c.outcome === 'completed' || c.outcome === 'booked').length,
          failedCalls: calls.filter((c) => ['no-answer', 'busy', 'declined', 'failed'].includes(c.outcome)).length,
          averageCallDuration:
            calls.length > 0 ? calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length : 0,
          totalCallCost: calls.reduce((sum, c) => sum + (c.cost || 0.05), 0),
          callSuccessRate:
            calls.length > 0
              ? (
                  (calls.filter((c) => c.outcome === 'completed' || c.outcome === 'booked').length / calls.length) *
                  100
                ).toFixed(1)
              : 0,
          costPerConversion:
            calls.length > 0
              ? (
                  calls.reduce((sum, c) => sum + (c.cost || 0.05), 0) /
                  Math.max(leads.filter((l) => l.status === 'booked').length, 1)
                ).toFixed(2)
              : 0,
          retryRate: (calls.filter((c) => c.retryAttempt > 0).length / Math.max(calls.length, 1)) * 100,
          businessHoursCalls: calls.filter((c) => {
            const callTime = new Date(c.createdAt);
            const hour = callTime.getHours();
            return hour >= 9 && hour < 17;
          }).length,
          afterHoursCalls: calls.filter((c) => {
            const callTime = new Date(c.createdAt);
            const hour = callTime.getHours();
            return hour < 9 || hour >= 17;
          }).length,
        },
      };

      const leadsWithCalls = leads.filter((l) => calls.some((c) => c.leadPhone === l.phone));
      metrics.last7d.conversionRate = (leadsWithCalls.length / Math.max(leads.length, 1)) * 100;

      const completedCalls = calls.filter((c) => c.status === 'completed' && c.duration);
      if (completedCalls.length > 0) {
        metrics.last7d.avgCallDuration =
          completedCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / completedCalls.length;
      }

      for (const tenant of clients) {
        const tenantLeads = leads.filter((l) => {
          if (l.tenantKey === tenant.clientKey) return true;
          if (l.phone && tenant?.sms?.fromNumber) {
            const leadPhone = normalizePhoneE164(l.phone, 'GB');
            const tenantPhone = normalizePhoneE164(tenant.sms.fromNumber, 'GB');
            return leadPhone === tenantPhone;
          }
          return false;
        });
        const tenantCalls = calls.filter((c) => c.tenantKey === tenant.clientKey);

        const leadScores = tenantLeads.map((lead) => calculateLeadScore(lead, tenant));
        const avgLeadScore =
          leadScores.length > 0 ? leadScores.reduce((sum, score) => sum + score, 0) / leadScores.length : 0;
        const highPriorityLeads = leadScores.filter((score) => score >= 80).length;
        const mediumPriorityLeads = leadScores.filter((score) => score >= 60 && score < 80).length;

        metrics.byTenant[tenant.clientKey] = {
          displayName: tenant.displayName || tenant.clientKey,
          totalLeads: tenantLeads.length,
          totalCalls: tenantCalls.length,
          last24hLeads: tenantLeads.filter((l) => new Date(l.createdAt || l.lastInboundAt) > last24h).length,
          last24hCalls: tenantCalls.filter((c) => new Date(c.createdAt) > last24h).length,
          conversionRate: (tenantCalls.length / Math.max(tenantLeads.length, 1)) * 100,
          successRate:
            (tenantCalls.filter((c) => c.status === 'completed').length / Math.max(tenantCalls.length, 1)) * 100,
          leadScoring: {
            avgScore: Math.round(avgLeadScore),
            highPriority: highPriorityLeads,
            mediumPriority: mediumPriorityLeads,
            lowPriority: leadScores.filter((score) => score < 60).length,
          },
        };
      }

      console.log('[METRICS]', {
        totalLeads: metrics.overview.totalLeads,
        totalCalls: metrics.overview.totalCalls,
        conversionRate: metrics.last7d.conversionRate.toFixed(1) + '%',
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        metrics,
        generatedAt: now.toISOString(),
      });
    } catch (e) {
      console.error('[METRICS ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Admin endpoint to fix tenant SMS configurations
  router.post('/admin/fix-tenants', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      console.log('[TENANT FIX] Starting tenant configuration fix...');

      const validMessagingServiceSid = 'MG852f3cf7b50ef1be50c566be9e7efa04';

      await upsertFullClient({
        clientKey: 'victory_dental',
        displayName: 'Victory Dental',
        timezone: 'Europe/London',
        locale: 'en-GB',
        numbers: {
          clinic: '+447491683261',
          inbound: '+447403934440',
        },
        sms: {
          fromNumber: '+447403934440',
          messagingServiceSid: validMessagingServiceSid,
        },
        vapi: {},
        calendarId: null,
        booking: {
          defaultDurationMin: 30,
          timezone: 'Europe/London',
        },
        smsTemplates: {},
      });

      await upsertFullClient({
        clientKey: 'northside_vet',
        displayName: 'Northside Vet',
        timezone: 'Europe/London',
        locale: 'en-GB',
        numbers: {
          clinic: '+447491683261',
          inbound: '+447491683261',
        },
        sms: {
          fromNumber: '+447491683261',
          messagingServiceSid: validMessagingServiceSid,
        },
        vapi: {},
        calendarId: null,
        booking: {
          defaultDurationMin: 30,
          timezone: 'Europe/London',
        },
        smsTemplates: {},
      });

      console.log('[TENANT FIX] Configuration fix completed successfully');

      res.json({
        ok: true,
        message: 'Tenant configurations fixed successfully with valid MessagingServiceSid',
        changes: {
          victory_dental: {
            fromNumber: '+447403934440',
            messagingServiceSid: validMessagingServiceSid,
          },
          northside_vet: {
            fromNumber: '+447491683261',
            messagingServiceSid: validMessagingServiceSid,
          },
        },
      });
    } catch (e) {
      console.error('[TENANT FIX ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

