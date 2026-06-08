import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();
if (!dsn) {
  // No-op when unset — local dev and CI stay unchanged.
} else {
  const environment =
    process.env.SENTRY_ENVIRONMENT?.trim()
    || process.env.NODE_ENV
    || (process.env.RENDER === 'true' ? 'production' : 'development');

  const parsedSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  const tracesSampleRate = Number.isFinite(parsedSampleRate)
    ? parsedSampleRate
    : (environment === 'production' ? 0.1 : 1.0);

  const release =
    process.env.SENTRY_RELEASE?.trim()
    || process.env.RENDER_GIT_COMMIT?.trim()
    || undefined;

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    initialScope: {
      tags: {
        app: process.env.APP_NAME?.trim() || 'ai-booking-mvp',
      },
    },
  });
  console.log('[SENTRY] initialized', {
    environment,
    app: process.env.APP_NAME?.trim() || 'ai-booking-mvp',
  });
}
