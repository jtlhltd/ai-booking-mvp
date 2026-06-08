import * as Sentry from '@sentry/node';

export function isSentryEnabled() {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

export function captureException(error, context = {}) {
  if (!isSentryEnabled() || error == null) return;

  Sentry.withScope((scope) => {
    if (context.clientKey) scope.setTag('client_key', String(context.clientKey));
    if (context.service) scope.setTag('service', String(context.service));
    for (const [key, value] of Object.entries(context)) {
      if (key === 'clientKey' || key === 'service') continue;
      scope.setExtra(key, value);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err);
  });
}

export function captureMessage(message, context = {}) {
  if (!isSentryEnabled() || !message) return;

  Sentry.withScope((scope) => {
    if (context.clientKey) scope.setTag('client_key', String(context.clientKey));
    if (context.service) scope.setTag('service', String(context.service));
    const { level = 'error', clientKey, service, ...extra } = context;
    for (const [key, value] of Object.entries(extra)) {
      scope.setExtra(key, value);
    }
    Sentry.captureMessage(String(message), level);
  });
}

export function setupSentryExpressErrorHandler(app) {
  if (!isSentryEnabled() || !app) return;
  Sentry.setupExpressErrorHandler(app);
}
