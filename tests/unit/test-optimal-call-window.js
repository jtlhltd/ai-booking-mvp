// tests/unit/test-optimal-call-window.js

import { scheduleAtOptimalCallWindow } from '../../lib/optimal-call-window.js';
import { describe, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

const tenant = {
  timezone: 'Europe/London',
  businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] }
};

describe('Optimal call window', () => {});

(async () => {
  const base1 = new Date('2026-04-02T10:00:00.000Z');
  const out1 = await scheduleAtOptimalCallWindow(tenant, null, base1, {
    fallbackTz: 'Europe/London',
    banditArms: {}
  });
  assertTrue(out1.getTime() === base1.getTime(), 'unchanged when no routing');

  const routing2 = {
    recommendations: {
      bestHours: [{ hour: 14, label: '14:00', attempts: 3 }],
      bestWeekdays: []
    }
  };
  const base2 = new Date('2026-04-02T10:00:00.000Z');
  process.env.CALL_TIME_THOMPSON = '0';
  const out2 = await scheduleAtOptimalCallWindow(tenant, routing2, base2, {
    fallbackTz: 'Europe/London',
    banditArms: {}
  });
  assertTrue(out2.getTime() === base2.getTime(), 'no score means no heuristic nudge');
  delete process.env.CALL_TIME_THOMPSON;

  const routing3 = {
    recommendations: {
      bestHours: [
        { hour: 11, label: '11:00', score: 90, attempts: 20 },
        { hour: 10, label: '10:00', score: 40, attempts: 20 }
      ],
      bestWeekdays: []
    }
  };
  const prevDelay = process.env.OPTIMAL_CALL_MAX_DELAY_MS;
  process.env.OPTIMAL_CALL_SCHEDULING = '1';
  process.env.CALL_TIME_THOMPSON = '0';
  process.env.OPTIMAL_CALL_MAX_DELAY_MS = String(4 * 60 * 60 * 1000);
  try {
    const base3 = new Date('2026-04-02T08:00:00.000Z');
    const out3 = await scheduleAtOptimalCallWindow(tenant, routing3, base3, {
      fallbackTz: 'Europe/London',
      banditArms: {}
    });
    assertTrue(out3.getTime() > base3.getTime(), 'heuristic nudge scheduled later');
    assertTrue(out3.getTime() <= base3.getTime() + 5 * 60 * 60 * 1000, 'within slack');
  } finally {
    if (prevDelay === undefined) delete process.env.OPTIMAL_CALL_MAX_DELAY_MS;
    else process.env.OPTIMAL_CALL_MAX_DELAY_MS = prevDelay;
    delete process.env.CALL_TIME_THOMPSON;
  }

  process.exit(printSummary());
})().catch(err => {
  console.error(err);
  process.exit(1);
});
