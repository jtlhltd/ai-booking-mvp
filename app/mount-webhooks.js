/**
 * Webhook-related mounting helpers.
 *
 * Goal: keep `server.js` smaller while preserving exact behavior.
 * - Body parsers for webhook endpoints must be registered before handlers.
 * - Certain webhook paths bypass the API key guard.
 */
 
const webhookBypassPrefixes = [
  '/webhooks/twilio-status',
  '/webhooks/twilio-inbound',
  '/webhooks/twilio/sms-inbound',
  '/webhooks/twilio-voice',
  '/webhooks/vapi',
  '/webhooks/sentry-self-heal',
];
 
const webhookBypassExact = new Set([
  '/webhook/sms-reply',
  '/webhooks/sms',
]);
 
export function isWebhookBypassPath(reqPath) {
  if (!reqPath) return false;
  if (webhookBypassExact.has(reqPath)) return true;
  return webhookBypassPrefixes.some((p) => reqPath.startsWith(p));
}
 
export function mountWebhookBodyParsers(app, { express }) {
  if (!app) throw new Error('mountWebhookBodyParsers requires app');
  if (!express?.urlencoded) throw new Error('mountWebhookBodyParsers requires express.urlencoded');
 
  // NOTE: keep these mounts identical to the legacy server.js behavior.
  app.use('/webhooks/twilio-status', express.urlencoded({ extended: false }));
  app.use('/webhooks/twilio-inbound', express.urlencoded({ extended: false }));
  app.use('/webhook/sms-reply', express.urlencoded({ extended: false }));
}

