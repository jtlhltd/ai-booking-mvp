import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const sendCriticalAlert = jest.fn(async () => {});

jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({ sendCriticalAlert }));

describe('connection-pool-monitor', () => {
  beforeEach(() => {
    jest.resetModules();
    sendCriticalAlert.mockReset();
  });

  test('getPoolStatus reports unavailable when pool missing', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ pool: null }));
    const { getPoolStatus } = await import('../../../lib/connection-pool-monitor.js');
    const s = await getPoolStatus();
    expect(s.available).toBe(false);
  });

  test('getPoolStatus reads pg pool counters', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      pool: {
        totalCount: 4,
        idleCount: 1,
        waitingCount: 0,
        options: { max: 15 }
      }
    }));
    const { getPoolStatus } = await import('../../../lib/connection-pool-monitor.js');
    const s = await getPoolStatus();
    expect(s.available).toBe(true);
    expect(s.max).toBe(15);
    expect(s.active).toBe(3);
  });

  test('checkPoolHealth emits warning when utilization high and queued', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      pool: {
        totalCount: 10,
        idleCount: 0,
        waitingCount: 2,
        options: { max: 10 }
      }
    }));
    const { checkPoolHealth } = await import('../../../lib/connection-pool-monitor.js');
    const h = await checkPoolHealth();
    expect(h.status.waiting).toBe(2);
    expect(h.alerts?.some((a) => a.level === 'warning')).toBe(true);
  });

  test('getPoolUsagePatterns returns metrics snapshot', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0, options: { max: 5 } }
    }));
    const { getPoolStatus, getPoolUsagePatterns } = await import('../../../lib/connection-pool-monitor.js');
    await getPoolStatus();
    const p = getPoolUsagePatterns();
    expect(p).toHaveProperty('total');
  });
});
