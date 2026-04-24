import { query } from '../db.js';

export const twilio = {
  /**
   * Resolve a tenant from Twilio inbound message fields.
   * Returns { id, gsheet_id } or null.
   */
  async mapToTenant(messagingServiceSid, toPhone) {
    // Prefer MessagingServiceSid mapping; fall back to inbound To mapping if present.
    const res = await query(
      `
      SELECT id, gsheet_id
      FROM tenants
      WHERE ($1::text IS NOT NULL AND twilio_messaging_service_sid = $1)
         OR ($2::text IS NOT NULL AND twilio_to_number = $2)
      ORDER BY id ASC
      LIMIT 1
    `,
      [messagingServiceSid || null, toPhone || null],
    );
    return res.rows?.[0] || null;
  },
};

