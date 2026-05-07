import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('db/domains/lead-sequence-state', () => {
  test('insertLeadSequenceState writes ON CONFLICT DO NOTHING (postgres)', async () => {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [] };
    });
    const { createLeadSequenceStateDomain } = await import('../../../db/domains/lead-sequence-state.js');
    const domain = createLeadSequenceStateDomain({ query, dbType: 'postgres' });
    const out = await domain.insertLeadSequenceState({
      clientKey: 'ck',
      leadPhone: '+447700900111',
      currentStageId: 's1'
    });
    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/INSERT INTO lead_sequence_state/);
    expect(calls[0].sql).toMatch(/ON CONFLICT \(client_key, lead_phone\) DO NOTHING/);
    expect(calls[0].params[0]).toBe('ck');
    expect(calls[0].params[1]).toBe('+447700900111');
    expect(calls[0].params[2]).toBe('s1');
  });

  test('insertLeadSequenceState rejects missing fields', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createLeadSequenceStateDomain } = await import('../../../db/domains/lead-sequence-state.js');
    const domain = createLeadSequenceStateDomain({ query, dbType: 'postgres' });
    expect(await domain.insertLeadSequenceState({ clientKey: '', leadPhone: '+1', currentStageId: 's' })).toEqual({
      ok: false,
      error: 'missing_fields'
    });
    expect(query).not.toHaveBeenCalled();
  });

  test('getLeadSequenceState parses stages_completed string into array', async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          id: 1,
          clientKey: 'ck',
          leadPhone: '+447700900111',
          currentStageId: 's2',
          stagesCompleted: '[{"stageId":"s1"}]',
          attemptsInStage: 0,
          attemptsTotal: 1,
          startedAt: new Date().toISOString(),
          status: 'active'
        }
      ]
    }));
    const { createLeadSequenceStateDomain } = await import('../../../db/domains/lead-sequence-state.js');
    const domain = createLeadSequenceStateDomain({ query, dbType: 'postgres' });
    const row = await domain.getLeadSequenceState('ck', '+447700900111');
    expect(Array.isArray(row.stagesCompleted)).toBe(true);
    expect(row.stagesCompleted[0].stageId).toBe('s1');
  });

  test('updateLeadSequenceState merges patch over existing row', async () => {
    const existing = {
      id: 1,
      clientKey: 'ck',
      leadPhone: '+447700900111',
      currentStageId: 's1',
      stagesCompleted: [],
      attemptsInStage: 0,
      attemptsTotal: 0,
      startedAt: new Date().toISOString(),
      status: 'active'
    };
    const calls = [];
    const query = jest.fn(async (sql, params) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (s.includes('SELECT')) return { rows: [existing] };
      return { rows: [] };
    });
    const { createLeadSequenceStateDomain } = await import('../../../db/domains/lead-sequence-state.js');
    const domain = createLeadSequenceStateDomain({ query, dbType: 'postgres' });
    const out = await domain.updateLeadSequenceState('ck', '+447700900111', {
      currentStageId: 's2',
      attemptsInStage: 0,
      attemptsTotal: 1,
      stagesCompleted: [{ stageId: 's1' }]
    });
    expect(out).toEqual({ ok: true });
    const upd = calls.find((c) => c.sql.includes('UPDATE lead_sequence_state'));
    expect(upd).toBeTruthy();
    expect(upd.params[0]).toBe('ck');
    expect(upd.params[2]).toBe('s2');
    expect(JSON.parse(upd.params[3])[0].stageId).toBe('s1');
  });

  test('updateLeadSequenceState returns not_found when row missing', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createLeadSequenceStateDomain } = await import('../../../db/domains/lead-sequence-state.js');
    const domain = createLeadSequenceStateDomain({ query, dbType: 'postgres' });
    const out = await domain.updateLeadSequenceState('ck', '+447700900111', { status: 'abandoned' });
    expect(out).toEqual({ ok: false, error: 'not_found' });
  });
});
