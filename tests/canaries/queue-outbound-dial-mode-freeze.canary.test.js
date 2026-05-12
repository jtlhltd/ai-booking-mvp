/**
 * Canary for Intent Contract: queue.outbound-dial-mode-freeze
 * intent: queue.outbound-dial-mode-freeze
 *
 * Dedupe on addToCallQueue must preserve or promote call_data.outboundDialMode
 * according to the locked truth table. It must never downgrade sequence to classic.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

function makePostgresDomain(initialRow) {
  const state = { row: { ...initialRow } };
  const query = jest.fn(async (sql, params = []) => {
    const s = String(sql);
    if (s.includes('opt_out_list')) return { rows: [] };
    if (s.includes('FROM call_queue') && s.includes('LIMIT 1')) {
      return {
        rows: [
          {
            id: state.row.id,
            scheduled_for: state.row.scheduled_for,
            priority: state.row.priority,
            call_data: state.row.call_data
          }
        ]
      };
    }
    if (s.includes('UPDATE call_queue SET scheduled_for')) {
      state.row.scheduled_for = params[0] instanceof Date ? params[0].toISOString() : params[0];
      state.row.priority = params[1];
      state.row.call_data = params[2] ? JSON.parse(params[2]) : null;
      return { rows: [] };
    }
    if (s.includes('SELECT * FROM call_queue WHERE id')) {
      return { rows: [{ ...state.row }] };
    }
    if (s.includes('INSERT INTO call_queue')) {
      throw new Error('should_dedupe_not_insert');
    }
    return { rows: [] };
  });

  return {
    query,
    state,
    domainFactory: async () => {
      const { createCallQueueDomain } = await import('../../db/domains/call-queue.js');
      return createCallQueueDomain({
        getDbType: () => 'postgres',
        getPool: () => ({}),
        getSqlite: () => null,
        query,
        phoneMatchKey: (p) => String(p || '').replace(/\D/g, ''),
        outboundDialClaimKeyFromRaw: (p) => String(p || '').replace(/\D/g, '') || '__nodigits__',
        smearCallQueueScheduledFor: (d) => d,
        pgQueueLeadPhoneKeyExpr: () => 'lead_phone',
        callQueueReads: { getPendingCalls: jest.fn(), getCallQueueByTenant: jest.fn(), getCallQueueByPhone: jest.fn() },
        callQueueWrites: { updateCallQueueStatus: jest.fn(), clearCallQueue: jest.fn() }
      });
    }
  };
}

function makeSqliteDomain(initialRow) {
  const state = { row: { ...initialRow } };
  const sqlite = {
    prepare: jest.fn((sql) => {
      const s = String(sql);
      if (s.includes('SELECT id, scheduled_for, priority, lead_phone, call_data FROM call_queue')) {
        return {
          all: () => [
            {
              id: state.row.id,
              scheduled_for: state.row.scheduled_for,
              priority: state.row.priority,
              lead_phone: state.row.lead_phone,
              call_data: state.row.call_data ? JSON.stringify(state.row.call_data) : null
            }
          ]
        };
      }
      if (s.includes('UPDATE call_queue SET scheduled_for = ?, priority = ?, call_data = ?')) {
        return {
          run: (scheduledFor, priority, callData) => {
            state.row.scheduled_for = scheduledFor;
            state.row.priority = priority;
            state.row.call_data = callData ? JSON.parse(callData) : null;
            return { changes: 1 };
          }
        };
      }
      if (s.includes('SELECT * FROM call_queue WHERE id = ?')) {
        return {
          get: () => ({ ...state.row, call_data: state.row.call_data ? JSON.stringify(state.row.call_data) : null })
        };
      }
      throw new Error(`unexpected sqlite SQL: ${s}`);
    })
  };
  const query = jest.fn(async (sql) => {
    if (String(sql).includes('opt_out_list')) return { rows: [] };
    return { rows: [] };
  });

  return {
    query,
    state,
    domainFactory: async () => {
      const { createCallQueueDomain } = await import('../../db/domains/call-queue.js');
      return createCallQueueDomain({
        getDbType: () => 'sqlite',
        getPool: () => null,
        getSqlite: () => sqlite,
        query,
        phoneMatchKey: (p) => String(p || '').replace(/\D/g, ''),
        outboundDialClaimKeyFromRaw: (p) => String(p || '').replace(/\D/g, '') || '__nodigits__',
        smearCallQueueScheduledFor: (d) => d,
        pgQueueLeadPhoneKeyExpr: () => 'lead_phone',
        callQueueReads: { getPendingCalls: jest.fn(), getCallQueueByTenant: jest.fn(), getCallQueueByPhone: jest.fn() },
        callQueueWrites: { updateCallQueueStatus: jest.fn(), clearCallQueue: jest.fn() }
      });
    }
  };
}

describe('canary: queue.outbound-dial-mode-freeze', () => {
  test('postgres dedupe promotes classic to sequence even when schedule/priority do not improve', async () => {
    const { domainFactory, query } = makePostgresDomain({
      id: 42,
      lead_phone: '+447700900500',
      scheduled_for: '2030-01-01T10:00:00.000Z',
      priority: 5,
      call_data: { triggerType: 'new_lead', outboundDialMode: 'classic' }
    });
    const domain = await domainFactory();

    const out = await domain.addToCallQueue({
      clientKey: 'ck',
      leadPhone: '07700 900 500',
      priority: 5,
      scheduledFor: new Date('2030-01-01T12:00:00.000Z'),
      callType: 'vapi_call',
      callData: { triggerType: 'sequence_next', outboundDialMode: 'sequence' }
    });

    expect(out.id).toBe(42);
    expect(out.call_data?.outboundDialMode).toBe('sequence');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('call_data = $3::jsonb'),
      expect.arrayContaining([expect.any(String)])
    );
  });

  test('postgres dedupe never downgrades sequence to classic', async () => {
    const { domainFactory } = makePostgresDomain({
      id: 43,
      lead_phone: '+447700900501',
      scheduled_for: '2030-01-01T10:00:00.000Z',
      priority: 5,
      call_data: { outboundDialMode: 'sequence' }
    });
    const domain = await domainFactory();

    const out = await domain.addToCallQueue({
      clientKey: 'ck',
      leadPhone: '+447700900501',
      priority: 5,
      scheduledFor: new Date('2030-01-01T12:00:00.000Z'),
      callType: 'vapi_call',
      callData: { outboundDialMode: 'classic' }
    });

    expect(out.call_data?.outboundDialMode).toBe('sequence');
  });

  test('sqlite dedupe promotes null to classic on the stored row', async () => {
    const { domainFactory } = makeSqliteDomain({
      id: 44,
      lead_phone: '+447700900502',
      scheduled_for: '2030-01-01T10:00:00.000Z',
      priority: 5,
      call_data: null
    });
    const domain = await domainFactory();

    const out = await domain.addToCallQueue({
      clientKey: 'ck',
      leadPhone: '+447700900502',
      priority: 5,
      scheduledFor: new Date('2030-01-01T12:00:00.000Z'),
      callType: 'vapi_call',
      callData: { outboundDialMode: 'classic' }
    });

    expect(JSON.parse(out.call_data).outboundDialMode).toBe('classic');
  });
});
