/**
 * Outreach API.
 * Mounted at /api/outreach.
 */
import { Router } from 'express';

export function createOutreachRouter() {
  const router = Router();

  router.get('/prospects', async (req, res) => {
    try {
      const { query } = await import('../db.js');
      const { status, channel, industry, limit = 100, offset = 0 } = req.query;

      let sql = 'SELECT * FROM outreach_prospects WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (status) {
        sql += ` AND status = $${paramCount++}`;
        params.push(status);
      }

      if (channel) {
        sql += ` AND channel = $${paramCount++}`;
        params.push(channel);
      }

      if (industry) {
        sql += ` AND industry = $${paramCount++}`;
        params.push(industry);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await query(sql, params);

      let countSql = 'SELECT COUNT(*) as total FROM outreach_prospects WHERE 1=1';
      const countParams = [];
      paramCount = 1;

      if (status) {
        countSql += ` AND status = $${paramCount++}`;
        countParams.push(status);
      }
      if (channel) {
        countSql += ` AND channel = $${paramCount++}`;
        countParams.push(channel);
      }
      if (industry) {
        countSql += ` AND industry = $${paramCount++}`;
        countParams.push(industry);
      }

      const countResult = await query(countSql, countParams);
      const total = parseInt(countResult.rows[0]?.total || 0);

      res.json({
        ok: true,
        prospects: result.rows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('[OUTREACH PROSPECTS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/prospects', async (req, res) => {
    try {
      const { query } = await import('../db.js');
      const {
        name,
        businessName,
        email,
        phone,
        linkedinUrl,
        website,
        industry,
        location,
        channel,
        templateUsed,
        leadSource,
        tags,
        notes
      } = req.body;

      if (!email) {
        return res.status(400).json({ ok: false, error: 'email is required' });
      }

      const existing = await query('SELECT id FROM outreach_prospects WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ ok: false, error: 'Prospect with this email already exists' });
      }

      const result = await query(
        `
      INSERT INTO outreach_prospects (
        name, business_name, email, phone, linkedin_url, website, industry, location,
        channel, template_used, lead_source, tags, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
        [
          name,
          businessName,
          email,
          phone,
          linkedinUrl,
          website,
          industry,
          location,
          channel,
          templateUsed,
          leadSource,
          tags || [],
          notes
        ]
      );

      res.json({
        ok: true,
        prospect: result.rows[0]
      });
    } catch (error) {
      console.error('[OUTREACH CREATE PROSPECT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.put('/prospects/:id', async (req, res) => {
    try {
      const { query } = await import('../db.js');
      const { id } = req.params;
      const updates = req.body;

      const allowedFields = [
        'name',
        'business_name',
        'email',
        'phone',
        'linkedin_url',
        'website',
        'industry',
        'location',
        'status',
        'channel',
        'template_used',
        'contact_number',
        'last_contacted_at',
        'response_date',
        'follow_up_date',
        'outcome',
        'tags',
        'notes',
        'lead_source',
        'metadata'
      ];

      const updateFields = [];
      const params = [];
      let paramCount = 1;

      const fieldMap = {
        name: 'name',
        businessName: 'business_name',
        business_name: 'business_name',
        email: 'email',
        phone: 'phone',
        linkedinUrl: 'linkedin_url',
        linkedin_url: 'linkedin_url',
        website: 'website',
        industry: 'industry',
        location: 'location',
        status: 'status',
        channel: 'channel',
        templateUsed: 'template_used',
        template_used: 'template_used',
        contact_number: 'contact_number',
        contactNumber: 'contact_number',
        last_contacted_at: 'last_contacted_at',
        lastContactedAt: 'last_contacted_at',
        response_date: 'response_date',
        responseDate: 'response_date',
        follow_up_date: 'follow_up_date',
        followUpDate: 'follow_up_date',
        outcome: 'outcome',
        tags: 'tags',
        notes: 'notes',
        lead_source: 'lead_source',
        leadSource: 'lead_source',
        metadata: 'metadata'
      };

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          const dbField = fieldMap[field] || field;
          updateFields.push(`${dbField} = $${paramCount++}`);
          params.push(updates[field]);
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid fields to update' });
      }

      params.push(id);

      const result = await query(
        `
      UPDATE outreach_prospects
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Prospect not found' });
      }

      res.json({
        ok: true,
        prospect: result.rows[0]
      });
    } catch (error) {
      console.error('[OUTREACH UPDATE PROSPECT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/prospects/import', async (req, res) => {
    try {
      const { query } = await import('../db.js');
      const { prospects } = req.body;

      if (!Array.isArray(prospects) || prospects.length === 0) {
        return res.status(400).json({ ok: false, error: 'prospects array is required' });
      }

      const imported = [];
      const errors = [];

      for (const prospect of prospects) {
        try {
          const existing = await query('SELECT id FROM outreach_prospects WHERE email = $1', [
            prospect.email
          ]);

          if (existing.rows.length > 0) {
            errors.push({ email: prospect.email, error: 'Already exists' });
            continue;
          }

          const result = await query(
            `
          INSERT INTO outreach_prospects (
            name, business_name, email, phone, linkedin_url, website, industry, location,
            channel, template_used, lead_source, tags, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id, email
        `,
            [
              prospect.name,
              prospect.businessName || prospect.business_name,
              prospect.email,
              prospect.phone,
              prospect.linkedinUrl || prospect.linkedin_url,
              prospect.website,
              prospect.industry,
              prospect.location,
              prospect.channel || 'email',
              prospect.templateUsed || prospect.template_used,
              prospect.leadSource || prospect.lead_source,
              prospect.tags || [],
              prospect.notes
            ]
          );

          imported.push(result.rows[0]);
        } catch (error) {
          errors.push({ email: prospect.email, error: error.message });
        }
      }

      res.json({
        ok: true,
        imported: imported.length,
        errors: errors.length,
        importedProspects: imported,
        errorDetails: errors
      });
    } catch (error) {
      console.error('[OUTREACH IMPORT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/personalize-email', async (req, res) => {
    try {
      const { template, subjectTemplate, prospects } = req.body;

      if (!template || !subjectTemplate || !prospects || !Array.isArray(prospects)) {
        return res
          .status(400)
          .json({ ok: false, error: 'template, subjectTemplate, and prospects array are required' });
      }

      const personalized = prospects.map((prospect) => {
        let personalizedSubject = subjectTemplate;
        let personalizedBody = template;

        const replacements = {
          '{name}': prospect.name || 'there',
          '{businessName}': prospect.businessName || prospect.business_name || 'your business',
          '{location}': prospect.location || 'your area',
          '{industry}': prospect.industry || 'business',
          '{phone}': prospect.phone || '',
          '{website}': prospect.website || ''
        };

        for (const [key, value] of Object.entries(replacements)) {
          personalizedSubject = personalizedSubject.replace(
            new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'),
            value
          );
          personalizedBody = personalizedBody.replace(
            new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'),
            value
          );
        }

        return {
          prospect,
          subject: personalizedSubject,
          body: personalizedBody,
          to: prospect.email
        };
      });

      res.json({
        ok: true,
        personalized,
        count: personalized.length
      });
    } catch (error) {
      console.error('[EMAIL PERSONALIZATION ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/analytics', async (req, res) => {
    try {
      const { query } = await import('../db.js');
      const { days = 30 } = req.query;

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - parseInt(days));

      const statusBreakdown = await query(
        `
      SELECT status, COUNT(*) as count
      FROM outreach_prospects
      WHERE created_at >= $1
      GROUP BY status
    `,
        [sinceDate.toISOString()]
      );

      const channelBreakdown = await query(
        `
      SELECT channel, COUNT(*) as count
      FROM outreach_prospects
      WHERE created_at >= $1
      GROUP BY channel
    `,
        [sinceDate.toISOString()]
      );

      const industryBreakdown = await query(
        `
      SELECT industry, COUNT(*) as count
      FROM outreach_prospects
      WHERE created_at >= $1
      AND industry IS NOT NULL
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 10
    `,
        [sinceDate.toISOString()]
      );

      const total = await query(
        'SELECT COUNT(*) as count FROM outreach_prospects WHERE created_at >= $1',
        [sinceDate.toISOString()]
      );
      const contacted = await query(
        "SELECT COUNT(*) as count FROM outreach_prospects WHERE status != 'new' AND created_at >= $1",
        [sinceDate.toISOString()]
      );
      const replied = await query(
        "SELECT COUNT(*) as count FROM outreach_prospects WHERE status = 'replied' AND created_at >= $1",
        [sinceDate.toISOString()]
      );
      const demoBooked = await query(
        "SELECT COUNT(*) as count FROM outreach_prospects WHERE status = 'demo_booked' AND created_at >= $1",
        [sinceDate.toISOString()]
      );
      const clients = await query(
        "SELECT COUNT(*) as count FROM outreach_prospects WHERE status = 'client' AND created_at >= $1",
        [sinceDate.toISOString()]
      );

      const responseRates = await query(
        `
      SELECT
        channel,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('replied', 'demo_booked', 'client')) as responded,
        ROUND(COUNT(*) FILTER (WHERE status IN ('replied', 'demo_booked', 'client'))::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as response_rate
      FROM outreach_prospects
      WHERE created_at >= $1
      AND channel IS NOT NULL
      GROUP BY channel
    `,
        [sinceDate.toISOString()]
      );

      res.json({
        ok: true,
        period: `Last ${days} days`,
        funnel: {
          total: parseInt(total.rows[0]?.count || 0),
          contacted: parseInt(contacted.rows[0]?.count || 0),
          replied: parseInt(replied.rows[0]?.count || 0),
          demoBooked: parseInt(demoBooked.rows[0]?.count || 0),
          clients: parseInt(clients.rows[0]?.count || 0)
        },
        statusBreakdown: statusBreakdown.rows,
        channelBreakdown: channelBreakdown.rows,
        industryBreakdown: industryBreakdown.rows,
        responseRates: responseRates.rows
      });
    } catch (error) {
      console.error('[OUTREACH ANALYTICS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

