// CRM Integration Library
// Handles syncing leads, calls, and appointments to HubSpot and Salesforce

import { query } from '../db.js';

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
        return await this.updateContact(contactId, properties);
      } else {
        // Create new contact
        return await this.createContact(properties);
      }
    } catch (error) {
      console.error('[HUBSPOT] Error syncing contact:', error);
      throw error;
    }
  }

  /**
   * Create a new contact in HubSpot
   */
  async createContact(properties) {
    const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot API error: ${error}`);
    }

    const data = await response.json();
    return { id: data.id, created: true };
  }

  /**
   * Update an existing contact in HubSpot
   */
  async updateContact(contactId, properties) {
    const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot API error: ${error}`);
    }

    return { id: contactId, updated: true };
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
            const result = await this.syncContact(lead);
            if (result.created) results.contacts.created++;
            if (result.updated) results.contacts.updated++;
          } catch (error) {
            console.error(`[HUBSPOT] Error syncing lead ${lead.id}:`, error.message);
            results.contacts.errors++;
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
        return await this.updateLead(leadId, fields);
      } else {
        // Create new lead
        return await this.createLead(fields);
      }
    } catch (error) {
      console.error('[SALESFORCE] Error syncing lead:', error);
      throw error;
    }
  }

  /**
   * Create a new lead in Salesforce
   */
  async createLead(fields) {
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
      const error = await response.text();
      throw new Error(`Salesforce API error: ${error}`);
    }

    const data = await response.json();
    return { id: data.id, created: true };
  }

  /**
   * Update an existing lead in Salesforce
   */
  async updateLead(leadId, fields) {
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
      const error = await response.text();
      throw new Error(`Salesforce API error: ${error}`);
    }

    return { id: leadId, updated: true };
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
            const result = await this.syncLead(lead);
            if (result.created) results.leads.created++;
            if (result.updated) results.leads.updated++;
          } catch (error) {
            console.error(`[SALESFORCE] Error syncing lead ${lead.id}:`, error.message);
            results.leads.errors++;
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

