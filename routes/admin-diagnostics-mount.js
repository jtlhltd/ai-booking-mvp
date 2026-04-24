import { Router } from 'express';

/**
 * Admin diagnostics + demo/receptionist telemetry + tenant list/detail (moved from server.js).
 */
export function createAdminDiagnosticsRouter(deps) {
  const router = Router();
  const {
    resolveTenantKeyFromInbound,
    listFullClients,
    loadDemoScript,
    readDemoTelemetry,
    clearDemoTelemetry,
    readReceptionistTelemetry,
    clearReceptionistTelemetry,
    readJson,
    LEADS_PATH,
    normalizePhoneE164,
    getFullClient,
    calculateLeadScore,
    getLeadPriority,
  } = deps || {};

router.get('/admin/tenant-resolve', async (req, res) => {
  try {
    const { to, mss } = req.query;
    if (!to) return res.status(400).json({ ok: false, error: 'Missing "to" parameter' });

    const tenantKey = await resolveTenantKeyFromInbound({ to, messagingServiceSid: mss });
    res.json({ ok: true, tenantKey, to, messagingServiceSid: mss });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to validate tenant SMS configuration
router.get('/admin/check-tenants', async (req, res) => {
  try {
    const clients = await listFullClients();
    const tenants = clients.map(client => ({
      tenantKey: client.clientKey,
      fromNumber: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null
    }));

    // Detect duplicates
    const fromNumberCounts = {};
    const messagingServiceSidCounts = {};
    
    tenants.forEach(tenant => {
      if (tenant.fromNumber) {
        fromNumberCounts[tenant.fromNumber] = (fromNumberCounts[tenant.fromNumber] || 0) + 1;
      }
      if (tenant.messagingServiceSid) {
        messagingServiceSidCounts[tenant.messagingServiceSid] = (messagingServiceSidCounts[tenant.messagingServiceSid] || 0) + 1;
      }
    });

    const duplicates = {
      fromNumber: Object.keys(fromNumberCounts).filter(num => fromNumberCounts[num] > 1),
      messagingServiceSid: Object.keys(messagingServiceSidCounts).filter(sid => messagingServiceSidCounts[sid] > 1)
    };

    const dupFromCount = duplicates.fromNumber.length;
    const dupSidCount = duplicates.messagingServiceSid.length;
    
    console.log('[TENANT CHECK]', { 
      tenantsCount: tenants.length, 
      dupFromCount, 
      dupSidCount 
    });

    res.json({
      ok: true,
      tenants,
      duplicates
    });
  } catch (e) {
    console.error('[TENANT CHECK ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Demo scripting visibility
router.get('/admin/demo-script', async (req, res) => {
  try {
    const script = await loadDemoScript();
    res.json({
      ok: true,
      demoMode: process.env.DEMO_MODE === 'true',
      script
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Demo telemetry feed
router.get('/admin/demo-telemetry', async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;
    const events = await readDemoTelemetry({ limit });
    res.json({
      ok: true,
      count: events.length,
      events
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Reset telemetry (demo-only convenience)
router.delete('/admin/demo-telemetry', async (req, res) => {
  try {
    await clearDemoTelemetry();
    res.json({ ok: true, message: 'Demo telemetry cleared' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Receptionist telemetry feed
router.get('/admin/receptionist-telemetry', async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;
    const events = await readReceptionistTelemetry({ limit });
    res.json({
      ok: true,
      count: events.length,
      events
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.delete('/admin/receptionist-telemetry', async (req, res) => {
  try {
    await clearReceptionistTelemetry();
    res.json({ ok: true, message: 'Receptionist telemetry cleared' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint for runtime change feed
router.get('/admin/changes', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const changes = [
      {
        id: 'change_001',
        type: 'deployment',
        timestamp: new Date().toISOString(),
        description: 'Added missing logging tags and admin changes endpoint',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      },
      {
        id: 'change_002', 
        type: 'feature',
        timestamp: new Date().toISOString(),
        description: 'Implemented VAPI call timeout and number validation',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      },
      {
        id: 'change_003',
        type: 'fix',
        timestamp: new Date().toISOString(),
        description: 'Fixed tenant resolution and cost optimization',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      }
    ];

    console.log('[CHANGE]', { changesCount: changes.length, requestedBy: req.ip });

    res.json({
      ok: true,
      changes,
      total: changes.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CHANGE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Lead scoring debug endpoint
router.get('/admin/lead-score', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phone, tenantKey } = req.query;
    if (!phone) return res.status(400).json({ ok: false, error: 'Missing "phone" parameter' });

    const leads = await readJson(LEADS_PATH, []);
    const normalizedPhone = normalizePhoneE164(phone, 'GB');
    const lead = leads.find(l => {
      const leadPhone = normalizePhoneE164(l.phone, 'GB');
      return leadPhone === normalizedPhone || l.phone === phone || l.phone === normalizedPhone;
    });
    
    if (!lead) {
      return res.json({ ok: true, phone, found: false, message: 'Lead not found' });
    }

    const tenant = tenantKey ? await getFullClient(tenantKey) : null;
    const score = calculateLeadScore(lead, tenant);
    const priority = getLeadPriority(score);

    console.log('[LEAD SCORE DEBUG]', { phone, tenantKey, score, priority, requestedBy: req.ip });

    res.json({
      ok: true,
      phone,
      tenantKey: tenant?.clientKey || null,
      score,
      priority,
      breakdown: {
        consentSms: lead.consentSms ? 30 : 0,
        status: lead.status === 'engaged' ? 20 : 0,
        responseTime: lead.lastInboundAt && lead.createdAt ? 
          Math.min(25, Math.max(0, 25 - ((new Date(lead.lastInboundAt) - new Date(lead.createdAt)) / (1000 * 60 * 5)))) : 0,
        keywords: lead.lastInboundText ? 
          (lead.lastInboundText.toLowerCase().includes('urgent') ? 20 : 0) +
          (lead.lastInboundText.toLowerCase().includes('book') ? 15 : 0) +
          (lead.lastInboundText.toLowerCase().includes('?') ? 5 : 0) : 0,
        recency: lead.lastInboundAt ? 
          Math.min(15, Math.max(0, 15 - ((new Date() - new Date(lead.lastInboundAt)) / (1000 * 60 * 60)))) : 0
      },
      lead: {
        status: lead.status,
        consentSms: lead.consentSms,
        lastInboundText: lead.lastInboundText,
        lastInboundAt: lead.lastInboundAt,
        createdAt: lead.createdAt
      }
    });
  } catch (e) {
    console.error('[LEAD SCORE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// System health and performance monitoring
// Tenant management endpoints
router.get('/admin/tenants', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clients = await listFullClients();
    const tenants = clients.map(client => ({
      clientKey: client.clientKey,
      displayName: client.displayName || client.clientKey,
      timezone: client.timezone || 'Europe/London',
      locale: client.locale || 'en-GB',
      phone: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null,
      status: 'active',
      createdAt: client.createdAt || new Date().toISOString(),
      lastActivity: client.lastActivity || null
    }));

    console.log('[TENANT LIST]', { tenantsCount: tenants.length, requestedBy: req.ip });

    res.json({
      ok: true,
      tenants,
      total: tenants.length
    });
  } catch (e) {
    console.error('[TENANT LIST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.get('/admin/tenants/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const client = await getFullClient(tenantKey);
    
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Tenant not found' });
    }

    const tenant = {
      clientKey: client.clientKey,
      displayName: client.displayName || client.clientKey,
      timezone: client.timezone || 'Europe/London',
      locale: client.locale || 'en-GB',
      phone: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null,
      vapiAssistantId: client?.vapi?.assistantId || null,
      vapiPhoneNumberId: client?.vapi?.phoneNumberId || null,
      calendarId: client?.calendarId || null,
      businessHours: client?.businessHours || {
        start: 9,
        end: 17,
        days: [1, 2, 3, 4, 5]
      },
      status: 'active',
      createdAt: client.createdAt || new Date().toISOString(),
      lastActivity: client.lastActivity || null
    };

    console.log('[TENANT DETAIL]', { tenantKey, requestedBy: req.ip });

    res.json({
      ok: true,
      tenant
    });
  } catch (e) {
    console.error('[TENANT DETAIL ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

  return router;
}
