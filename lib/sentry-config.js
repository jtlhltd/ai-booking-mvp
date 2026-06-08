/**
 * Shared Sentry bootstrap helpers (instrument.mjs + tests).
 */

export function resolveSentryEnvironment(env = process.env) {
  return (
    env.SENTRY_ENVIRONMENT?.trim()
    || env.NODE_ENV
    || (env.RENDER === 'true' ? 'production' : 'development')
  );
}

/**
 * Parse SENTRY_TRACES_SAMPLE_RATE without treating an empty env var as 0.
 * Number('') === 0, which would enable tracing machinery but drop every span.
 */
export function resolveSentryTracesSampleRate({ envValue, environment }) {
  const raw = typeof envValue === 'string' ? envValue.trim() : '';
  if (raw === '') {
    return environment === 'production' ? 0.1 : 1.0;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.warn('[SENTRY] Invalid SENTRY_TRACES_SAMPLE_RATE; using default', { raw });
    return environment === 'production' ? 0.1 : 1.0;
  }

  return parsed;
}
