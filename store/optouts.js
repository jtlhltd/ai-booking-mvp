import { query } from '../db.js';

export const optouts = {
  async upsert(tenantId, phone) {
    await query(
      `
      INSERT INTO optouts (tenant_id, phone)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id, phone) DO NOTHING
    `,
      [tenantId, phone],
    );
  },
};

