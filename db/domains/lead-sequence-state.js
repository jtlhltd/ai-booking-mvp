/**
 * Persisted state for multi-stage outbound sequences (one row per client_key + lead_phone).
 */

export function createLeadSequenceStateDomain({ query, dbType }) {
  if (typeof query !== 'function') throw new Error('createLeadSequenceStateDomain requires query');

  const isPostgres = String(dbType || '').toLowerCase() === 'postgres';

  async function insertLeadSequenceState({
    clientKey,
    leadPhone,
    currentStageId
  }) {
    const phone = String(leadPhone || '').trim();
    const stage = String(currentStageId || '').trim();
    if (!clientKey || !phone || !stage) return { ok: false, error: 'missing_fields' };

    const nowIso = new Date().toISOString();
    const stagesJson = '[]';

    if (isPostgres) {
      await query(
        `
        INSERT INTO lead_sequence_state (
          client_key, lead_phone, current_stage_id, stages_completed,
          attempts_in_stage, attempts_total, started_at, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, 0, 0, $5::timestamptz, 'active', $5::timestamptz, $5::timestamptz)
        ON CONFLICT (client_key, lead_phone) DO NOTHING
      `,
        [clientKey, phone, stage, stagesJson, nowIso]
      );
    } else {
      await query(
        `
        INSERT INTO lead_sequence_state (
          client_key, lead_phone, current_stage_id, stages_completed,
          attempts_in_stage, attempts_total, started_at, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 0, 0, $5, 'active', $5, $5)
        ON CONFLICT(client_key, lead_phone) DO NOTHING
      `,
        [clientKey, phone, stage, stagesJson, nowIso]
      );
    }
    return { ok: true };
  }

  async function getLeadSequenceState(clientKey, leadPhone) {
    const phone = String(leadPhone || '').trim();
    if (!clientKey || !phone) return null;
    const { rows } = await query(
      `
      SELECT
        id,
        client_key AS "clientKey",
        lead_phone AS "leadPhone",
        current_stage_id AS "currentStageId",
        stages_completed AS "stagesCompleted",
        attempts_in_stage AS "attemptsInStage",
        attempts_total AS "attemptsTotal",
        started_at AS "startedAt",
        last_call_id AS "lastCallId",
        next_stage_scheduled_for AS "nextStageScheduledFor",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lead_sequence_state
      WHERE client_key = $1 AND lead_phone = $2
      LIMIT 1
    `,
      [clientKey, phone]
    );
    const r = rows[0];
    if (!r) return null;
    let stages = r.stagesCompleted;
    if (typeof stages === 'string') {
      try {
        stages = JSON.parse(stages);
      } catch {
        stages = [];
      }
    }
    if (!Array.isArray(stages)) stages = [];
    return { ...r, stagesCompleted: stages };
  }

  async function updateLeadSequenceState(clientKey, leadPhone, patch) {
    const phone = String(leadPhone || '').trim();
    if (!clientKey || !phone) return { ok: false };
    const p = patch || {};
    const row = await getLeadSequenceState(clientKey, phone);
    if (!row) return { ok: false, error: 'not_found' };

    const next = {
      currentStageId: p.currentStageId != null ? String(p.currentStageId) : row.currentStageId,
      stagesCompleted: p.stagesCompleted != null ? p.stagesCompleted : row.stagesCompleted,
      attemptsInStage: p.attemptsInStage != null ? Number(p.attemptsInStage) : row.attemptsInStage,
      attemptsTotal: p.attemptsTotal != null ? Number(p.attemptsTotal) : row.attemptsTotal,
      lastCallId: p.lastCallId != null ? p.lastCallId : row.lastCallId,
      nextStageScheduledFor: p.nextStageScheduledFor != null ? p.nextStageScheduledFor : row.nextStageScheduledFor,
      status: p.status != null ? String(p.status) : row.status
    };

    const stagesJson = JSON.stringify(next.stagesCompleted || []);
    const nowIso = new Date().toISOString();

    if (isPostgres) {
      await query(
        `
        UPDATE lead_sequence_state SET
          current_stage_id = $3,
          stages_completed = $4::jsonb,
          attempts_in_stage = $5,
          attempts_total = $6,
          last_call_id = $7,
          next_stage_scheduled_for = $8,
          status = $9,
          updated_at = $10::timestamptz
        WHERE client_key = $1 AND lead_phone = $2
      `,
        [
          clientKey,
          phone,
          next.currentStageId,
          stagesJson,
          next.attemptsInStage,
          next.attemptsTotal,
          next.lastCallId || null,
          next.nextStageScheduledFor || null,
          next.status,
          nowIso
        ]
      );
    } else {
      await query(
        `
        UPDATE lead_sequence_state SET
          current_stage_id = $3,
          stages_completed = $4,
          attempts_in_stage = $5,
          attempts_total = $6,
          last_call_id = $7,
          next_stage_scheduled_for = $8,
          status = $9,
          updated_at = $10
        WHERE client_key = $1 AND lead_phone = $2
      `,
        [
          clientKey,
          phone,
          next.currentStageId,
          stagesJson,
          next.attemptsInStage,
          next.attemptsTotal,
          next.lastCallId || null,
          next.nextStageScheduledFor || null,
          next.status,
          nowIso
        ]
      );
    }
    return { ok: true };
  }

  return {
    insertLeadSequenceState,
    getLeadSequenceState,
    updateLeadSequenceState
  };
}
