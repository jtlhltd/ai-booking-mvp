import { describe, test, expect } from '@jest/globals';

import { createQueryConcurrencyLimiter } from '../../db/query-concurrency-limiter.js';

describe('db/query-concurrency-limiter', () => {
  test('run() enforces max concurrency', async () => {
    const limiter = createQueryConcurrencyLimiter(1);
    let active = 0;
    let maxSeen = 0;

    const makeTask = () =>
      limiter.run(async () => {
        active += 1;
        maxSeen = Math.max(maxSeen, active);
        await new Promise((r) => setTimeout(r, 25));
        active -= 1;
      });

    await Promise.all([makeTask(), makeTask(), makeTask()]);
    expect(maxSeen).toBe(1);
  });
});

