import { Router } from 'express';

export function createLeadsPortalRouter(deps) {
  const {
    getClientFromHeader,
    normalizePhoneE164,
    readJson,
    writeJson,
    LEADS_PATH,
    nanoid,
    smsConfig,
    renderTemplate,
  } = deps || {};

  const router = Router();

  // Canonical public-ish intake path (JSON-backed) used to avoid 404s.
  router.post('/api/leads', async (req, res) => {
    try {
      console.log('HIT /api/leads (override)', { rid: req.id, path: req.path });

      const client = await getClientFromHeader(req);
      if (!client) return res.status(401).json({ ok: false, error: 'missing or unknown X-Client-Key' });

      const body = req.body || {};
      const service = String(body.service || '');
      const lead = body.lead || {};
      const name = String(lead.name || body.name || '').trim();
      const phoneIn = String(lead.phone || body.phone || '').trim();
      const source = String(body.source || 'unknown');
      const autoNudgeRequested = body.autoNudge === true;
      const suppressNudge =
        body.autoNudge === false || body.skipNudge === true || body.suppressNudge === true;

      if (!name || !phoneIn) return res.status(400).json({ ok: false, error: 'Missing lead.name or lead.phone' });

      const regionHint =
        body.region ||
        client?.booking?.country ||
        client?.default_country ||
        client?.country ||
        'GB';
      const phone = normalizePhoneE164(phoneIn, regionHint);
      if (!phone) {
        return res.status(400).json({
          ok: false,
          error: `invalid phone (expected E.164 like +447... or convertible with region ${regionHint})`,
        });
      }

      const now = new Date().toISOString();
      const rows = (await readJson(LEADS_PATH, [])) || [];
      const id = 'lead_' + nanoid(8);
      const saved = {
        id,
        tenantId: client.clientKey || client.id,
        name,
        phone,
        source,
        service: service || 'unspecified',
        status: 'new',
        createdAt: now,
        updatedAt: now,
      };
      rows.push(saved);
      await writeJson(LEADS_PATH, rows);

      const shouldAutoNudge = autoNudgeRequested && !suppressNudge;
      if (shouldAutoNudge) {
        try {
          const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
          if (configured) {
            const brand = client?.displayName || client?.clientKey || 'Our Clinic';
            const templ =
              client?.smsTemplates?.nudge ||
              `Hi {{name}} — it’s {{brand}}. Ready to book your appointment? Reply YES to continue.`;
            const msgBody = renderTemplate(templ, { name, brand });
            const payload = { to: phone, body: msgBody };
            if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
            else if (fromNumber) payload.from = fromNumber;
            const resp = await smsClient.messages.create(payload);
            console.log('[LEAD AUTO-NUDGE SENT]', {
              to: phone,
              tenant: client?.clientKey || null,
              sid: resp?.sid || null,
            });
          }
        } catch (e) {
          console.log('[AUTO-NUDGE SMS ERROR]', e?.message || String(e));
        }
      }

      return res.status(201).json({ ok: true, lead: saved, override: true });
    } catch (err) {
      console.error('[POST /api/leads override] error:', err);
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // CRM-backed read endpoint used by portal UI
  router.get('/api/leads', async (req, res) => {
    try {
      const clientKey = req.query.clientKey || req.get('X-Client-Key');
      if (!clientKey) {
        return res.status(400).json({ success: false, error: 'clientKey is required' });
      }

      const { query } = await import('../db.js');
      const limit = parseInt(req.query.limit) || 1000;

      const result = await query(
        `
      SELECT 
        id,
        name,
        phone,
        email,
        status,
        tags,
        source,
        score,
        notes,
        custom_fields,
        created_at,
        updated_at,
        last_contacted_at
      FROM leads
      WHERE client_key = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
        [clientKey, limit],
      );

      const leads = result.rows.map((row) => ({
        id: row.id,
        name: row.name || 'Unknown',
        phone: row.phone,
        email: row.email,
        status: row.status || 'new',
        tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : [],
        source: row.source || 'Unknown',
        score: row.score || 50,
        notes: row.notes || '',
        customFields: row.custom_fields || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_contacted_at: row.last_contacted_at,
      }));

      res.json({ success: true, count: leads.length, leads });
    } catch (error) {
      console.error('[LEADS API ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch leads',
        details: error.message,
      });
    }
  });

  // CRM-backed update endpoint used by portal UI
  router.put('/api/leads/:leadId', async (req, res) => {
    try {
      const { leadId } = req.params;
      const clientKey = req.query.clientKey || req.get('X-Client-Key') || req.body.clientKey;

      if (!clientKey) {
        return res.status(400).json({ success: false, error: 'clientKey is required' });
      }

      const { query } = await import('../db.js');

      const existing = await query(`SELECT id, client_key FROM leads WHERE id = $1`, [leadId]);
      if (!existing.rows || existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }
      if (existing.rows[0].client_key !== clientKey) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (req.body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(req.body.name);
      }
      if (req.body.phone !== undefined) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(req.body.phone);
      }
      if (req.body.email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        values.push(req.body.email);
      }
      if (req.body.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(req.body.status);
      }
      if (req.body.tags !== undefined) {
        updates.push(`tags = $${paramIndex++}`);
        values.push(Array.isArray(req.body.tags) ? req.body.tags.join(',') : req.body.tags);
      }
      if (req.body.score !== undefined) {
        updates.push(`score = $${paramIndex++}`);
        values.push(req.body.score);
      }
      if (req.body.notes !== undefined) {
        updates.push(`notes = $${paramIndex++}`);
        values.push(req.body.notes);
      }
      if (req.body.customFields !== undefined) {
        updates.push(`custom_fields = $${paramIndex++}`);
        values.push(req.body.customFields);
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      values.push(leadId);
      const updateQuery = `
      UPDATE leads 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

      const updated = await query(updateQuery, values);
      res.json({ success: true, lead: updated.rows[0] });
    } catch (error) {
      console.error('[LEAD UPDATE ERROR]', error);
      res.status(500).json({ success: false, error: 'Failed to update lead', details: error.message });
    }
  });

  return router;
}

