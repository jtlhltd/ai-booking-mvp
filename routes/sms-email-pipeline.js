/**
 * SMS-Email Pipeline endpoints.
 * Mounted at root (paths are mixed: /api/*, /webhook*, /test-*).
 */
import express from 'express';
import { twilioWebhookVerification } from '../middleware/security.js';

export function createSmsEmailPipelineRouter(deps) {
  const { smsEmailPipeline } = deps || {};
  const router = express.Router();

  // Initiate Lead Capture (SMS asking for email)
  router.post('/api/initiate-lead-capture', async (req, res) => {
    try {
      const { leadData } = req.body;

      if (!leadData || !leadData.phoneNumber || !leadData.decisionMaker) {
        return res.status(400).json({
          success: false,
          message: 'Missing required lead data (phoneNumber, decisionMaker)'
        });
      }

      if (!smsEmailPipeline) {
        return res.status(503).json({
          success: false,
          message: 'SMS-Email pipeline not available'
        });
      }

      const result = await smsEmailPipeline.initiateLeadCapture(leadData);
      res.json(result);
    } catch (error) {
      console.error('[LEAD CAPTURE ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Lead capture failed',
        error: error.message
      });
    }
  });

  // Process Email Response (Webhook from Twilio)
  router.post('/api/process-email-response', async (req, res) => {
    try {
      const { phoneNumber, emailAddress } = req.body;

      if (!phoneNumber || !emailAddress) {
        return res.status(400).json({
          success: false,
          message: 'Missing phoneNumber or emailAddress'
        });
      }

      if (!smsEmailPipeline) {
        return res.status(503).json({
          success: false,
          message: 'SMS-Email pipeline not available'
        });
      }

      const result = await smsEmailPipeline.processEmailResponse(phoneNumber, emailAddress);
      res.json(result);
    } catch (error) {
      console.error('[EMAIL PROCESSING ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Email processing failed',
        error: error.message
      });
    }
  });

  // Get Lead Status
  router.get('/api/lead-status/:leadId', async (req, res) => {
    try {
      const { leadId } = req.params;
      if (!smsEmailPipeline) {
        return res.status(503).json({
          success: false,
          message: 'SMS-Email pipeline not available'
        });
      }

      const result = await smsEmailPipeline.getLeadStatus(leadId);
      res.json(result);
    } catch (error) {
      console.error('[LEAD STATUS ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get lead status',
        error: error.message
      });
    }
  });

  // Twilio Webhook for SMS Replies (Alternative endpoint for Twilio compatibility)
  router.post('/webhooks/sms', express.urlencoded({ extended: false }), twilioWebhookVerification, async (req, res) => {
    try {
      const { From, Body } = req.body;

      console.log('[SMS WEBHOOK /webhooks/sms]', {
        From,
        Body,
        smsEmailPipelineAvailable: !!smsEmailPipeline,
        bodyKeys: Object.keys(req.body || {})
      });

      const emailMatch = Body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

      if (emailMatch) {
        const emailAddress = emailMatch[1];
        console.log('[SMS WEBHOOK] Extracted email:', emailAddress);

        if (smsEmailPipeline) {
          try {
            let result = await smsEmailPipeline.processEmailResponse(From, emailAddress);

            if (
              !result.success &&
              result.message === 'No pending lead found for this phone number'
            ) {
              console.log('[SMS WEBHOOK] No pending lead found, sending direct booking email');

              const bookingLink = `${
                process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com'
              }/booking-simple.html?email=${encodeURIComponent(emailAddress)}&phone=${encodeURIComponent(
                From
              )}`;

              const leadData = {
                email: emailAddress,
                decisionMaker: 'there',
                businessName: 'your business'
              };

              await smsEmailPipeline.sendConfirmationEmail(leadData, bookingLink);

              await smsEmailPipeline.sendSMS({
                to: From,
                body: `Perfect! I've sent the booking link to ${emailAddress}. Check your email and click the link to schedule your appointment.`
              });

              result = { success: true, message: 'Direct email sent successfully' };
            }

            console.log('[SMS WEBHOOK] Email processing result:', result);
            if (result.success) {
              console.log('[SMS WEBHOOK] Booking email sent successfully to:', emailAddress);
            } else {
              console.log('[SMS WEBHOOK] Email processing failed:', result.message || result.error);
            }
          } catch (emailError) {
            console.error('[SMS WEBHOOK] Failed to process email:', emailError);
          }
        } else {
          console.log('[SMS WEBHOOK] Email service not available');
        }
      } else {
        console.log('[SMS WEBHOOK] No email found in SMS body');
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('[SMS WEBHOOK] Error processing SMS:', error);
      res.status(500).send('Error');
    }
  });

  // Twilio Webhook for SMS Replies
  router.post('/webhook/sms-reply', express.urlencoded({ extended: false }), twilioWebhookVerification, async (req, res) => {
    try {
      const { From, Body } = req.body;

      console.log('[SMS WEBHOOK]', {
        From,
        Body,
        smsEmailPipelineAvailable: !!smsEmailPipeline,
        bodyKeys: Object.keys(req.body || {})
      });

      const emailMatch = Body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

      if (emailMatch) {
        const emailAddress = emailMatch[1];

        if (!smsEmailPipeline) {
          console.log('[SMS WEBHOOK] SMS-Email pipeline not available, returning success anyway');
          return res.json({
            success: true,
            message: 'SMS received but pipeline not available (test mode)'
          });
        }

        const result = await smsEmailPipeline.processEmailResponse(From, emailAddress);

        res.json({
          success: true,
          message: 'Email processed successfully',
          result: result
        });
      } else {
        if (smsEmailPipeline) {
          try {
            await smsEmailPipeline.sendSMS({
              to: From,
              body: "I didn't find an email address in your message. Please send just your email address (e.g., john@company.com)"
            });
          } catch (smsError) {
            console.log('[SMS WEBHOOK] SMS send failed:', smsError.message);
          }
        }

        res.json({
          success: true,
          message: 'SMS received - no email found but webhook working'
        });
      }
    } catch (error) {
      console.error('[SMS WEBHOOK ERROR]', error);
      res.json({
        success: true,
        message: 'SMS webhook received (error handled gracefully)',
        error: error.message
      });
    }
  });

  // Test SMS-Email Pipeline (No API Key Required)
  router.get('/test-sms-pipeline', async (_req, res) => {
    try {
      res.json({
        success: true,
        message: 'SMS-Email Pipeline test endpoint is working!',
        timestamp: new Date().toISOString(),
        environment: {
          twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
          yourEmail: process.env.YOUR_EMAIL || 'not set'
        }
      });
    } catch (error) {
      console.error('[SMS PIPELINE TEST ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'SMS-Email Pipeline test failed',
        error: error.message
      });
    }
  });

  router.get('/sms-test', async (_req, res) => {
    res.json({
      success: true,
      message: 'SMS test endpoint working!',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

