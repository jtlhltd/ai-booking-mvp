import express from 'express';
import { resolveTenantTimezone, toLocalTimestamp, toUtcIso } from '../lib/timezone-resolver.js';

export function createCoreApiRouter(deps) {
  const { query, getIntegrationStatuses, getFullClient } = deps || {};
  const router = express.Router();
  const escapeCsv = (val) => `"${String(val ?? '').replace(/\"/g, '""')}"`;

  async function getExportTimezone(clientKey) {
    if (typeof getFullClient !== 'function') return resolveTenantTimezone(null);
    try {
      const c = await getFullClient(clientKey);
      return resolveTenantTimezone(c);
    } catch {
      return resolveTenantTimezone(null);
    }
  }

  async function getLeadRecord(leadId) {
    const result = await query(
      `
    SELECT id, client_key, phone, name, service, status, source, notes
    FROM leads
    WHERE id = $1
  `,
      [leadId]
    );
    return result.rows?.[0];
  }

  function sanitizeLead(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      service: row.service,
      status: row.status,
      source: row.source,
      lastMessage: row.notes
    };
  }

  router.get('/integration-health/:clientKey', async (req, res) => {
    try {
      const integrations = await getIntegrationStatuses(req.params.clientKey);
      res.json({
        ok: true,
        integrations
      });
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/calls/:callId', async (req, res) => {
    try {
      const { callId } = req.params;
      const { clientKey } = req.query;

      if (!clientKey) {
        return res.status(400).json({ ok: false, error: 'clientKey required' });
      }

      const result = await query(
        `
      SELECT call_id, id, lead_phone, status, outcome, duration, cost, transcript, 
             summary, created_at, metadata
      FROM calls
      WHERE client_key = $2
        AND (
          call_id = $1 
          OR id::text = $1 
          OR lead_phone = $1
        )
      ORDER BY 
        CASE 
          WHEN call_id = $1 THEN 1
          WHEN id::text = $1 THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT 1
    `,
        [callId, clientKey]
      );

      if (!result.rows || !result.rows.length) {
        return res.status(404).json({ ok: false, error: 'Call not found' });
      }

      const row = result.rows[0];

      res.json({
        ok: true,
        call: {
          callId: row.call_id,
          id: row.id,
          leadPhone: row.lead_phone,
          status: row.status,
          outcome: row.outcome,
          duration: row.duration,
          cost: row.cost,
          transcript: row.transcript,
          summary: row.summary,
          createdAt: row.created_at,
          metadata: row.metadata
        }
      });
    } catch (error) {
      console.error('[CALL DETAILS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/leads/:leadId/snooze', async (req, res) => {
    const { leadId } = req.params;
    const { clientKey, minutes } = req.body || {};
    const snoozeMinutes = Math.max(5, parseInt(minutes, 10) || 1440);
    try {
      if (!clientKey) {
        return res.status(400).json({ ok: false, error: 'clientKey required' });
      }
      const lead = await getLeadRecord(leadId);
      if (!lead) {
        return res.status(404).json({ ok: false, error: 'Lead not found' });
      }
      if (lead.client_key !== clientKey) {
        return res.status(403).json({ ok: false, error: 'Access denied' });
      }
      const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60000).toISOString();
      await query(
        `
      INSERT INTO lead_engagement (client_key, lead_phone, engagement_data)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (client_key, lead_phone)
      DO UPDATE SET engagement_data = COALESCE(lead_engagement.engagement_data, '{}'::jsonb) || EXCLUDED.engagement_data,
                    last_updated = NOW()
    `,
        [lead.client_key, lead.phone, JSON.stringify({ snoozedUntil })]
      );

      const updated = await query(
        `
      UPDATE leads
      SET status = $2,
          notes = CONCAT('Snoozed until ', $3, ' • ', COALESCE(notes, ''))
      WHERE id = $1
      RETURNING id, name, phone, service, status, source, notes
    `,
        [leadId, 'Snoozed', snoozedUntil]
      );

      return res.json({ ok: true, lead: sanitizeLead(updated.rows?.[0]) });
    } catch (error) {
      console.error('[LEAD SNOOZE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/leads/:leadId/escalate', async (req, res) => {
    const { leadId } = req.params;
    const { clientKey } = req.body || {};
    try {
      if (!clientKey) {
        return res.status(400).json({ ok: false, error: 'clientKey required' });
      }
      const lead = await getLeadRecord(leadId);
      if (!lead) {
        return res.status(404).json({ ok: false, error: 'Lead not found' });
      }
      if (lead.client_key !== clientKey) {
        return res.status(403).json({ ok: false, error: 'Access denied' });
      }
      await query(
        `
      INSERT INTO lead_engagement (client_key, lead_phone, engagement_data)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (client_key, lead_phone)
      DO UPDATE SET engagement_data = COALESCE(lead_engagement.engagement_data, '{}'::jsonb) || EXCLUDED.engagement_data,
                    last_updated = NOW()
    `,
        [lead.client_key, lead.phone, JSON.stringify({ priority: true })]
      );

      const updated = await query(
        `
      UPDATE leads
      SET status = $2,
          notes = CONCAT('Escalated via dashboard at ', NOW()::text, ' • ', COALESCE(notes, ''))
      WHERE id = $1
      RETURNING id, name, phone, service, status, source, notes
    `,
        [leadId, 'Priority']
      );

      return res.json({ ok: true, lead: sanitizeLead(updated.rows?.[0]) });
    } catch (error) {
      console.error('[LEAD ESCALATE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/export/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const { clientKey } = req.query;
      if (!clientKey) {
        return res.status(400).json({ ok: false, error: 'clientKey required' });
      }

      const timezone = await getExportTimezone(clientKey);
      let csv = '';
      let filename = '';

      if (type === 'leads') {
        const result = await query(
          `
        SELECT name, phone, service, source, status, notes, created_at
        FROM leads
        WHERE client_key = $1
        ORDER BY created_at DESC
      `,
          [clientKey]
        );

        csv = 'Name,Phone,Service,Source,Status,Notes,Created UTC,Created Local,Tenant Timezone\n';
        result.rows.forEach((row) => {
          const createdUtc = toUtcIso(row.created_at);
          const createdLocal = toLocalTimestamp(row.created_at, timezone);
          csv += `${escapeCsv(row.name)},${escapeCsv(row.phone)},${escapeCsv(row.service)},${escapeCsv(row.source)},${escapeCsv(row.status)},${escapeCsv(row.notes)},${escapeCsv(createdUtc)},${escapeCsv(createdLocal)},${escapeCsv(timezone)}\n`;
        });
        filename = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'calls') {
        const result = await query(
          `
        SELECT l.name, c.lead_phone, c.status, c.outcome, c.duration, c.created_at
        FROM calls c
        LEFT JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
        WHERE c.client_key = $1
        ORDER BY c.created_at DESC
      `,
          [clientKey]
        );

        csv = 'Name,Phone,Status,Outcome,Duration (s),Created UTC,Created Local,Tenant Timezone\n';
        result.rows.forEach((row) => {
          const createdUtc = toUtcIso(row.created_at);
          const createdLocal = toLocalTimestamp(row.created_at, timezone);
          csv += `${escapeCsv(row.name)},${escapeCsv(row.lead_phone)},${escapeCsv(row.status)},${escapeCsv(row.outcome)},${escapeCsv(row.duration)},${escapeCsv(createdUtc)},${escapeCsv(createdLocal)},${escapeCsv(timezone)}\n`;
        });
        filename = `calls-export-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'appointments') {
        const result = await query(
          `
        SELECT l.name, a.start_iso, a.end_iso, a.status, l.service
        FROM appointments a
        LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.client_key = $1
        ORDER BY a.start_iso DESC
      `,
          [clientKey]
        );

        csv = 'Name,Start UTC,Start Local,End UTC,End Local,Status,Service,Tenant Timezone\n';
        result.rows.forEach((row) => {
          const startUtc = toUtcIso(row.start_iso);
          const startLocal = toLocalTimestamp(row.start_iso, timezone);
          const endUtc = toUtcIso(row.end_iso);
          const endLocal = toLocalTimestamp(row.end_iso, timezone);
          csv += `${escapeCsv(row.name)},${escapeCsv(startUtc)},${escapeCsv(startLocal)},${escapeCsv(endUtc)},${escapeCsv(endLocal)},${escapeCsv(row.status)},${escapeCsv(row.service)},${escapeCsv(timezone)}\n`;
        });
        filename = `appointments-export-${new Date().toISOString().split('T')[0]}.csv`;
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid export type' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('[EXPORT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

