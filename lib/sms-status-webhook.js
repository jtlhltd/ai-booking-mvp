/**
 * Twilio SMS status callback + test mirror (extracted from server.js).
 */
export async function handleSmsStatusWebhook(req, res, deps) {
  const { query, readJson, writeJson, smsStatusPath } = deps || {};

  try {
    const messageSid = req.body.MessageSid;
    const status = req.body.MessageStatus;
    const to = req.body.To;
    const from = req.body.From;
    const errorCode = req.body.ErrorCode || null;

    console.log('[SMS STATUS WEBHOOK] Received status update:', { messageSid, status, to, errorCode });

    if (messageSid) {
      const updateResult = await query(
        `
        UPDATE messages 
        SET status = $1, updated_at = NOW()
        WHERE provider_sid = $2
        RETURNING id, client_key, to_phone
      `,
        [status, messageSid]
      );

      if (updateResult.rows.length > 0) {
        console.log('[SMS STATUS WEBHOOK] ✅ Updated message in database:', updateResult.rows[0]);
      } else {
        console.log('[SMS STATUS WEBHOOK] ⚠️ Message SID not found in database:', messageSid);
      }

      if (status === 'failed' || errorCode) {
        console.error('[SMS DELIVERY FAILED]', { messageSid, to, status, errorCode });

        if (process.env.YOUR_EMAIL) {
          try {
            const messagingService = (await import('./messaging-service.js')).default;
            await messagingService.sendEmail({
              to: process.env.YOUR_EMAIL,
              subject: `⚠️ SMS Delivery Failed - ${to}`,
              body: `SMS delivery failed for ${to}\n\nStatus: ${status}\nError Code: ${errorCode || 'N/A'}\nMessage SID: ${messageSid}\nTime: ${new Date().toISOString()}`,
            });
            console.log('[SMS STATUS WEBHOOK] ✅ Email alert sent');
          } catch (emailError) {
            console.error('[SMS STATUS WEBHOOK] Failed to send email alert:', emailError.message);
          }
        }
      }
    }

    const rows = await readJson(smsStatusPath, []);
    rows.push({
      evt: 'sms.status',
      rid: req.id,
      at: new Date().toISOString(),
      sid: messageSid,
      status,
      to,
      from,
      messagingServiceSid: req.body.MessagingServiceSid || null,
      errorCode,
    });
    await writeJson(smsStatusPath, rows);

    res.type('text/plain').send('OK');
  } catch (error) {
    console.error('[SMS STATUS WEBHOOK ERROR]', error);
    res.type('text/plain').send('OK');
  }
}
