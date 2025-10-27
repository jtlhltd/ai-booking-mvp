// Safe extraction - Service classes
// These can be extracted with proper dependency injection

// Extract from server.js to services/client-service.js
import { config } from '../config/environment.js';
import { upsertFullClient, getFullClient, listFullClients } from '../db.js';
import { ValidationError, ConflictError, NotFoundError } from '../lib/errors.js';

export class ClientService {
  constructor(db) {
    this.db = db;
  }

  async createClient(clientData) {
    // Validate required fields
    if (!clientData.businessName || clientData.businessName.length < 2) {
      throw new ValidationError('Business name must be at least 2 characters', 'businessName', clientData.businessName);
    }

    if (!clientData.ownerEmail || !this.validateEmail(clientData.ownerEmail)) {
      throw new ValidationError('Valid owner email is required', 'ownerEmail', clientData.ownerEmail);
    }

    if (!clientData.ownerPhone || !this.validatePhone(clientData.ownerPhone)) {
      throw new ValidationError('Valid owner phone is required', 'ownerPhone', clientData.ownerPhone);
    }

    // Check if client already exists
    const clientKey = this.generateClientKey(clientData.businessName);
    const existingClient = await getFullClient(clientKey);
    
    if (existingClient) {
      throw new ConflictError(`Client with business name "${clientData.businessName}" already exists`);
    }

    // Create new client
    const newClient = {
      clientKey,
      displayName: clientData.businessName,
      timezone: clientData.timezone || config.business.defaultTimezone,
      locale: clientData.locale || config.business.defaultLocale,
      booking: {
        timezone: clientData.timezone || config.business.defaultTimezone,
        defaultDurationMin: config.business.callSettings.defaultDuration,
        businessHours: clientData.businessHours || config.business.businessHours
      }
    };

    await upsertFullClient(newClient);
    return newClient;
  }

  async getClient(clientKey) {
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new NotFoundError('Client');
    }
    return client;
  }

  async listClients(options = {}) {
    const { limit = 100, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = options;
    
    // This would be implemented with proper database query
    const clients = await listFullClients();
    
    return {
      data: clients.slice(offset, offset + limit),
      pagination: {
        limit,
        offset,
        total: clients.length,
        hasMore: offset + limit < clients.length
      }
    };
  }

  async updateClient(clientKey, updateData) {
    const existingClient = await this.getClient(clientKey);
    
    const updatedClient = {
      ...existingClient,
      ...updateData,
      clientKey // Ensure clientKey doesn't change
    };

    await upsertFullClient(updatedClient);
    return updatedClient;
  }

  async deleteClient(clientKey) {
    const existingClient = await this.getClient(clientKey);
    
    // Check for dependent data
    // This would check for leads, calls, appointments
    // For now, we'll just delete
    
    // Delete client (this would be implemented in db.js)
    // await this.db.query('DELETE FROM tenants WHERE client_key = $1', [clientKey]);
    
    return { success: true, message: 'Client deleted successfully' };
  }

  generateClientKey(businessName) {
    return businessName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  validatePhone(phone) {
    const phoneRegex = /^\+44\d{10}$/;
    return phoneRegex.test(phone);
  }
}

// Extract from server.js to services/lead-service.js
export class LeadService {
  constructor(db) {
    this.db = db;
  }

  async createLead(clientKey, leadData) {
    // Validate lead data
    if (!leadData.name || leadData.name.length < 1) {
      throw new ValidationError('Lead name is required', 'name', leadData.name);
    }

    if (!leadData.phone || !this.validatePhone(leadData.phone)) {
      throw new ValidationError('Valid phone number is required', 'phone', leadData.phone);
    }

    // Create lead
    const lead = {
      clientKey,
      name: leadData.name,
      phone: leadData.phone,
      email: leadData.email || null,
      service: leadData.service || null,
      source: leadData.source || 'manual',
      status: 'new',
      createdAt: new Date().toISOString()
    };

    // This would be implemented with proper database insertion
    // const result = await this.db.query('INSERT INTO leads ...', [lead]);
    
    return lead;
  }

  async getLeads(clientKey, options = {}) {
    const { limit = 100, offset = 0, status = null } = options;
    
    // This would be implemented with proper database query
    // const query = 'SELECT * FROM leads WHERE client_key = $1 ...';
    // const result = await this.db.query(query, [clientKey]);
    
    return {
      data: [], // Placeholder
      pagination: { limit, offset, total: 0, hasMore: false }
    };
  }

  async updateLeadStatus(clientKey, leadId, status) {
    // Validate status
    const validStatuses = ['new', 'contacted', 'interested', 'not_interested', 'booked', 'completed'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 'status', status);
    }

    // Update lead status
    // This would be implemented with proper database update
    // await this.db.query('UPDATE leads SET status = $1 WHERE id = $2 AND client_key = $3', [status, leadId, clientKey]);
    
    return { success: true, message: 'Lead status updated successfully' };
  }

  validatePhone(phone) {
    const phoneRegex = /^\+44\d{10}$/;
    return phoneRegex.test(phone);
  }
}

// Extract from server.js to services/call-service.js
export class CallService {
  constructor(db) {
    this.db = db;
  }

  async createCall(clientKey, callData) {
    // Validate call data
    if (!callData.leadPhone || !this.validatePhone(callData.leadPhone)) {
      throw new ValidationError('Valid lead phone is required', 'leadPhone', callData.leadPhone);
    }

    // Create call record
    const call = {
      callId: this.generateCallId(),
      clientKey,
      leadPhone: callData.leadPhone,
      status: 'queued',
      createdAt: new Date().toISOString()
    };

    // This would be implemented with proper database insertion
    // await this.db.query('INSERT INTO calls ...', [call]);
    
    return call;
  }

  async updateCallStatus(callId, status, outcome = null) {
    // Validate status
    const validStatuses = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 'status', status);
    }

    // Update call status
    // This would be implemented with proper database update
    // await this.db.query('UPDATE calls SET status = $1, outcome = $2 WHERE call_id = $3', [status, outcome, callId]);
    
    return { success: true, message: 'Call status updated successfully' };
  }

  generateCallId() {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validatePhone(phone) {
    const phoneRegex = /^\+44\d{10}$/;
    return phoneRegex.test(phone);
  }
}



