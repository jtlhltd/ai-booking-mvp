export function createOptOutDomain({ dbType, query, normalizePhoneE164, invalidateOptOutDialCache }) {
  async function listOptOutList({ clientKey, q = '', activeOnly = true, limit = 100, offset = 0 } = {}) {
    const ck = String(clientKey || '').trim();
    if (!ck) {
      const err = new Error('client_key_required');
      err.code = 'client_key_required';
      throw err;
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const qq = String(q || '').trim();
    const where = [];
    const params = [];

    params.push(ck);
    where.push(`client_key = $${params.length}`);
    if (activeOnly) where.push(dbType === 'sqlite' ? `active = 1` : `active = TRUE`);
    if (qq) {
      params.push(`%${qq}%`);
      where.push(dbType === 'postgres' ? `phone ILIKE $${params.length}` : `phone LIKE $${params.length}`);
    }

    params.push(safeLimit);
    params.push(safeOffset);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
      SELECT id, phone, reason, notes, active, opted_out_at, updated_at
      FROM opt_out_list
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const result = await query(sql, params);
    return result.rows || [];
  }

  async function upsertOptOut({ clientKey, phone, reason = 'user_request', notes = null } = {}) {
    const ck = String(clientKey || '').trim();
    if (!ck) {
      const err = new Error('client_key_required');
      err.code = 'client_key_required';
      throw err;
    }
    const raw = String(phone || '').trim();
    const normalized = normalizePhoneE164(raw, 'GB') || raw;
    if (!normalized || !/^\+\d{7,15}$/.test(normalized)) {
      const err = new Error('invalid_phone');
      err.code = 'invalid_phone';
      throw err;
    }
    const r = String(reason || '').trim() || 'user_request';
    const n = notes == null ? null : String(notes).trim();

    await query(
      `
      INSERT INTO opt_out_list (client_key, phone, reason, notes, opted_out_at, active, updated_at)
      VALUES ($1, $2, $3, $4, ${dbType === 'sqlite' ? "datetime('now')" : 'NOW()'}, ${
        dbType === 'sqlite' ? 1 : 'TRUE'
      }, ${dbType === 'sqlite' ? "datetime('now')" : 'NOW()'})
      ON CONFLICT (client_key, phone)
      DO UPDATE SET active = ${dbType === 'sqlite' ? 1 : 'TRUE'}, reason = $3, notes = $4, opted_out_at = ${
        dbType === 'sqlite' ? "datetime('now')" : 'NOW()'
      }, updated_at = ${dbType === 'sqlite' ? "datetime('now')" : 'NOW()'}
      `,
      [ck, normalized, r, n]
    );
    invalidateOptOutDialCache();
    return { phone: normalized };
  }

  async function deactivateOptOut({ clientKey, phone } = {}) {
    const ck = String(clientKey || '').trim();
    if (!ck) {
      const err = new Error('client_key_required');
      err.code = 'client_key_required';
      throw err;
    }
    const raw = String(phone || '').trim();
    const normalized = normalizePhoneE164(raw, 'GB') || raw;
    if (!normalized || !/^\+\d{7,15}$/.test(normalized)) {
      const err = new Error('invalid_phone');
      err.code = 'invalid_phone';
      throw err;
    }
    await query(
      `
      UPDATE opt_out_list
      SET active = ${dbType === 'sqlite' ? 0 : 'FALSE'}, updated_at = ${dbType === 'sqlite' ? "datetime('now')" : 'NOW()'}
      WHERE client_key = $1 AND phone = $2
      `,
      [ck, normalized]
    );
    invalidateOptOutDialCache();
    return { phone: normalized };
  }

  return { listOptOutList, upsertOptOut, deactivateOptOut };
}

