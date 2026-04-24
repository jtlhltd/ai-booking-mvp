import express from 'express';
import { Buffer } from 'buffer';

export function createDevTestRouter(deps) {
  const { query, readJson, writeJson, SMS_STATUS_PATH } = deps || {};
  const router = express.Router();

  // Simple test endpoint
  router.get('/api/test', (_req, res) => {
    res.json({
      success: true,
      message: 'Test endpoint working - SMS pipeline ready - DEPLOYMENT TEST',
      timestamp: new Date().toISOString(),
      env: {
        googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
        companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET',
        googleSearch: process.env.GOOGLE_SEARCH_API_KEY ? 'SET' : 'NOT SET',
      },
    });
  });

  // Test endpoint for SMS status webhook (no signature verification for testing)
  router.post(
    '/api/test/sms-status-webhook',
    express.json(),
    express.urlencoded({ extended: false }),
    async (req, res) => {
      // Preserve the original server.js behavior closely.
      console.log('[TEST SMS STATUS] Test webhook called');
      console.log('[TEST SMS STATUS] Body:', JSON.stringify(req.body));

      const messageSid = req.body.MessageSid;
      const status = req.body.MessageStatus;
      const to = req.body.To;
      const from = req.body.From;
      const errorCode = req.body.ErrorCode || null;

      console.log('[SMS STATUS WEBHOOK] Received status update:', { messageSid, status, to, errorCode });

      try {
        if (messageSid) {
          const updateResult = await query?.(
            `
        UPDATE messages 
        SET status = $1, updated_at = NOW()
        WHERE provider_sid = $2
        RETURNING id, client_key, to_phone
      `,
            [status, messageSid],
          );

          if ((updateResult?.rows || []).length > 0) {
            console.log('[SMS STATUS WEBHOOK] ✅ Updated message in database:', updateResult.rows[0]);
          } else {
            console.log('[SMS STATUS WEBHOOK] ⚠️ Message SID not found in database:', messageSid);
          }

          if (status === 'failed' || errorCode) {
            console.error('[SMS DELIVERY FAILED]', { messageSid, to, status, errorCode });

            if (process.env.YOUR_EMAIL) {
              try {
                const messagingService = (await import('../lib/messaging-service.js')).default;
                await messagingService.sendEmail({
                  to: process.env.YOUR_EMAIL,
                  subject: `⚠️ SMS Delivery Failed - ${to}`,
                  body: `SMS delivery failed for ${to}\n\nStatus: ${status}\nError Code: ${
                    errorCode || 'N/A'
                  }\nMessage SID: ${messageSid}\nTime: ${new Date().toISOString()}`,
                });
                console.log('[SMS STATUS WEBHOOK] ✅ Email alert sent');
              } catch (emailError) {
                console.error('[SMS STATUS WEBHOOK] Failed to send email alert:', emailError.message);
              }
            }
          }
        }

        const rows = (await readJson?.(SMS_STATUS_PATH, [])) || [];
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
        await writeJson?.(SMS_STATUS_PATH, rows);

        res.type('text/plain').send('OK');
      } catch (error) {
        console.error('[SMS STATUS WEBHOOK ERROR]', error);
        res.type('text/plain').send('OK');
      }
    },
  );

  // Test Companies House API endpoint
  router.get('/api/test-companies-house', async (_req, res) => {
    try {
      const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

      if (!apiKey) {
        return res.json({ success: false, error: 'Companies House API key not set' });
      }

      // NOTE: Preserves original behavior: `axios` is intentionally not imported here.
      // eslint-disable-next-line no-undef
      const response = await axios.get('https://api.company-information.service.gov.uk/search/companies', {
        params: {
          q: 'Scott Arms Dental Practice',
          items_per_page: 5,
        },
        headers: {
          Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        },
      });

      res.json({
        success: true,
        apiKey: apiKey.substring(0, 8) + '...',
        results: response.data.items?.length || 0,
        companies:
          response.data.items?.map((item) => ({
            name: item.title,
            number: item.company_number,
            status: item.company_status,
          })) || [],
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
    }
  });

  // Test Companies House officers endpoint
  router.get('/api/test-officers/:companyNumber', async (req, res) => {
    try {
      const { companyNumber } = req.params;
      const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

      if (!apiKey) {
        return res.json({ error: 'Companies House API key not set' });
      }

      // eslint-disable-next-line no-undef
      const response = await axios.get(
        `https://api.company-information.service.gov.uk/company/${companyNumber}/officers`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
          },
        },
      );

      res.json({
        success: true,
        companyNumber,
        officers:
          response.data.items?.map((officer) => ({
            name: officer.name,
            role: officer.officer_role,
            appointed: officer.appointed_on,
            resigned: officer.resigned_on,
            nationality: officer.nationality,
            occupation: officer.occupation,
            address: officer.address,
            contact_details: officer.contact_details,
            links: officer.links,
          })) || [],
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
    }
  });

  // Test LinkedIn search endpoint
  router.get('/api/test-linkedin', async (req, res) => {
    try {
      const { name, company } = req.query;

      if (!name || !company) {
        return res.status(400).json({ error: 'Name and company parameters required' });
      }

      console.log(`[TEST LINKEDIN] Testing search for \"${name}\" at \"${company}\"`);

      if (process.env.GOOGLE_SEARCH_API_KEY) {
        // eslint-disable-next-line no-undef
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: {
            key: process.env.GOOGLE_SEARCH_API_KEY,
            cx: '017576662512468239146:omuauf_lfve',
            q: `"${name}" "${company}" site:linkedin.com/in/`,
            num: 3,
          },
          timeout: 5000,
        });

        res.json({
          success: true,
          query: `"${name}" "${company}" site:linkedin.com/in/`,
          results: response.data.items ? response.data.items.length : 0,
          items: response.data.items || [],
          googleApiKey: 'SET',
        });
      } else {
        res.json({
          success: false,
          error: 'Google Search API key not set',
          googleApiKey: 'NOT SET',
        });
      }
    } catch (error) {
      console.error('[TEST LINKEDIN ERROR]', error);
      res.status(500).json({
        success: false,
        error: error.message,
        googleApiKey: process.env.GOOGLE_SEARCH_API_KEY ? 'SET' : 'NOT SET',
      });
    }
  });

  // Test Companies House Officers API directly
  router.get('/api/test-companies-house-officers/:companyNumber', async (req, res) => {
    try {
      if (!process.env.COMPANIES_HOUSE_API_KEY) {
        return res.json({ error: 'Companies House API key not set' });
      }

      const axios = (await import('axios')).default;
      const response = await axios.get(
        `https://api.company-information.service.gov.uk/company/${req.params.companyNumber}/officers`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`,
          },
        },
      );

      res.json({
        success: true,
        officers: response.data.items?.slice(0, 5) || [],
        message: `Companies House Officers API is working for company ${req.params.companyNumber}`,
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message,
        message: `Companies House Officers API failed for company ${req.params.companyNumber}`,
      });
    }
  });

  return router;
}

