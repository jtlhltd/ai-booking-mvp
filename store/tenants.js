import { query } from '../db.js';

export const tenants = {
  async findByKey(clientKey) {
    const res = await query(
      `
      SELECT id, client_key AS key, display_name AS name, gsheet_id, vapi_assistant_id AS "vapiAssistantId", vapi_phone_number_id AS "vapiPhoneNumberId"
      FROM tenants
      WHERE client_key = $1
      LIMIT 1
    `,
      [clientKey],
    );
    return res.rows?.[0] || null;
  },
};

