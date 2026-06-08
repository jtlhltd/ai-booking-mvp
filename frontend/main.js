import { initBrowserSentry } from './shared/sentry.js';

initBrowserSentry();
document.getElementById('app')?.append('Frontend build pipeline is installed.');

