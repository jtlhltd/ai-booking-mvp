/**
 * Automated Client Onboarding
 * Handles self-service client signup and provisioning
 */

import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { query } from '../db.js';

/**
 * Generate a unique client key from business name
 */
function generateClientKey(businessName) {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 20);
  
  const uniqueId = nanoid(6);
  return `${slug}_${uniqueId}`;
}

/**
 * Generate a secure API key
 */
function generateApiKey() {
  return 'sk_live_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Hash API key for storage
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate custom system prompt for client's AI assistant
 */
function generateSystemPrompt({ businessName, industry, primaryService, serviceArea }) {
  return `You are a professional AI assistant for ${businessName}, a ${industry} business serving ${serviceArea}.

**YOUR GOAL:** Qualify leads and book appointments for ${primaryService}.

**CONVERSATION FLOW:**

1. **Greeting (Warm & Professional)**
   "Hi there! I'm calling from ${businessName} about your ${primaryService} inquiry. Do you have a quick minute?"

2. **Qualify the Lead**
   Ask 2-3 key questions:
   - "What type of ${primaryService} are you looking for?"
   - "When would you like this done?"
   - "Have you had this service before?"

3. **Build Value**
   Briefly mention:
   - Years in business / expertise
   - "We specialize in ${primaryService} in ${serviceArea}"
   - Quick response time / quality guarantee

4. **Book the Appointment**
   "Great! Let me check our calendar and find you a time that works..."
   - Use calendar_checkAndBook tool
   - Offer 2-3 specific time slots
   - Confirm details

5. **Confirmation**
   "Perfect! You're all set for [DATE] at [TIME]. You'll get a confirmation text with all the details."

**OBJECTION HANDLING:**

If "Too busy":
→ "I totally understand! This will only take 2 minutes. When's a better time to call back?"

If "How much?":
→ "Price depends on the specifics. Can I ask a few quick questions so I can give you an accurate quote?"

If "Send info":
→ "Absolutely! I'll text you our information right now. What's the best number?"
→ Use notify_send tool to send SMS

If "Not interested":
→ "No problem! Can I ask - is it the timing or the service itself?"
→ If genuine: "Thanks for your time! Have a great day."

**TONE:**
- Professional but friendly
- Conversational, not scripted
- Confident but not pushy
- Brief and efficient (under 2 minutes)

**IMPORTANT RULES:**
- Always use £ (pounds) not $ (dollars)
- Don't mention specific prices over the phone
- SMS goes to the number being called (don't ask for different number)
- Keep it conversational - don't sound like a robot
- If they book, ALWAYS use calendar_checkAndBook tool
- Maximum call time: 5 minutes

**TOOLS AVAILABLE:**
1. calendar_checkAndBook - Book appointments
2. notify_send - Send SMS with information

Let's convert this lead! 🚀`;
}

/**
 * Create a new client with automated onboarding
 */
export async function createClient({
  businessName,
  industry,
  primaryService,
  serviceArea,
  website,
  ownerName,
  email,
  phone,
  voiceGender,
  businessHours,
  plan
}) {
  try {
    console.log(`[AUTO-ONBOARD] Starting onboarding for ${businessName}...`);

    // 1. Generate unique client key
    const clientKey = generateClientKey(businessName);
    console.log(`[AUTO-ONBOARD] Generated client key: ${clientKey}`);

    // 2. Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    console.log(`[AUTO-ONBOARD] Generated API key`);

    // 3. Generate custom AI prompt
    const systemPrompt = generateSystemPrompt({
      businessName,
      industry,
      primaryService,
      serviceArea
    });
    console.log(`[AUTO-ONBOARD] Generated custom AI prompt`);

    // 4. Calculate trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // 5. Create client in database
    console.log(`[AUTO-ONBOARD] Creating database entry...`);
    await query(`
      INSERT INTO tenants (
        client_key,
        display_name,
        is_enabled,
        locale,
        timezone,
        calendar_json,
        twilio_json,
        vapi_json,
        numbers_json,
        sms_templates_json,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      clientKey,
      businessName,
      true, // is_enabled
      'en-GB',
      'Europe/London', // Default timezone
      JSON.stringify({
        calendarId: null, // To be configured manually
        timezone: 'Europe/London',
        services: {
          [primaryService]: {
            durationMin: 30,
            price: null
          }
        },
        booking: {
          defaultDurationMin: 30
        }
      }),
      JSON.stringify({}), // Twilio to be configured
      JSON.stringify({
        assistantId: null, // To be created manually
        phoneNumberId: null, // To be created manually
        maxDurationSeconds: 300,
        systemPrompt, // Store the generated prompt
        voiceGender,
        businessHours
      }),
      JSON.stringify({}), // Phone numbers
      JSON.stringify({}) // SMS templates
    ]);

    console.log(`[AUTO-ONBOARD] ✅ Client created in database`);

    // 6. Create API key entry
    await query(`
      INSERT INTO api_keys (client_key, key_hash, name, created_at)
      VALUES ($1, $2, $3, $4)
    `, [clientKey, apiKeyHash, 'Primary API Key', new Date()]);

    console.log(`[AUTO-ONBOARD] ✅ API key created`);

    // 7. Store client metadata
    await query(`
      INSERT INTO client_metadata (
        client_key,
        owner_name,
        owner_email,
        owner_phone,
        industry,
        website,
        service_area,
        plan_name,
        trial_ends_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (client_key) DO UPDATE SET
        owner_name = EXCLUDED.owner_name,
        owner_email = EXCLUDED.owner_email,
        owner_phone = EXCLUDED.owner_phone,
        industry = EXCLUDED.industry,
        website = EXCLUDED.website,
        service_area = EXCLUDED.service_area,
        plan_name = EXCLUDED.plan_name,
        trial_ends_at = EXCLUDED.trial_ends_at
    `, [
      clientKey,
      ownerName,
      email,
      phone,
      industry,
      website || null,
      serviceArea,
      plan,
      trialEndsAt,
      new Date()
    ]);

    console.log(`[AUTO-ONBOARD] ✅ Client metadata stored`);

    // 8. Return success with credentials
    return {
      success: true,
      clientKey,
      apiKey, // Only returned once, never stored in plain text
      businessName,
      ownerEmail: email,
      trialEndsAt,
      systemPrompt // For manual Vapi assistant creation
    };

  } catch (error) {
    console.error(`[AUTO-ONBOARD] ❌ Error:`, error);
    throw error;
  }
}

/**
 * Send welcome email to new client
 */
export async function sendWelcomeEmail({ clientKey, businessName, ownerEmail, apiKey, systemPrompt }) {
  try {
    const { sendEmail } = await import('./messaging-service.js');

    const baseUrl = process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
    const importUrl = `${baseUrl}/lead-import.html?client=${clientKey}&key=${apiKey}`;
    const dashboardUrl = `${baseUrl}/dashboard/${clientKey}`;
    const settingsUrl = `${baseUrl}/settings/${clientKey}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .section { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
          .section h2 { margin-top: 0; color: #667eea; }
          .credential { background: #f0f0f0; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          .steps { counter-reset: step; }
          .step { counter-increment: step; margin: 15px 0; padding-left: 40px; position: relative; }
          .step::before { content: counter(step); position: absolute; left: 0; top: 0; background: #667eea; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Your AI Lead System!</h1>
            <p>Your account is now live and ready to convert leads</p>
          </div>
          
          <div class="content">
            <div class="section">
              <h2>🔑 Your Account Credentials</h2>
              <p><strong>Client ID:</strong></p>
              <div class="credential">${clientKey}</div>
              
              <p><strong>API Key:</strong> (Keep this secure!)</p>
              <div class="credential">${apiKey}</div>
              
              <p style="color: #999; font-size: 14px;">⚠️ Save these credentials securely. The API key will not be shown again.</p>
            </div>

            <div class="section">
              <h2>🚀 Quick Start Guide</h2>
              <div class="steps">
                <div class="step">
                  <strong>Set up your Vapi assistant</strong><br>
                  We've generated a custom AI prompt for ${businessName}. Contact us to create your Vapi assistant with this prompt.
                </div>
                <div class="step">
                  <strong>Connect your Google Calendar</strong><br>
                  Reply to this email with your Google Calendar email so we can set up automated booking.
                </div>
                <div class="step">
                  <strong>Import your first leads</strong><br>
                  <a href="${importUrl}" class="button">Import Leads Now</a>
                </div>
                <div class="step">
                  <strong>Watch the bookings roll in!</strong><br>
                  Leads will be called in 30 seconds and appointments booked automatically.
                </div>
              </div>
            </div>

            <div class="section">
              <h2>📊 Your Dashboard</h2>
              <p>View real-time stats, call history, and bookings:</p>
              <a href="${dashboardUrl}" class="button">View Dashboard</a>
            </div>

            <div class="section">
              <h2>💬 Your Custom AI Prompt</h2>
              <p>We've created a custom AI script for ${businessName}:</p>
              <div class="credential" style="font-size: 12px; max-height: 300px; overflow-y: scroll;">
                ${systemPrompt.replace(/\n/g, '<br>')}
              </div>
              <p style="margin-top: 10px; color: #666; font-size: 14px;">You can customize this script anytime. Just let us know!</p>
            </div>

            <div class="section">
              <h2>📞 Need Help?</h2>
              <p>We're here to help you succeed:</p>
              <ul>
                <li>📧 Email: <a href="mailto:support@yourcompany.com">support@yourcompany.com</a></li>
                <li>📱 Phone: +44 123 456 7890</li>
                <li>💬 Live Chat: Available in your dashboard</li>
              </ul>
            </div>

            <div class="section">
              <h2>💳 Your Free Trial</h2>
              <p>You have <strong>14 days</strong> to test the system completely free. No credit card required.</p>
              <p>After your trial, you'll be on the <strong>${businessName}</strong> plan. Cancel anytime, no questions asked.</p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
              <p>Questions? Just reply to this email!</p>
              <p>Let's convert some leads! 🚀</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: ownerEmail,
      subject: `🎉 ${businessName} - Your AI Lead System is Live!`,
      html
    });

    console.log(`[AUTO-ONBOARD] ✅ Welcome email sent to ${ownerEmail}`);

  } catch (error) {
    console.error(`[AUTO-ONBOARD] ❌ Welcome email failed:`, error);
    // Don't throw - email failure shouldn't block onboarding
  }
}

