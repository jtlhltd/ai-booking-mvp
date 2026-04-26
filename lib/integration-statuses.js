/**
 * Per-tenant integration health for core-api (extracted from server.js).
 */
export async function getIntegrationStatuses(clientKey, deps) {
  const { query } = deps || {};
  const integrations = [
    {
      name: 'Vapi Voice',
      status: 'warning',
      detail: 'Checking connection...'
    },
    {
      name: 'Twilio SMS',
      status: 'warning',
      detail: 'Checking connection...'
    },
    {
      name: 'Google Calendar',
      status: 'warning',
      detail: 'Checking connection...'
    }
  ];

  if (clientKey) {
    try {
      let clientResult;
      let vapiConfig = {};

      try {
        clientResult = await query(
          `
          SELECT vapi_json, twilio_json
          FROM tenants
          WHERE client_key = $1
        `,
          [clientKey]
        );

        const client = clientResult.rows?.[0];
        if (!client) {
          const vapiIntegration = integrations.find((i) => i.name === 'Vapi Voice');
          if (vapiIntegration) {
            vapiIntegration.status = 'error';
            vapiIntegration.detail = `Client "${clientKey}" not found in database. Create the client first using /api/admin/client POST endpoint or ensure the client_key is correct.`;
          }
          return integrations;
        }
        vapiConfig = client?.vapi_json || {};
      } catch (columnError) {
        if (columnError.message?.includes('does not exist') && columnError.message?.includes('vapi_json')) {
          throw columnError;
        }
        vapiConfig = {};
        throw columnError;
      }

      const hasAssistantId = !!vapiConfig.assistantId;
      const hasPhoneNumberId = !!vapiConfig.phoneNumberId;
      const hasClientVapiConfig = !!(
        vapiConfig.assistantId ||
        vapiConfig.phoneNumberId ||
        vapiConfig.apiKey ||
        vapiConfig.privateKey
      );

      const vapiIntegration = integrations.find((i) => i.name === 'Vapi Voice');
      if (vapiIntegration) {
        if (hasClientVapiConfig) {
          const vapiKey = vapiConfig.privateKey || vapiConfig.apiKey || vapiConfig.publicKey;

          if (vapiKey) {
            try {
              const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${vapiKey}`,
                  'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(5000)
              });

              if (vapiResponse.ok) {
                vapiIntegration.status = 'active';
                vapiIntegration.detail = hasPhoneNumberId
                  ? 'Assistant + phone number connected'
                  : 'Assistant connected (phone number not configured)';
              } else {
                vapiIntegration.status = 'warning';
                await vapiResponse.text().catch(() => '');
                vapiIntegration.detail = `Assistant configured but API key test failed (HTTP ${vapiResponse.status}). Verify the API key is correct.`;
              }
            } catch (error) {
              vapiIntegration.status = 'warning';
              vapiIntegration.detail = `Assistant configured but connection test failed: ${error.message}. Verify the API key is correct.`;
            }
          } else {
            if (hasAssistantId) {
              vapiIntegration.status = 'active';
              vapiIntegration.detail = hasPhoneNumberId
                ? 'Assistant connected (API key not stored - connection test skipped)'
                : `Assistant "${vapiConfig.assistantId}" connected (API key not stored - connection test skipped)`;
            } else {
              vapiIntegration.status = 'warning';
              vapiIntegration.detail =
                'Vapi configuration incomplete. Add assistantId and optionally privateKey for connection testing.';
            }
          }
        } else {
          vapiIntegration.status = 'error';
          vapiIntegration.detail =
            'This client does not have Vapi configured. Update the client\'s vapi_json in the database (tenants table) with: { "assistantId": "...", "phoneNumberId": "...", "privateKey": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
        }
      }
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      const vapiIntegration = integrations.find((i) => i.name === 'Vapi Voice');
      if (vapiIntegration) {
        if (error.message?.includes('does not exist') && error.message?.includes('vapi_json')) {
          vapiIntegration.status = 'error';
          vapiIntegration.detail =
            'Database schema needs update. The tenants table is missing vapi_json column. Contact support to update the database schema.';
        } else if (error.message?.includes('relation "tenants" does not exist')) {
          vapiIntegration.status = 'error';
          vapiIntegration.detail =
            'Database table not found. The tenants table does not exist. Contact support to set up the database.';
        } else {
          vapiIntegration.status = 'error';
          vapiIntegration.detail =
            'This client does not have Vapi configured. Update the client\'s vapi_json in the database (tenants table) with: { "assistantId": "...", "phoneNumberId": "...", "privateKey": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
        }
      }
    }
  } else {
    const vapiIntegration = integrations.find((i) => i.name === 'Vapi Voice');
    if (vapiIntegration) {
      vapiIntegration.status = 'error';
      vapiIntegration.detail =
        'Client key required to check Vapi configuration. Each client must have their own Vapi settings in vapi_json (tenants table) or configured via /api/admin/client/:clientKey PUT endpoint.';
    }
  }

  if (clientKey) {
    try {
      let smsConfig = {};

      try {
        const clientResult = await query(
          `
          SELECT twilio_json, vapi_json
          FROM tenants
          WHERE client_key = $1
        `,
          [clientKey]
        );

        const client = clientResult.rows?.[0];
        smsConfig = client?.twilio_json || {};
      } catch (error) {
        console.error('[INTEGRATION HEALTH ERROR] Failed to query client config:', error.message);
        smsConfig = {};
      }

      const hasClientSmsConfig = !!(
        smsConfig.messagingServiceSid ||
        smsConfig.fromNumber ||
        smsConfig.accountSid ||
        smsConfig.authToken
      );

      const twilioIntegration = integrations.find((i) => i.name === 'Twilio SMS');
      if (twilioIntegration) {
        if (hasClientSmsConfig) {
          const twilioSid = smsConfig.accountSid || smsConfig.messagingServiceSid;
          const twilioToken = smsConfig.authToken;

          if (twilioSid && twilioToken) {
            try {
              const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
              const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`, {
                method: 'GET',
                headers: {
                  Authorization: `Basic ${auth}`
                },
                signal: AbortSignal.timeout(5000)
              });

              if (twilioResponse.ok) {
                twilioIntegration.status = 'active';
                twilioIntegration.detail = 'Messaging service verified';
              } else {
                twilioIntegration.status = 'warning';
                await twilioResponse.text().catch(() => '');
                twilioIntegration.detail = `Twilio credentials invalid or expired (HTTP ${twilioResponse.status}). Update this client's sms_json/twilio_json.accountSid and authToken in the database (tenants table) or via /api/admin/client/:clientKey PUT endpoint.`;
              }
            } catch (error) {
              twilioIntegration.status = 'warning';
              twilioIntegration.detail = `Connection test failed: ${error.message}. Check this client's sms_json/twilio_json in the database (tenants table) or update via /api/admin/client/:clientKey PUT endpoint.`;
            }
          } else {
            twilioIntegration.status = 'warning';
            twilioIntegration.detail =
              'This client has SMS configuration but missing accountSid or authToken. Update the client\'s sms_json/twilio_json in the database or via /api/admin/client/:clientKey PUT endpoint.';
          }
        } else {
          twilioIntegration.status = 'warning';
          twilioIntegration.detail =
            'This client does not have Twilio configured. Update the client\'s sms_json or twilio_json in the database (tenants table) with: { "accountSid": "...", "authToken": "...", "messagingServiceSid": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
        }
      }
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      const twilioIntegration = integrations.find((i) => i.name === 'Twilio SMS');
      if (twilioIntegration) {
        if (error.message?.includes('does not exist')) {
          twilioIntegration.status = 'warning';
          twilioIntegration.detail =
            'Database schema needs update. The tenants table is missing SMS configuration columns. Contact support to update the database schema.';
        } else {
          twilioIntegration.status = 'warning';
          twilioIntegration.detail = `Unable to check Twilio configuration: ${error.message}. Database connection may be unavailable.`;
        }
      }
    }
  } else {
    const twilioIntegration = integrations.find((i) => i.name === 'Twilio SMS');
    if (twilioIntegration) {
      twilioIntegration.status = 'warning';
      twilioIntegration.detail =
        'Client key required to check Twilio configuration. Each client must have their own SMS settings in sms_json/twilio_json (tenants table) or configured via /api/admin/client/:clientKey PUT endpoint.';
    }
  }

  if (clientKey) {
    try {
      const tenantResult = await query(
        `
        SELECT calendar_json
        FROM tenants
        WHERE client_key = $1
      `,
        [clientKey]
      );

      const calendarConfig = tenantResult.rows?.[0]?.calendar_json || {};
      const isConnected = !!(calendarConfig.service_account_email || calendarConfig.access_token);

      const calendarIntegration = integrations.find((i) => i.name === 'Google Calendar');
      if (calendarIntegration) {
        calendarIntegration.status = isConnected ? 'active' : 'warning';
        calendarIntegration.detail = isConnected
          ? 'Auto-booking synced'
          : 'This client does not have Google Calendar connected. Update the client\'s calendar_json in the database (tenants table) with: { "service_account_email": "..." } or { "access_token": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
      }
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      const calendarIntegration = integrations.find((i) => i.name === 'Google Calendar');
      if (calendarIntegration) {
        calendarIntegration.status = 'warning';
        calendarIntegration.detail = `Unable to check calendar configuration: ${error.message}. Database connection may be unavailable.`;
      }
    }
  } else {
    const calendarIntegration = integrations.find((i) => i.name === 'Google Calendar');
    if (calendarIntegration) {
      calendarIntegration.status = 'warning';
      calendarIntegration.detail =
        'Client key required to check Google Calendar configuration. Each client must have their own calendar settings in calendar_json (tenants table) or configured via /api/admin/client/:clientKey PUT endpoint.';
    }
  }

  return integrations;
}
