/**
 * Browser Sentry for static HTML pages (client-dashboard, etc.).
 * Loads config from /api/public/sentry-config so DSN stays server-managed.
 */
(function initSentryBrowser() {
  fetch('/api/public/sentry-config', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((config) => {
      if (!config?.dsn) return;

      const script = document.createElement('script');
      script.src = 'https://browser.sentry-cdn.com/10.56.0/bundle.tracing.replay.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        window.Sentry.init({
          dsn: config.dsn,
          environment: config.environment,
          tracesSampleRate: config.tracesSampleRate,
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
      };
      document.head.appendChild(script);
    })
    .catch(() => {});
})();
