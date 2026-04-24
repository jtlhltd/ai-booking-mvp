import { query } from '../db.js';

export const leads = {
  async findByComposite(tenantId, phone, service) {
    const res = await query(
      `
      SELECT id, tenant_id, name, phone, service, source, status, attempts, sheet_row_id
      FROM leads
      WHERE tenant_id = $1 AND phone = $2 AND service = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [tenantId, phone, service],
    );
    return res.rows?.[0] || null;
  },

  async create(row) {
    const res = await query(
      `
      INSERT INTO leads (tenant_id, name, phone, service, source, status, attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, tenant_id, name, phone, service, source, status, attempts, sheet_row_id
    `,
      [
        row.tenant_id,
        row.name,
        row.phone,
        row.service,
        row.source ?? null,
        row.status ?? 'pending',
        row.attempts ?? 0,
      ],
    );
    return res.rows?.[0] || null;
  },

  async updateSheetRowId(leadId, sheetRowId) {
    await query(
      `
      UPDATE leads
      SET sheet_row_id = $1
      WHERE id = $2
    `,
      [sheetRowId, leadId],
    );
  },

  async findOpenByPhone(tenantId, phone) {
    const res = await query(
      `
      SELECT id, tenant_id, sheet_row_id
      FROM leads
      WHERE tenant_id = $1 AND phone = $2 AND status <> 'opted_out'
      ORDER BY created_at DESC
      LIMIT 50
    `,
      [tenantId, phone],
    );
    return res.rows || [];
  },

  async markOptedOut(leadId) {
    await query(
      `
      UPDATE leads
      SET status = 'opted_out'
      WHERE id = $1
    `,
      [leadId],
    );
  },
};

