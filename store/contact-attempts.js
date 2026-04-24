import { query } from '../db.js';

export const contactAttempts = {
  async log({ tenant_id, lead_id, channel, direction, status, detail }) {
    await query(
      `
      INSERT INTO contact_attempts (tenant_id, lead_id, channel, direction, status, detail)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [tenant_id, lead_id, channel, direction, status, detail],
    );
  },
};

