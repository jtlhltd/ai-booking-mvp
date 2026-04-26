import express from 'express';

/**
 * Notify SMS API + Twilio delivery status + Twilio inbound SMS (same middleware order as legacy server.js).
 */
export function createNotifyAndTwilioSmsRouter(deps) {
  const {
    notifySendDeps,
    smsStatusWebhookDeps,
    twilioSmsInboundDeps,
    handleNotifyTest,
    handleNotifySend,
    handleSmsStatusWebhook,
    handleTwilioSmsInbound,
    twilioWebhookVerification,
    smsRateLimit,
    safeAsync
  } = deps || {};

  const router = express.Router();

  console.log('🟢🟢🟢 [NOTIFY-ROUTES] ABOUT TO REGISTER ROUTES...');
  router.post('/api/notify/test', handleNotifyTest);
  console.log('🟢🟢🟢 [NOTIFY-ROUTES] REGISTERED: POST /api/notify/test');

  router.post('/api/notify/send', (req, res) => handleNotifySend(req, res, notifySendDeps));
  console.log('🟢🟢🟢 [NOTIFY-ROUTES] REGISTERED: POST /api/notify/send');
  router.post('/api/notify/send/:param', (req, res) => handleNotifySend(req, res, notifySendDeps));
  console.log('🟢🟢🟢 [NOTIFY-ROUTES] REGISTERED: POST /api/notify/send/:param');

  router.post(
    '/webhooks/twilio-status',
    express.urlencoded({ extended: false }),
    twilioWebhookVerification,
    (req, res) => handleSmsStatusWebhook(req, res, smsStatusWebhookDeps)
  );

  router.post(
    '/webhooks/twilio-inbound',
    express.urlencoded({ extended: false }),
    twilioWebhookVerification,
    smsRateLimit,
    safeAsync((req, res) => handleTwilioSmsInbound(req, res, twilioSmsInboundDeps))
  );

  return router;
}
