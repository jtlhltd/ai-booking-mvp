import express from 'express';

export function createCreateClientRouter(deps) {
  const { upsertFullClient, adjustColorBrightness } = deps || {};
  const router = express.Router();

  router.post('/create-client', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      console.log('[API DEBUG]', {
        receivedKey: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
        expectedKey: process.env.API_KEY ? process.env.API_KEY.substring(0, 8) + '...' : 'none',
        headers: req.headers
      });

      if (apiKey !== process.env.API_KEY) {
        console.log('[API ERROR] Unauthorized request');
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const clientData = req.body;
      console.log('[CLIENT CREATION DEBUG]', {
        bodyExists: !!clientData,
        bodyType: typeof clientData,
        bodyKeys: clientData ? Object.keys(clientData) : 'no body',
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length'),
        requestedBy: req.ip
      });

      if (!clientData) {
        console.log('[CLIENT CREATION ERROR] No request body received');
        return res.status(400).json({ ok: false, error: 'No request body received' });
      }

      if (!clientData.basic) {
        console.log('[CLIENT CREATION ERROR] Missing basic client data');
        return res.status(400).json({ ok: false, error: 'Missing basic client data' });
      }

      console.log('[CLIENT CREATION]', {
        clientName: clientData.basic?.clientName,
        industry: clientData.basic?.industry,
        requestedBy: req.ip
      });

      const clientKey = clientData.basic.clientName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .trim();

      const primaryColor = clientData.branding?.primaryColor || '#667eea';
      const secondaryColor = adjustColorBrightness(primaryColor, -20);

      const clientConfig = {
        clientKey,
        displayName: clientData.basic.clientName,
        industry: clientData.basic.industry,
        primaryColor,
        secondaryColor,
        timezone: clientData.branding?.timezone || 'Europe/London',
        locale: clientData.branding?.locale || 'en-GB',
        businessHours: {
          start: parseInt(clientData.operations?.businessStart?.split(':')[0]) || 9,
          end: parseInt(clientData.operations?.businessEnd?.split(':')[0]) || 17,
          days: clientData.operations?.businessDays || [1, 2, 3, 4, 5]
        },
        sms: {
          fromNumber:
            clientData.communication?.smsFromNumber ||
            `+4474${Math.floor(Math.random() * 10000000)
              .toString()
              .padStart(7, '0')}`,
          messagingServiceSid: 'MG852f3cf7b50ef1be50c566be9e7efa04',
          welcomeMessage:
            clientData.communication?.welcomeMessage ||
            `Hi! Thanks for contacting ${clientData.basic.clientName}. Reply START to get started.`,
          confirmationMessage:
            clientData.communication?.confirmationMessage ||
            'Your appointment is confirmed. Reply STOP to opt out.',
          reminderMessage:
            clientData.communication?.reminderMessage ||
            'Reminder: You have an appointment tomorrow. Reply YES to confirm or STOP to cancel.',
          reminderHours: parseInt(clientData.communication?.reminderHours) || 24,
          maxRetries: parseInt(clientData.communication?.maxRetries) || 3
        },
        vapi: {
          assistantId: process.env.VAPI_ASSISTANT_ID || '',
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || '',
          maxDurationSeconds: 10
        },
        calendar: {
          calendarId: `calendar_${clientKey}@company.com`,
          timezone: clientData.branding?.timezone || 'Europe/London',
          appointmentDuration: parseInt(clientData.operations?.appointmentDuration) || 60,
          advanceBooking: parseInt(clientData.operations?.advanceBooking) || 7
        },
        contact: {
          name: clientData.basic.contactName,
          title: clientData.basic.contactTitle,
          email: clientData.basic.email,
          phone: clientData.basic.phone,
          website: clientData.basic.website
        },
        onboarding: {
          status: 'pending',
          startDate: new Date().toISOString(),
          estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          steps: [
            { id: 1, name: 'Client Discovery', completed: true, completedAt: new Date().toISOString() },
            { id: 2, name: 'System Configuration', completed: false, estimatedHours: 2 },
            { id: 3, name: 'SMS Setup', completed: false, estimatedHours: 1 },
            { id: 4, name: 'VAPI Configuration', completed: false, estimatedHours: 2 },
            { id: 5, name: 'Dashboard Branding', completed: false, estimatedHours: 1 },
            { id: 6, name: 'Testing & Validation', completed: false, estimatedHours: 2 },
            { id: 7, name: 'Client Training', completed: false, estimatedHours: 1 },
            { id: 8, name: 'Go Live', completed: false, estimatedHours: 1 }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await upsertFullClient(clientConfig);

      try {
        const fs = await import('fs');
        const path = await import('path');

        const templatePath = path.join(process.cwd(), 'public', 'client-dashboard-template.html');
        console.log('[FILE DEBUG]', { templatePath, exists: fs.existsSync(templatePath) });

        if (fs.existsSync(templatePath)) {
          const dashboardTemplate = fs.readFileSync(templatePath, 'utf8');

          const brandedDashboard = dashboardTemplate
            .replace(/Client Company/g, clientData.basic.clientName)
            .replace(/"#667eea"/g, `"${primaryColor}"`)
            .replace(/"#764ba2"/g, `"${secondaryColor}"`)
            .replace(/YOUR_API_KEY_HERE/g, process.env.API_KEY);

          const clientDir = path.join(process.cwd(), 'clients', clientKey);

          try {
            if (!fs.existsSync(clientDir)) {
              fs.mkdirSync(clientDir, { recursive: true });
            }

            fs.writeFileSync(path.join(clientDir, 'dashboard.html'), brandedDashboard);
            console.log('[FILES CREATED]', {
              clientDir,
              dashboardFile: path.join(clientDir, 'dashboard.html')
            });
          } catch (writeError) {
            console.log('[FILE WRITE SKIPPED]', {
              error: writeError.message,
              reason: 'No write access on Render'
            });
          }
        } else {
          console.log('[TEMPLATE NOT FOUND]', { templatePath });
        }
      } catch (fileError) {
        console.error('[FILE ERROR]', { error: fileError.message, stack: fileError.stack });
      }

      console.log('[CLIENT CREATED]', {
        clientKey,
        clientName: clientData.basic.clientName,
        industry: clientData.basic.industry
      });

      try {
        const { logAudit } = await import('../lib/security.js');
        await logAudit({
          clientKey,
          action: 'client_created',
          details: {
            clientName: clientData.basic.clientName,
            industry: clientData.basic.industry,
            contactEmail: clientData.basic.email
          },
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (auditError) {
        console.error('[AUDIT LOG ERROR]', auditError);
      }

      res.json({
        ok: true,
        clientKey,
        clientName: clientData.basic.clientName,
        industry: clientData.basic.industry,
        dashboardUrl: `/clients/${clientKey}/dashboard.html`,
        checklistUrl: `/clients/${clientKey}/checklist.md`,
        message: 'Client created successfully'
      });
    } catch (error) {
      console.error('[CLIENT CREATION ERROR]', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to create client',
        details: error.message
      });
    }
  });

  return router;
}

