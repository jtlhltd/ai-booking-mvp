let initPromise = null;

export function initBrowserSentry() {
  if (initPromise) return initPromise;

  initPromise = fetch('/api/public/sentry-config', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then(async (config) => {
      if (!config?.dsn) return;
      const Sentry = await import('@sentry/browser');
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        tracesSampleRate: config.tracesSampleRate,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
        ],
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: config.replaysOnErrorSampleRate ?? 1.0,
        tracePropagationTargets: [window.location.origin],
        initialScope: {
          tags: {
            app: config.app,
            runtime: 'browser',
          },
        },
      });
    })
    .catch(() => {});

  return initPromise;
}
