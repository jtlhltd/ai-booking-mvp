import { Router } from 'express';

export function createToolsRouter(deps) {
  const { store, sheets, sendOperatorAlert, messagingService } = deps || {};

  const router = Router();

  router.post('/tools/access_google_sheet', async (req, res) => {
    try {
      console.log('[GOOGLE SHEET TOOL] Request received:', JSON.stringify(req.body, null, 2));

      // Handle VAPI's tool call format: { message: { toolCallList: [{ function: { arguments: {...} } }] } }
      // OR direct format: { action: "...", data: {...}, tenantKey: "..." }
      let action, data, tenantKey, toolCallId, callId;

      // Check for VAPI's message format first
      if (req.body.message?.toolCallList?.[0]) {
        const toolCall = req.body.message.toolCallList[0];
        toolCallId = toolCall.id;
        // Extract callId from message.call.id (available during the call)
        callId = req.body.message?.call?.id || req.body.callId || '';
        const args =
          typeof toolCall.function?.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function?.arguments || {};
        action = args.action || 'append';
        data = args.data || args; // If no 'data' key, use args directly
        tenantKey = args.tenantKey || req.body.message?.call?.assistantId || '';
        console.log('[GOOGLE SHEET TOOL] Extracted from VAPI message format:', {
          action,
          hasData: !!data,
          tenantKey,
          toolCallId,
          callId,
        });
      }
      // Check for VAPI's direct function format
      else if (req.body.function && req.body.function.arguments) {
        toolCallId = req.body.toolCallId || req.body.id;
        callId = req.body.callId || req.body.message?.call?.id || '';
        const args =
          typeof req.body.function.arguments === 'string' ? JSON.parse(req.body.function.arguments) : req.body.function.arguments;
        action = args.action || 'append';
        data = args.data || args;
        tenantKey = args.tenantKey || '';
        console.log('[GOOGLE SHEET TOOL] Extracted from VAPI function format:', {
          action,
          hasData: !!data,
          tenantKey,
          toolCallId,
          callId,
        });
      }
      // Direct format
      else {
        action = req.body.action;
        data = req.body.data;
        tenantKey = req.body.tenantKey;
        console.log('[GOOGLE SHEET TOOL] Using direct format:', { action, hasData: !!data, tenantKey });
      }

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      // Get tenant configuration - use getFullClient instead of getTenant
      const tenant = await store.getFullClient(tenantKey || 'logistics_client');
      if (!tenant) {
        console.log('[GOOGLE SHEET TOOL] Tenant not found, using default logistics_client');
        // Continue with default sheet ID if tenant not found
      }

      const logisticsSheetId =
        tenant?.vapi_json?.logisticsSheetId ||
        tenant?.vapi?.logisticsSheetId ||
        tenant?.gsheet_id ||
        process.env.LOGISTICS_SHEET_ID;

      if (!logisticsSheetId) {
        await sendOperatorAlert({
          subject: 'Google Sheet not configured (tool call blocked)',
          html: `<p><strong>access_google_sheet</strong> rejected: no sheet ID for tenant.</p><pre>${JSON.stringify(
            { tenantKey: tenantKey || null, action },
            null,
            2,
          )}</pre><p>Configure <code>gsheet_id</code> / logistics sheet on the tenant or <code>LOGISTICS_SHEET_ID</code> on the server.</p>`,
          dedupeKey: `sheet-missing:${String(tenantKey || 'unknown')}`,
          throttleMinutes: 120,
        }).catch(() => {});
        return res.status(400).json({ error: 'Google Sheet ID not configured' });
      }

      if (action === 'append' && data) {
        // Ensure logistics headers are present
        await sheets.ensureLogisticsHeader(logisticsSheetId);

        // Append data to sheet - include callId if available from webhook
        await sheets.appendLogistics(logisticsSheetId, {
          ...data,
          callId: callId || data.callId || '', // Use callId from webhook if available
          timestamp: new Date().toISOString(),
        });

        console.log('[GOOGLE SHEET TOOL] Data appended successfully');

        // Return format compatible with both VAPI and direct calls
        const response = {
          success: true,
          message: 'Data appended to Google Sheet successfully',
          action: 'append',
        };

        // If this is a VAPI tool call, return in VAPI's expected format
        if (toolCallId || req.body.function || req.body.message) {
          const callId = toolCallId || req.body.toolCallId || req.body.id || 'unknown';
          return res.json({
            results: [
              {
                toolCallId: callId,
                result: JSON.stringify(response),
              },
            ],
          });
        }

        return res.json(response);
      }

      if (action === 'read') {
        // Read data from sheet (basic implementation)
        const sheetData = await sheets.readSheet(logisticsSheetId);
        const response = {
          success: true,
          data: sheetData,
          action: 'read',
        };

        // If this is a VAPI tool call, return in VAPI's expected format
        if (toolCallId || req.body.function || req.body.message) {
          const callId = toolCallId || req.body.toolCallId || req.body.id || 'unknown';
          return res.json({
            results: [
              {
                toolCallId: callId,
                result: JSON.stringify(response),
              },
            ],
          });
        }

        return res.json(response);
      }

      return res.status(400).json({ error: 'Invalid action or missing data' });
    } catch (error) {
      console.error('[GOOGLE SHEET TOOL ERROR]', error);
      await sendOperatorAlert({
        subject: 'Google Sheet tool failed (access_google_sheet)',
        html: `<p><strong>access_google_sheet</strong> threw:</p><pre>${JSON.stringify(
          { message: error?.message, stack: error?.stack?.split('\n').slice(0, 8).join('\n') },
          null,
          2,
        )}</pre>`,
        dedupeKey: 'sheet-tool-error:access_google_sheet',
        throttleMinutes: 30,
      }).catch(() => {});
      return res.status(500).json({
        error: 'Failed to access Google Sheet',
        message: error.message,
      });
    }
  });

  router.post('/tools/schedule_callback', async (req, res) => {
    try {
      console.log('[CALLBACK TOOL] Request received:', req.body);

      const { businessName, phone, receptionistName, reason, preferredTime, notes, tenantKey } = req.body;

      if (!businessName || !phone || !reason) {
        return res.status(400).json({ error: 'Business name, phone, and reason are required' });
      }

      // Get tenant configuration - use getFullClient instead of getTenant
      const tenant = await store.getFullClient(tenantKey || 'logistics_client');
      if (!tenant) {
        console.log('[CALLBACK TOOL] Tenant not found, using default callback inbox');
        // Continue with default callback inbox if tenant not found
      }

      const callbackInboxEmail = tenant?.vapi_json?.callbackInboxEmail || tenant?.vapi?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;

      if (!callbackInboxEmail) {
        return res.status(400).json({ error: 'Callback inbox email not configured' });
      }

      const emailSubject = `Callback Scheduled: ${businessName} - ${phone}`;
      const emailBody = `
      <h2>Callback Scheduled</h2>
      <p><strong>Business:</strong> ${businessName}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Receptionist:</strong> ${receptionistName || 'Unknown'}</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p><strong>Preferred Time:</strong> ${preferredTime || 'Not specified'}</p>
      <p><strong>Notes:</strong> ${notes || 'None'}</p>
      <p><strong>Scheduled:</strong> ${new Date().toISOString()}</p>
    `;

      await messagingService.sendEmail({
        to: callbackInboxEmail,
        subject: emailSubject,
        html: emailBody,
      });

      console.log('[CALLBACK TOOL] Callback email sent successfully');
      return res.json({
        success: true,
        message: 'Callback scheduled and email sent successfully',
        callbackEmail: callbackInboxEmail,
      });
    } catch (error) {
      console.error('[CALLBACK TOOL ERROR]', error);
      return res.status(500).json({
        error: 'Failed to schedule callback',
        message: error.message,
      });
    }
  });

  return router;
}

