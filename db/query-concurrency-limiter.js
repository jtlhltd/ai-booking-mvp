/**
 * Serialize excess load so small Postgres tiers are not hit by many parallel workers/webhooks at once.
 * Returns a limiter with an async `run(fn)` method.
 * @param {number} maxConcurrent
 */
export function createQueryConcurrencyLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  return {
    maxConcurrent,
    async run(fn) {
      if (active >= maxConcurrent) {
        await new Promise((resolve) => queue.push(resolve));
      }
      active++;
      try {
        return await fn();
      } finally {
        active--;
        const next = queue.shift();
        if (next) next();
      }
    }
  };
}

