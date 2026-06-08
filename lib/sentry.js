import * as Sentry from '@sentry/node';

const TAG_KEYS = new Set([
  'client_key',
  'correlation_id',
  'call_id',
  'event_id',
  'stage_id',
  'job_id',
  'cron_name',
  'event_type',
  'app',
]);

function normalizeTagKey(key) {
  return String(key).replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

export function isSentryEnabled() {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

export function applySpanAttributes(span, attributes = {}) {
  if (!span) return;
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || value === '') continue;
    const tagKey = normalizeTagKey(key);
    span.setAttribute(tagKey, value);
    if (TAG_KEYS.has(tagKey) && typeof span.setTag === 'function') {
      span.setTag(tagKey, String(value));
    }
  }
}

function buildSpanOptions({ name, op, attributes }) {
  return {
    name,
    op: op || 'function',
    attributes: Object.fromEntries(
      Object.entries(attributes || {}).filter(([, v]) => v != null && v !== '')
    ),
  };
}

export async function startSpan({ name, op, attributes }, fn) {
  if (!isSentryEnabled()) {
    return fn();
  }
  return Sentry.startSpan(buildSpanOptions({ name, op, attributes }), async (span) => {
    applySpanAttributes(span, attributes);
    return fn(span);
  });
}

export function startSpanSync({ name, op, attributes }, fn) {
  if (!isSentryEnabled()) {
    return fn();
  }
  return Sentry.startSpan(buildSpanOptions({ name, op, attributes }), (span) => {
    applySpanAttributes(span, attributes);
    return fn(span);
  });
}

/** Fire-and-forget work detached from the HTTP request span (e.g. Vapi post-200). */
export function runIsolatedSpan({ name, op, attributes }, fn) {
  if (!isSentryEnabled()) {
    void Promise.resolve().then(fn);
    return;
  }
  Sentry.withIsolationScope(() => {
    void startSpan({ name, op, attributes }, fn);
  });
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
