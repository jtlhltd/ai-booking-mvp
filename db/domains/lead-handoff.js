export function createLeadHandoffDomain({ query, phoneMatchKey, dbType }) {
  if (typeof query !== 'function') throw new Error('createLeadHandoffDomain requires query');
  if (typeof phoneMatchKey !== 'function') throw new Error('createLeadHandoffDomain requires phoneMatchKey');

  function pickText(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return '';
  }

  async function upsertLeadHandoff({
    clientKey,
    leadPhone,
    callId = null,
    source = 'unknown',
    data = {},
    summaryText = '',
    decisionMaker = '',
    callbackWindow = '',
  }) {
    const phone = String(leadPhone || '').trim();
    const matchKey = phoneMatchKey(phone);
    if (!clientKey) throw new Error('upsertLeadHandoff requires clientKey');
    if (!matchKey) throw new Error('upsertLeadHandoff requires leadPhone (E164 preferred)');

    const decision = decisionMaker || pickText(data, ['decisionMaker', 'Decision Maker', 'Contact Person', 'Manager']);
    const callback = callbackWindow || pickText(data, ['callbackWindow', 'Callback Window', 'preferredTime', 'Preferred Time']);
    const summary = summaryText || pickText(data, ['transcriptSnippet', 'Transcript Snippet', 'notes', 'Notes']);
    const json = JSON.stringify(data || {});

    const isPostgres = String(dbType || '').toLowerCase() === 'postgres';
    const dataValue = isPostgres ? `${'$'}9::jsonb` : '$9';

    const updatedAtIso = new Date().toISOString();
    await query(
      `
      INSERT INTO lead_handoff (
        client_key,
        phone_match_key,
        lead_phone,
        call_id,
        source,
        decision_maker,
        callback_window,
        summary_text,
        data_json,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${dataValue},$10)
      ON CONFLICT (client_key, phone_match_key)
      DO UPDATE SET
        lead_phone = COALESCE(EXCLUDED.lead_phone, lead_handoff.lead_phone),
        call_id = COALESCE(EXCLUDED.call_id, lead_handoff.call_id),
        source = EXCLUDED.source,
        decision_maker = CASE WHEN COALESCE(EXCLUDED.decision_maker,'') <> '' THEN EXCLUDED.decision_maker ELSE lead_handoff.decision_maker END,
        callback_window = CASE WHEN COALESCE(EXCLUDED.callback_window,'') <> '' THEN EXCLUDED.callback_window ELSE lead_handoff.callback_window END,
        summary_text = CASE WHEN COALESCE(EXCLUDED.summary_text,'') <> '' THEN EXCLUDED.summary_text ELSE lead_handoff.summary_text END,
        data_json = EXCLUDED.data_json,
        updated_at = EXCLUDED.updated_at
    `,
      [clientKey, matchKey, phone || null, callId, source, decision || null, callback || null, summary || null, json, updatedAtIso]
    );
  }

  async function getLeadHandoffByPhone({ clientKey, leadPhone }) {
    const phone = String(leadPhone || '').trim();
    const matchKey = phoneMatchKey(phone);
    if (!matchKey) return null;
    const { rows } = await query(
      `
      SELECT
        client_key AS "clientKey",
        phone_match_key AS "phoneMatchKey",
        lead_phone AS "leadPhone",
        call_id AS "callId",
        source,
        decision_maker AS "decisionMaker",
        callback_window AS "callbackWindow",
        summary_text AS "summaryText",
        data_json AS "dataJson",
        operator_notes AS "operatorNotes",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lead_handoff
      WHERE client_key = $1 AND phone_match_key = $2
      LIMIT 1
    `,
      [clientKey, matchKey]
    );
    return rows?.[0] || null;
  }

  async function listLeadHandoff({ clientKey, limit = 100, offset = 0 }) {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const { rows } = await query(
      `
      SELECT
        client_key AS "clientKey",
        phone_match_key AS "phoneMatchKey",
        lead_phone AS "leadPhone",
        call_id AS "callId",
        source,
        decision_maker AS "decisionMaker",
        callback_window AS "callbackWindow",
        summary_text AS "summaryText",
        data_json AS "dataJson",
        operator_notes AS "operatorNotes",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lead_handoff
      WHERE client_key = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3
    `,
      [clientKey, safeLimit, safeOffset]
    );
    return rows || [];
  }

  async function setOperatorNotes({ clientKey, leadPhone, operatorNotes }) {
    const phone = String(leadPhone || '').trim();
    const matchKey = phoneMatchKey(phone);
    if (!matchKey) throw new Error('setOperatorNotes requires leadPhone');
    const updatedAtIso = new Date().toISOString();
    await query(
      `
      UPDATE lead_handoff
      SET operator_notes = $3, updated_at = $4
      WHERE client_key = $1 AND phone_match_key = $2
    `,
      [clientKey, matchKey, String(operatorNotes || '').slice(0, 20000), updatedAtIso]
    );
  }

  return {
    upsertLeadHandoff,
    getLeadHandoffByPhone,
    listLeadHandoff,
    setOperatorNotes,
  };
}

