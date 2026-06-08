import 'dotenv/config';
import * as Sentry from '@sentry/node';
import {
  isLowValueTraceTarget,
  resolveSentryEnvironment,
  resolveSentryTracesSampleRate,
} from './lib/sentry-config.js';

const dsn = process.env.SENTRY_DSN?.trim();
if (!dsn) {
  // No-op when unset — local dev and CI stay unchanged.
} else {
  const environment = resolveSentryEnvironment(process.env);
  const tracesSampleRate = resolveSentryTracesSampleRate({
    envValue: process.env.SENTRY_TRACES_SAMPLE_RATE,
    environment,
  });

  const release =
    process.env.SENTRY_RELEASE?.trim()
    || process.env.RENDER_GIT_COMMIT?.trim()
    || undefined;

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    tracesSampler: ({ name, inheritOrSampleWith }) => {
      if (isLowValueTraceTarget(name)) return 0;
      return inheritOrSampleWith(tracesSampleRate);
    },
    initialScope: {
      tags: {
        app: process.env.APP_NAME?.trim() || 'ai-booking-mvp',
      },
    },
  });
  console.log('[SENTRY] initialized', {
    environment,
    tracesSampleRate,
    app: process.env.APP_NAME?.trim() || 'ai-booking-mvp',
  });
}
