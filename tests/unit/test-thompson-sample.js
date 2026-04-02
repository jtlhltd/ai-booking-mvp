// tests/unit/test-thompson-sample.js

import { sampleBeta } from '../../lib/thompson-sample.js';
import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Thompson sample', () => {
  test('Beta samples stay in (0,1)', () => {
    for (let i = 0; i < 40; i++) {
      const s = sampleBeta(2, 5);
      assertTrue(s > 0 && s < 1, `in range ${s}`);
    }
  });

  test('symmetric prior clusters near 0.5', () => {
    let sum = 0;
    const n = 200;
    for (let i = 0; i < n; i++) sum += sampleBeta(2, 2);
    const mean = sum / n;
    assertTrue(mean > 0.35 && mean < 0.65, `mean ~0.5 got ${mean}`);
  });
});

process.exit(printSummary());
