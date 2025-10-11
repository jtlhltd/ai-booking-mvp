// lib/client-onboarding.js
// Automated client onboarding, API key generation, and provisioning

import { nanoid } from 'nanoid';
import { upsertFullClient, getFullClient } from '../db.js';
import messagingService from './messaging-service.js';

/**
 * Generate secure API key for client
 * @returns {string} - API key
 */
export function generateApiKey() {
  // Format: cl_live_xxxxxxxxxxxxxxxxxxxxxxxx (32 chars total)
  return `cl_live_${nanoid(24)}`;
}

/**
 * Generate client key from business name
 * @param {string} businessName - Business name
 * @returns {string} - Client key
 */
export function generateClientKey(businessName) {
  // Convert to lowercase, remove special chars, replace spaces with hyphens
  const cleaned = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30);
  
  // Add random suffix to ensure uniqueness
  return `${cleaned}-${nanoid(6)}`;
}

/**
 * Clone Vapi assistant for new client
 * @param {string} templateAssistantId - Template assistant ID
 * @param {Object} clientData - Client data for customization
 * @returns {Promise<Object>} - New assistant details
 */
export async function cloneVapiAssistant(templateAssistantId, clientData) {
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
  
  if (!VAPI_PRIVATE_KEY) {
    throw new Error('VAPI_PRIVATE_KEY not configured');
  }
  
  try {
    // Get template assistant
    const templateResponse = await fetch(`https://api.vapi.ai/assistant/${templateAssistantId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!templateResponse.ok) {
      throw new Error(`Failed to get template assistant: ${templateResponse.status}`);
    }
    
    const template = await templateResponse.json();
    
    // Customize system prompt with client data
    const customizedPrompt = template.model.messages[0].content
      .replace(/\{businessName\}/g, clientData.businessName)
      .replace(/\{industry\}/g, clientData.industry || 'business')
      .replace(/\{services\}/g, clientData.services?.join(', ') || 'services');
    
    // Create new assistant
    const newAssistant = {
      ...template,
      name: `${clientData.businessName} - Booking Assistant`,
      model: {
        ...template.model,
        messages: [
          {
            role: 'system',
            content: customizedPrompt
          }
        ]
      },
      // Remove ID so Vapi creates a new one
      id: undefined
    };
    
    const createResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newAssistant)
    });
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create assistant: ${createResponse.status}`);
    }
    
    const created = await createResponse.json();
    
    console.log(`[ONBOARDING] Created Vapi assistant for ${clientData.businessName}: ${created.id}`);
    
    return {
      assistantId: created.id,
      assistantName: created.name
    };
    
  } catch (error) {
    console.error('[ONBOARDING] Error cloning Vapi assistant:', error);
    throw error;
  }
}

/**
 * Onboard a new client
 * @param {Object} clientData - Client data
 * @returns {Promise<Object>} - Onboarding result
 */
export async function onboardClient(clientData) {
  const {
    businessName,
    email,
    phone,
    industry,
    services = [],
    timezone = 'Europe/London',
    address = '',
    website = '',
    vapiTemplateAssistantId = process.env.VAPI_TEMPLATE_ASSISTANT_ID
  } = clientData;
  
  // Validation
  if (!businessName || !email || !phone) {
    throw new Error('Missing required fields: businessName, email, phone');
  }
  
  console.log(`[ONBOARDING] Starting onboarding for ${businessName}...`);
  
  try {
    // 1. Generate client key and API key
    const clientKey = generateClientKey(businessName);
    const apiKey = generateApiKey();
    
    console.log(`[ONBOARDING] Generated keys for ${businessName}: ${clientKey}`);
    
    // 2. Clone Vapi assistant (if template provided)
    let vapiAssistant = null;
    if (vapiTemplateAssistantId) {
      try {
        vapiAssistant = await cloneVapiAssistant(vapiTemplateAssistantId, {
          businessName,
          industry,
          services
        });
      } catch (error) {
        console.warn('[ONBOARDING] Failed to clone Vapi assistant, continuing without:', error.message);
      }
    }
    
    // 3. Create client record in database
    const client = {
      clientKey,
      displayName: businessName,
      email,
      phone,
      industry,
      website,
      address,
      timezone,
      locale: 'en-GB',
      isEnabled: true,
      apiKey,
      services,
      createdAt: new Date().toISOString(),
      
      // Booking configuration
      booking: {
        timezone,
        slotDuration: 30, // 30 minutes
        bufferMinutes: 0,
        daysAhead: 30
      },
      
      // Vapi configuration
      vapi: vapiAssistant ? {
        assistantId: vapiAssistant.assistantId,
        phoneNumberId: null // Will be set up later
      } : null,
      
      // SMS configuration (will be set up later)
      sms: {
        fromNumber: null,
        messagingServiceSid: null
      },
      
      // Calendar configuration (will be set up later)
      calendarId: null,
      
      // Benefits for follow-up messages
      benefits: [
        'Professional service',
        'Fast response time',
        'Excellent results'
      ],
      
      // Default service
      defaultService: services[0] || 'consultation',
      
      // Booking link
      bookingLink: `${process.env.BASE_URL || 'https://yourdomain.com'}/booking?client=${clientKey}`
    };
    
    await upsertFullClient(client);
    
    console.log(`[ONBOARDING] ✅ Created client record for ${businessName}`);
    
    // 4. Send welcome email
    try {
      await sendWelcomeEmail({
        email,
        businessName,
        clientKey,
        apiKey,
        dashboardUrl: `${process.env.BASE_URL || 'https://yourdomain.com'}/client-dashboard.html?client=${clientKey}`,
        assistantId: vapiAssistant?.assistantId
      });
    } catch (error) {
      console.warn('[ONBOARDING] Failed to send welcome email:', error.message);
    }
    
    console.log(`[ONBOARDING] 🎉 Successfully onboarded ${businessName}!`);
    
    return {
      success: true,
      clientKey,
      apiKey,
      dashboardUrl: `${process.env.BASE_URL || 'https://yourdomain.com'}/client-dashboard.html?client=${clientKey}`,
      vapiAssistant: vapiAssistant || null,
      nextSteps: [
        'Set up Twilio phone number',
        'Connect Google Calendar',
        'Upload first batch of leads',
        'Test AI calling with sample lead',
        'Configure SMS templates'
      ]
    };
    
  } catch (error) {
    console.error(`[ONBOARDING] ❌ Failed to onboard ${businessName}:`, error);
    throw error;
  }
}

/**
 * Send welcome email to new client
 */
async function sendWelcomeEmail({ email, businessName, clientKey, apiKey, dashboardUrl, assistantId }) {
  const subject = `Welcome to AI Booking - Your Setup Guide`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 32px;">🎉 Welcome to AI Booking!</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 18px;">Your account is ready</p>
      </div>
      
      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Hi ${businessName}!</h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
          Your AI booking assistant is ready to start converting leads into appointments. Here's everything you need to get started:
        </p>
        
        <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #667eea;">
          <h3 style="color: #333; margin-top: 0;">🔑 Your Credentials</h3>
          <p style="color: #666; margin: 10px 0;"><strong>Client Key:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">${clientKey}</code></p>
          <p style="color: #666; margin: 10px 0;"><strong>API Key:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${apiKey}</code></p>
          ${assistantId ? `<p style="color: #666; margin: 10px 0;"><strong>Vapi Assistant ID:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">${assistantId}</code></p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">Access Your Dashboard</a>
        </div>
        
        <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <h4 style="color: #0c5460; margin-top: 0;">📋 Next Steps:</h4>
          <ol style="color: #0c5460; margin: 0; padding-left: 20px; line-height: 1.8;">
            <li>Set up your Twilio phone number</li>
            <li>Connect your Google Calendar</li>
            <li>Upload your first batch of leads</li>
            <li>Test the AI with a sample call</li>
            <li>Review and customize SMS templates</li>
          </ol>
        </div>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #ffc107;">
          <h4 style="color: #856404; margin-top: 0;">⚠️ Security Note</h4>
          <p style="color: #856404; margin: 0; line-height: 1.6;">
            Keep your API key secure. Never share it publicly or commit it to version control. Treat it like a password.
          </p>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-top: 30px;">
          Need help getting started? Reply to this email and we'll guide you through the setup process.
        </p>
        
        <p style="color: #666; line-height: 1.6;">
          Best regards,<br>
          <strong>The AI Booking Team</strong>
        </p>
      </div>
      
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>AI Booking MVP - Automated Lead Conversion</p>
      </div>
    </div>
  `;
  
  return await messagingService.sendEmail({
    to: email,
    subject,
    body: `Welcome to AI Booking! Your account is ready. Visit ${dashboardUrl}`,
    html
  });
}

/**
 * Update client configuration
 * @param {string} clientKey - Client identifier
 * @param {Object} updates - Configuration updates
 * @returns {Promise<Object>} - Update result
 */
export async function updateClientConfig(clientKey, updates) {
  try {
    const client = await getFullClient(clientKey);
    
    if (!client) {
      throw new Error(`Client not found: ${clientKey}`);
    }
    
    // Merge updates
    const updatedClient = {
      ...client,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await upsertFullClient(updatedClient);
    
    console.log(`[ONBOARDING] Updated config for ${clientKey}`);
    
    return { success: true, client: updatedClient };
    
  } catch (error) {
    console.error('[ONBOARDING] Error updating client config:', error);
    throw error;
  }
}

/**
 * Deactivate client
 * @param {string} clientKey - Client identifier
 * @param {string} reason - Deactivation reason
 * @returns {Promise<Object>} - Result
 */
export async function deactivateClient(clientKey, reason = 'client_request') {
  try {
    const client = await getFullClient(clientKey);
    
    if (!client) {
      throw new Error(`Client not found: ${clientKey}`);
    }
    
    // Mark as disabled
    await upsertFullClient({
      ...client,
      isEnabled: false,
      deactivatedAt: new Date().toISOString(),
      deactivationReason: reason
    });
    
    console.log(`[ONBOARDING] Deactivated client ${clientKey}: ${reason}`);
    
    return { success: true, clientKey, deactivated: true };
    
  } catch (error) {
    console.error('[ONBOARDING] Error deactivating client:', error);
    throw error;
  }
}

export default {
  generateApiKey,
  generateClientKey,
  cloneVapiAssistant,
  onboardClient,
  updateClientConfig,
  deactivateClient
};

