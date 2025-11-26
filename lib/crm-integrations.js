// CRM Integration Library
// Handles syncing leads, calls, and appointments to HubSpot and Salesforce
// Enhanced with retry logic, error handling, and alerting

import { query } from '../db.js';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  timeout: 30000 // 30 second timeout for API calls
};

// Retryable HTTP status codes
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute API call with retry logic and exponential backoff
 */
async function executeWithRetry(fn, context = {}) {
  let lastError;
  let delay = RETRY_CONFIG.initialDelay;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), RETRY_CONFIG.timeout);
      });
      
      // Race between API call and timeout
      return await Promise.race([fn(), timeoutPromise]);
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      
      if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
        // Don't retry if not retryable or max retries reached
        throw error;
      }
      
      // Log retry attempt
      console.warn(`[CRM RETRY] Attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed:`, error.message);
      
      // Wait before retrying (exponential backoff)
      await sleep(Math.min(delay, RETRY_CONFIG.maxDelay));
      delay *= RETRY_CONFIG.backoffMultiplier;
    }
  }
  
  throw lastError;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error) {
  // Network errors are retryable
  if (error.message.includes('timeout') || error.message.includes('ECONNRESET') || error.message.includes('ENOTFOUND')) {
    return true;
  }
  
  // Check for retryable HTTP status codes
  if (error.status) {
    return RETRYABLE_STATUS_CODES.includes(error.status);
  }
  
  // Rate limit errors are retryable
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    return true;
  }
  
  // Server errors are retryable
  if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
    return true;
  }
  
  // Authentication errors are NOT retryable
  if (error.message.includes('401') || error.message.includes('403') || error.message.includes('authentication')) {
    return false;
  }
  
  // Default: retry on unknown errors
  return true;
}

/**
 * Classify error severity
 */
function classifyError(error, crmType, operation) {
  const errorMessage = error.message?.toLowerCase() || '';
  
  // Critical errors (authentication, invalid config)
  if (errorMessage.includes('401') || errorMessage.includes('403') || 
      errorMessage.includes('authentication') || errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid api key') || errorMessage.includes('invalid token')) {
    return {
      severity: 'critical',
      category: 'authentication',
      retryable: false,
      userAction: 'Check API credentials'
    };
  }
  
  // Rate limit errors
  if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('too many requests')) {
    return {
      severity: 'warning',
      category: 'rate_limit',
      retryable: true,
      userAction: 'Wait before retrying'
    };
  }
  
  // Server errors (temporary)
  if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') || 
      errorMessage.includes('timeout') || errorMessage.includes('connection')) {
    return {
      severity: 'error',
      category: 'server_error',
      retryable: true,
      userAction: 'Will retry automatically'
    };
  }
  
  // Data validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('400')) {
    return {
      severity: 'error',
      category: 'validation',
      retryable: false,
      userAction: 'Check data format'
    };
  }
  
  // Default classification
  return {
    severity: 'error',
    category: 'unknown',
    retryable: true,
    userAction: 'Check logs for details'
  };
}

/**
 * Log error to error monitoring system
 */
async function logCrmError(error, crmType, operation, clientKey, context = {}) {
  try {
    const classification = classifyError(error, crmType, operation);
    
    // Import error monitoring
    const { logError } = await import('./error-monitoring.js');
    
    await logError({
      errorType: `CRM_${crmType.toUpperCase()}_${operation.toUpperCase()}`,
      errorMessage: error.message || 'Unknown CRM error',
      stack: error.stack,
      context: {
        crmType,
        operation,
        clientKey,
        classification,
        ...context
      },
      severity: classification.severity,
      service: 'crm-integration'
    });
    
    // Send critical alert for authentication errors
    if (classification.severity === 'critical') {
      const { sendCriticalAlert } = await import('./error-monitoring.js');
      await sendCriticalAlert({
        message: `🚨 CRM ${crmType} authentication failed for client ${clientKey}`,
        errorType: `CRM_${crmType}_AUTH_FAILURE`,
        severity: 'critical'
      });
    }
  } catch (logError) {
    // Don't fail if logging fails
    console.error('[CRM] Failed to log error:', logError);
  }
}

/**
 * Track sync failure in database
 */
async function trackSyncFailure(clientKey, crmType, operation, error, context = {}) {
  try {
    await query(`
      INSERT INTO crm_sync_failures (
        client_key,
        crm_type,
        operation,
        error_message,
        error_details,
        retry_count,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      clientKey,
      crmType,
      operation,
      error.message || 'Unknown error',
      JSON.stringify({ ...context, stack: error.stack }),
      0
    ]);
  } catch (dbError) {
    // Silently fail if table doesn't exist
    console.warn('[CRM] Could not track sync failure:', dbError.message);
  }
}

/**
 * HubSpot CRM Integration
 */
export class HubSpotIntegration {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.hubapi.com';
  }

  /**
   * Create or update a contact in HubSpot
   */
  async syncContact(leadData) {
    try {
      const { name, phone, email, source, status, notes } = leadData;
      
      // HubSpot contact properties
      const properties = {
        phone: phone,
        ...(email && { email: email }),
        ...(name && { firstname: name.split(' ')[0], lastname: name.split(' ').slice(1).join(' ') || '' }),
        lead_source: source || 'AI Booking System',
        hs_lead_status: this.mapStatusToHubSpot(status),
        ...(notes && { notes: notes })
      };

      // Check if contact exists by email or phone
      let contactId = null;
      if (email) {
        contactId = await this.findContactByEmail(email);
      }
      if (!contactId && phone) {
        contactId = await this.findContactByPhone(phone);
      }

      if (contactId) {
        // Update existing contact
        return await this.updateContact(contactId, properties, leadData.clientKey);
      } else {
        // Create new contact
        return await this.createContact(properties, leadData.clientKey);
      }
    } catch (error) {
      console.error('[HUBSPOT] Error syncing contact:', error);
      
      // Log error if clientKey available
      if (leadData.clientKey) {
        await logCrmError(error, 'hubspot', 'syncContact', leadData.clientKey, { leadData });
        await trackSyncFailure(leadData.clientKey, 'hubspot', 'syncContact', error, { leadData });
      }
      
      throw error;
    }
  }

  /**
   * Create a new contact in HubSpot (with retry logic)
   */
  async createContact(properties, clientKey = null) {
    return executeWithRetry(async () => {
      const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HubSpot API error: ${errorText}`);
        error.status = response.status;
        
        // Log error if clientKey provided
        if (clientKey) {
          await logCrmError(error, 'hubspot', 'createContact', clientKey, { properties });
          await trackSyncFailure(clientKey, 'hubspot', 'createContact', error, { properties });
        }
        
        throw error;
      }

      const data = await response.json();
      return { id: data.id, created: true };
    }, { operation: 'createContact', crmType: 'hubspot' });
  }

  /**
   * Update an existing contact in HubSpot (with retry logic)
   */
  async updateContact(contactId, properties, clientKey = null) {
    return executeWithRetry(async () => {
      const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HubSpot API error: ${errorText}`);
        error.status = response.status;
        
        // Log error if clientKey provided
        if (clientKey) {
          await logCrmError(error, 'hubspot', 'updateContact', clientKey, { contactId, properties });
          await trackSyncFailure(clientKey, 'hubspot', 'updateContact', error, { contactId, properties });
        }
        
        throw error;
      }

      return { id: contactId, updated: true };
    }, { operation: 'updateContact', crmType: 'hubspot' });
  }

  /**
   * Find contact by email
   */
  async findContactByEmail(email) {
    try {
      const response = await fetch(
        `${this.baseUrl}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      if (response.status === 404) return null;
      if (!response.ok) return null;

      const data = await response.json();
      return data.id;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find contact by phone
   */
  async findContactByPhone(phone) {
    try {
      const response = await fetch(
        `${this.baseUrl}/crm/v3/objects/contacts/search`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{
                propertyName: 'phone',
                operator: 'EQ',
                value: phone
              }]
            }]
          })
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.results?.[0]?.id || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a deal in HubSpot
   */
  async createDeal(dealData) {
    const { contactId, dealName, amount, stage, closeDate } = dealData;
    
    const properties = {
      dealname: dealName || 'Appointment Booking',
      amount: amount?.toString() || '0',
      dealstage: stage || 'appointmentscheduled',
      closedate: closeDate || new Date().toISOString()
    };

    const response = await fetch(`${this.baseUrl}/crm/v3/objects/deals`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties, associations: contactId ? [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }] : [] })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot API error: ${error}`);
    }

    return await response.json();
  }

  /**
   * Create an activity/note in HubSpot
   */
  async createNote(contactId, noteText) {
    const response = await fetch(`${this.baseUrl}/crm/v3/objects/notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: noteText
        },
        associations: [{
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot API error: ${error}`);
    }

    return await response.json();
  }

  /**
   * Map internal status to HubSpot lead status
   */
  mapStatusToHubSpot(status) {
    const statusMap = {
      'new': 'NEW',
      'called': 'CONTACTED',
      'interested': 'QUALIFIED',
      'booked': 'APPOINTMENTSCHEDULED',
      'not_interested': 'UNQUALIFIED',
      'no_answer': 'NOT_CONTACTED'
    };
    return statusMap[status] || 'NEW';
  }

  /**
   * Sync all data for a client
   */
  async syncAll(clientKey, options = {}) {
    const { syncLeads = true, syncCalls = true, syncAppointments = true, limit = 100 } = options;
    const results = {
      contacts: { created: 0, updated: 0, errors: 0 },
      deals: { created: 0, errors: 0 },
      notes: { created: 0, errors: 0 }
    };

    try {
      // Sync leads
      if (syncLeads) {
        const leads = await query(`
          SELECT id, name, phone, email, source, status, notes, created_at
          FROM leads
          WHERE client_key = $1
          ORDER BY created_at DESC
          LIMIT $2
        `, [clientKey, limit]);

        for (const lead of leads.rows) {
          try {
            const result = await this.syncContact({ ...lead, clientKey });
            if (result.created) results.contacts.created++;
            if (result.updated) results.contacts.updated++;
          } catch (error) {
            console.error(`[HUBSPOT] Error syncing lead ${lead.id}:`, error.message);
            results.contacts.errors++;
            
            // Log error for tracking
            await logCrmError(error, 'hubspot', 'syncLead', clientKey, { leadId: lead.id });
          }
        }
      }

      // Sync appointments (as deals)
      if (syncAppointments) {
        const appointments = await query(`
          SELECT a.id, a.start_iso, a.end_iso, a.status, l.name, l.phone, l.email
          FROM appointments a
          LEFT JOIN leads l ON a.lead_id = l.id
          WHERE a.client_key = $1
          ORDER BY a.start_iso DESC
          LIMIT $2
        `, [clientKey, limit]);

        for (const apt of appointments.rows) {
          try {
            // First ensure contact exists
            let contactId = null;
            if (apt.email || apt.phone) {
              const contactResult = await this.syncContact({
                name: apt.name,
                phone: apt.phone,
                email: apt.email,
                status: apt.status
              });
              contactId = contactResult.id;
            }

            // Create deal for appointment
            await this.createDeal({
              contactId,
              dealName: `Appointment - ${apt.name || 'Lead'}`,
              amount: 0,
              stage: 'appointmentscheduled',
              closeDate: apt.start_iso
            });
            results.deals.created++;
          } catch (error) {
            console.error(`[HUBSPOT] Error syncing appointment ${apt.id}:`, error.message);
            results.deals.errors++;
          }
        }
      }

      return results;
    } catch (error) {
      console.error('[HUBSPOT] Error in syncAll:', error);
      throw error;
    }
  }
}

/**
 * Salesforce CRM Integration
 */
export class SalesforceIntegration {
  constructor(credentials) {
    this.instanceUrl = credentials.instanceUrl;
    this.accessToken = credentials.accessToken;
    this.apiVersion = credentials.apiVersion || 'v58.0';
  }

  /**
   * Authenticate with Salesforce (OAuth2)
   */
  async authenticate(clientId, clientSecret, username, password, securityToken) {
    try {
      const response = await fetch('https://login.salesforce.com/services/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: clientId,
          client_secret: clientSecret,
          username: username,
          password: password + securityToken
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Salesforce authentication error: ${error}`);
      }

      const data = await response.json();
      this.instanceUrl = data.instance_url;
      this.accessToken = data.access_token;
      return data;
    } catch (error) {
      console.error('[SALESFORCE] Authentication error:', error);
      throw error;
    }
  }

  /**
   * Create or update a lead in Salesforce
   */
  async syncLead(leadData) {
    try {
      const { name, phone, email, source, status, notes } = leadData;
      
      // Salesforce Lead object fields
      const fields = {
        LastName: name?.split(' ').slice(-1)[0] || 'Lead',
        FirstName: name?.split(' ').slice(0, -1).join(' ') || '',
        Phone: phone,
        Email: email || null,
        LeadSource: source || 'AI Booking System',
        Status: this.mapStatusToSalesforce(status),
        ...(notes && { Description: notes })
      };

      // Check if lead exists
      let leadId = await this.findLead(phone, email);

      if (leadId) {
        // Update existing lead
        return await this.updateLead(leadId, fields, leadData.clientKey);
      } else {
        // Create new lead
        return await this.createLead(fields, leadData.clientKey);
      }
    } catch (error) {
      console.error('[SALESFORCE] Error syncing lead:', error);
      
      // Log error if clientKey available
      if (leadData.clientKey) {
        await logCrmError(error, 'salesforce', 'syncLead', leadData.clientKey, { leadData });
        await trackSyncFailure(leadData.clientKey, 'salesforce', 'syncLead', error, { leadData });
      }
      
      throw error;
    }
  }

  /**
   * Create a new lead in Salesforce (with retry logic)
   */
  async createLead(fields, clientKey = null) {
    return executeWithRetry(async () => {
      const response = await fetch(
        `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/Lead/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fields)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Salesforce API error: ${errorText}`);
        error.status = response.status;
        
        // Log error if clientKey provided
        if (clientKey) {
          await logCrmError(error, 'salesforce', 'createLead', clientKey, { fields });
          await trackSyncFailure(clientKey, 'salesforce', 'createLead', error, { fields });
        }
        
        throw error;
      }

      const data = await response.json();
      return { id: data.id, created: true };
    }, { operation: 'createLead', crmType: 'salesforce' });
  }

  /**
   * Update an existing lead in Salesforce (with retry logic)
   */
  async updateLead(leadId, fields, clientKey = null) {
    return executeWithRetry(async () => {
      const response = await fetch(
        `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/Lead/${leadId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fields)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Salesforce API error: ${errorText}`);
        error.status = response.status;
        
        // Log error if clientKey provided
        if (clientKey) {
          await logCrmError(error, 'salesforce', 'updateLead', clientKey, { leadId, fields });
          await trackSyncFailure(clientKey, 'salesforce', 'updateLead', error, { leadId, fields });
        }
        
        throw error;
      }

      return { id: leadId, updated: true };
    }, { operation: 'updateLead', crmType: 'salesforce' });
  }

  /**
   * Find lead by phone or email
   */
  async findLead(phone, email) {
    try {
      let query = 'SELECT Id FROM Lead WHERE ';
      const conditions = [];
      
      if (phone) conditions.push(`Phone = '${phone.replace(/'/g, "''")}'`);
      if (email) conditions.push(`Email = '${email.replace(/'/g, "''")}'`);
      
      if (conditions.length === 0) return null;
      
      query += conditions.join(' OR ') + ' LIMIT 1';

      const response = await fetch(
        `${this.instanceUrl}/services/data/v${this.apiVersion}/query/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.records?.[0]?.Id || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create an event (appointment) in Salesforce
   */
  async createEvent(eventData) {
    const { leadId, subject, startDateTime, endDateTime, description } = eventData;
    
    const fields = {
      Subject: subject || 'Appointment',
      StartDateTime: startDateTime,
      EndDateTime: endDateTime,
      ...(description && { Description: description }),
      ...(leadId && { WhoId: leadId })
    };

    const response = await fetch(
      `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/Event/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fields)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Salesforce API error: ${error}`);
    }

    return await response.json();
  }

  /**
   * Map internal status to Salesforce lead status
   */
  mapStatusToSalesforce(status) {
    const statusMap = {
      'new': 'Open - Not Contacted',
      'called': 'Working - Contacted',
      'interested': 'Working - Qualified',
      'booked': 'Qualified - Appointment Set',
      'not_interested': 'Unqualified',
      'no_answer': 'Open - Not Contacted'
    };
    return statusMap[status] || 'Open - Not Contacted';
  }

  /**
   * Sync all data for a client
   */
  async syncAll(clientKey, options = {}) {
    const { syncLeads = true, syncAppointments = true, limit = 100 } = options;
    const results = {
      leads: { created: 0, updated: 0, errors: 0 },
      events: { created: 0, errors: 0 }
    };

    try {
      // Sync leads
      if (syncLeads) {
        const leads = await query(`
          SELECT id, name, phone, email, source, status, notes, created_at
          FROM leads
          WHERE client_key = $1
          ORDER BY created_at DESC
          LIMIT $2
        `, [clientKey, limit]);

        for (const lead of leads.rows) {
          try {
            const result = await this.syncLead({ ...lead, clientKey });
            if (result.created) results.leads.created++;
            if (result.updated) results.leads.updated++;
          } catch (error) {
            console.error(`[SALESFORCE] Error syncing lead ${lead.id}:`, error.message);
            results.leads.errors++;
            
            // Log error for tracking
            await logCrmError(error, 'salesforce', 'syncLead', clientKey, { leadId: lead.id });
          }
        }
      }

      // Sync appointments (as Events)
      if (syncAppointments) {
        const appointments = await query(`
          SELECT a.id, a.start_iso, a.end_iso, a.status, l.name, l.phone, l.email
          FROM appointments a
          LEFT JOIN leads l ON a.lead_id = l.id
          WHERE a.client_key = $1
          ORDER BY a.start_iso DESC
          LIMIT $2
        `, [clientKey, limit]);

        for (const apt of appointments.rows) {
          try {
            // First ensure lead exists
            let leadId = null;
            if (apt.email || apt.phone) {
              const leadResult = await this.syncLead({
                name: apt.name,
                phone: apt.phone,
                email: apt.email,
                status: apt.status
              });
              leadId = leadResult.id;
            }

            // Create event for appointment
            await this.createEvent({
              leadId,
              subject: `Appointment - ${apt.name || 'Lead'}`,
              startDateTime: apt.start_iso,
              endDateTime: apt.end_iso,
              description: `Appointment booked via AI Booking System`
            });
            results.events.created++;
          } catch (error) {
            console.error(`[SALESFORCE] Error syncing appointment ${apt.id}:`, error.message);
            results.events.errors++;
          }
        }
      }

      return results;
    } catch (error) {
      console.error('[SALESFORCE] Error in syncAll:', error);
      throw error;
    }
  }
}

/**
 * Store CRM integration settings in database
 */
export async function saveCrmSettings(clientKey, crmType, settings) {
  try {
    // Check if record exists
    const existing = await query(`
      SELECT id FROM crm_integrations
      WHERE client_key = $1 AND crm_type = $2
    `, [clientKey, crmType]);

    if (existing.rows.length > 0) {
      // Update existing
      await query(`
        UPDATE crm_integrations
        SET settings = $3, updated_at = NOW()
        WHERE client_key = $1 AND crm_type = $2
      `, [clientKey, crmType, JSON.stringify(settings)]);
    } else {
      // Insert new
      await query(`
        INSERT INTO crm_integrations (client_key, crm_type, settings, enabled, created_at)
        VALUES ($1, $2, $3, true, NOW())
      `, [clientKey, crmType, JSON.stringify(settings)]);
    }
  } catch (error) {
    console.error('[CRM] Error saving settings:', error);
    throw error;
  }
}

/**
 * Get CRM integration settings from database
 */
export async function getCrmSettings(clientKey) {
  try {
    const result = await query(`
      SELECT crm_type, settings, enabled, last_sync_at, created_at, updated_at
      FROM crm_integrations
      WHERE client_key = $1
    `, [clientKey]);

    const integrations = {
      hubspot: {
        enabled: false,
        connected: false,
        lastSync: null
      },
      salesforce: {
        enabled: false,
        connected: false,
        lastSync: null
      }
    };

    for (const row of result.rows) {
      const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
      integrations[row.crm_type] = {
        enabled: row.enabled,
        connected: !!settings.apiKey || !!settings.accessToken,
        lastSync: row.last_sync_at,
        settings: settings
      };
    }

    return integrations;
  } catch (error) {
    console.error('[CRM] Error getting settings:', error);
    // Return defaults if table doesn't exist yet
    return {
      hubspot: { enabled: false, connected: false, lastSync: null },
      salesforce: { enabled: false, connected: false, lastSync: null }
    };
  }
}

/**
 * Update last sync timestamp
 */
export async function updateLastSync(clientKey, crmType) {
  try {
    await query(`
      UPDATE crm_integrations
      SET last_sync_at = NOW()
      WHERE client_key = $1 AND crm_type = $2
    `, [clientKey, crmType]);
  } catch (error) {
    // Silently fail if table doesn't exist
    console.warn('[CRM] Could not update last sync:', error.message);
  }
}

