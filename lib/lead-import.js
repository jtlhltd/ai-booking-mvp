// lib/lead-import.js
// Lead import system for clients to send their leads

import { upsertImportedLead } from '../db.js';
import { normalizeLeadDialContext, serializeLeadDialContextEnvelope } from './lead-dial-context.js';
import { validatePhoneNumber } from './phone-validation.js';
import { phoneMatchKey } from './lead-phone-key.js';

/**
 * Parse CSV data into lead objects
 * @param {string} csvData - CSV content
 * @param {Object} mapping - Column mapping config
 * @returns {Array} - Parsed lead objects
 */
export function parseCSV(csvData, mapping = {}) {
  const lines = csvData.trim().split('\n');
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  // Default column mapping (flexible)
  const columnMap = {
    name: mapping.name || findColumn(headers, ['name', 'full name', 'contact name', 'lead name']),
    phone: mapping.phone || findColumn(headers, ['phone', 'mobile', 'telephone', 'contact number', 'phone number']),
    email: mapping.email || findColumn(headers, ['email', 'email address', 'e-mail']),
    service: mapping.service || findColumn(headers, ['service', 'interest', 'product', 'inquiry']),
    source: mapping.source || findColumn(headers, ['source', 'lead source', 'campaign', 'utm_source']),
    notes: mapping.notes || findColumn(headers, ['notes', 'comments', 'message', 'details'])
  };
  const leadDialContextMap =
    mapping.leadDialContext && typeof mapping.leadDialContext === 'object' && !Array.isArray(mapping.leadDialContext)
      ? mapping.leadDialContext
      : mapping.dialContext && typeof mapping.dialContext === 'object' && !Array.isArray(mapping.dialContext)
        ? mapping.dialContext
        : null;
  
  console.log('[CSV IMPORT] Column mapping:', columnMap);
  
  // Parse data rows
  const leads = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const values = parseCSVLine(line);
    
    const lead = {
      name: values[columnMap.name] || '',
      phone: values[columnMap.phone] || '',
      email: values[columnMap.email] || '',
      service: values[columnMap.service] || '',
      source: values[columnMap.source] || 'csv_import',
      notes: values[columnMap.notes] || '',
      importedAt: new Date().toISOString(),
      rowNumber: i
    };
    const leadDialContext = mapLeadDialContextFromCsvRow(values, headers, leadDialContextMap);
    if (Object.keys(leadDialContext).length > 0) {
      lead.leadDialContext = leadDialContext;
    }
    
    // Validate required fields
    if (!lead.phone) {
      console.warn(`[CSV IMPORT] Row ${i}: Missing phone number, skipping`);
      continue;
    }
    
    leads.push(lead);
  }
  
  console.log(`[CSV IMPORT] Parsed ${leads.length} leads from ${lines.length - 1} rows`);
  
  return leads;
}

function resolveMappedColumnIndex(headers, selector) {
  if (typeof selector === 'number' && Number.isInteger(selector) && selector >= 0) return selector;
  const raw = String(selector || '').trim().toLowerCase();
  if (!raw) return -1;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const exact = headers.findIndex((header) => header === raw);
  if (exact !== -1) return exact;
  return headers.findIndex((header) => header.includes(raw));
}

function mapLeadDialContextFromCsvRow(values, headers, mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return {};
  const raw = {};
  for (const [contextKey, selector] of Object.entries(mapping)) {
    const idx = resolveMappedColumnIndex(headers, selector);
    if (idx < 0) continue;
    const value = String(values[idx] || '').trim();
    if (!value) continue;
    raw[contextKey] = value;
  }
  const preferEnvelope =
    Object.prototype.hasOwnProperty.call(raw, 'variableValues') ||
    Object.prototype.hasOwnProperty.call(raw, 'firstMessage') ||
    Object.prototype.hasOwnProperty.call(raw, 'systemMessage');
  return preferEnvelope
    ? serializeLeadDialContextEnvelope(raw, { preferEnvelope: true })
    : normalizeLeadDialContext(raw);
}

/**
 * Parse a single CSV line (handles quoted values)
 * @param {string} line - CSV line
 * @returns {Array} - Parsed values
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Find column index by possible names
 * @param {Array} headers - Header array
 * @param {Array} possibleNames - Possible column names
 * @returns {number} - Column index or 0
 */
function findColumn(headers, possibleNames) {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => h.includes(name));
    if (index !== -1) return index;
  }
  return 0; // Default to first column if not found
}

/**
 * Import leads for a client with validation (uses batch inserts for performance)
 * @param {string} clientKey - Client identifier
 * @param {Array} leads - Array of lead objects
 * @param {Object} options - Import options
 * @returns {Object} - Import results
 */
export async function importLeads(clientKey, leads, options = {}) {
  const {
    validatePhones = false,
    skipDuplicates = true,
    autoStartCampaign = false,
    batchSize = 100 // Insert 100 leads at a time
  } = options;
  
  console.log(`[LEAD IMPORT] Starting batch import for ${clientKey}: ${leads.length} leads`);
  
  const results = {
    total: leads.length,
    imported: 0,
    skipped: 0,
    invalid: 0,
    duplicates: 0,
    validated: 0,
    errors: []
  };
  
  // Prepare leads for batch insert
  const validLeads = [];
  
  for (const lead of leads) {
    try {
      // Validate phone number format
      if (!lead.phone || lead.phone.length < 10) {
        results.invalid++;
        results.errors.push({
          row: lead.rowNumber,
          error: 'Invalid phone number',
          data: lead
        });
        continue;
      }
      
      // Optional: Validate with Twilio
      if (validatePhones) {
        const validation = await validatePhoneNumber(lead.phone);
        if (!validation.valid || validation.lineType !== 'mobile') {
          results.invalid++;
          results.errors.push({
            row: lead.rowNumber,
            error: `Invalid or non-mobile number (${validation.lineType})`,
            data: lead
          });
          continue;
        }
        results.validated++;
      }
      
      validLeads.push(lead);
      
    } catch (error) {
      results.skipped++;
      results.errors.push({
        row: lead.rowNumber,
        error: error.message,
        data: lead
      });
    }
  }
  
  // Batch insert valid leads
  if (validLeads.length > 0) {
    const batchResults = await batchInsertLeads(clientKey, validLeads, {
      batchSize,
      skipDuplicates
    });
    
    results.imported = batchResults.inserted;
    results.duplicates = batchResults.duplicates;
  }
  
  console.log(`[LEAD IMPORT] Complete for ${clientKey}:`, {
    imported: results.imported,
    duplicates: results.duplicates,
    invalid: results.invalid,
    skipped: results.skipped
  });
  
  return results;
}

/**
 * Batch insert leads for 10x faster imports
 * @param {string} clientKey - Client identifier
 * @param {Array} leads - Array of lead objects
 * @param {Object} options - Insert options
 * @returns {Object} - Insert results
 */
async function batchInsertLeads(clientKey, leads, options = {}) {
  const { batchSize = 100, skipDuplicates = true } = options;
  const { query } = await import('../db.js');
  
  let inserted = 0;
  let duplicates = 0;
  
  // Process in batches
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const validBatch = batch.filter((l) => phoneMatchKey(l.phone));
    const batchHasDialContext = validBatch.some(
      (lead) => lead.leadDialContext && typeof lead.leadDialContext === 'object' && Object.keys(lead.leadDialContext).length > 0
    );
    
    try {
      if (!validBatch.length) {
        duplicates += batch.length;
        continue;
      }
      if (batchHasDialContext) {
        for (const lead of validBatch) {
          const result = await upsertImportedLead({
            clientKey,
            name: lead.name || '',
            phone: lead.phone,
            service: lead.service || 'consultation',
            source: lead.source || 'csv_import',
            leadDialContext: lead.leadDialContext || null,
          });
          if (result.created) inserted += 1;
          else duplicates += 1;
        }
        duplicates += batch.length - validBatch.length;
        continue;
      }
      // Build VALUES clause for batch insert
      const values = [];
      const params = [];
      let paramCount = 1;
      
      for (const lead of validBatch) {
        const mk = phoneMatchKey(lead.phone);
        values.push(
          `($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3}, $${paramCount + 4}, $${paramCount + 5}, NOW())`
        );
        params.push(
          clientKey,
          lead.name || '',
          lead.phone,
          mk,
          lead.service || 'consultation',
          lead.source || 'csv_import'
        );
        paramCount += 6;
      }
      
      // Batch insert with ON CONFLICT handling (same identity as dashboard: phone_match_key)
      const sql = `
        INSERT INTO leads (client_key, name, phone, phone_match_key, service, source, created_at)
        VALUES ${values.join(', ')}
        ${skipDuplicates ? 'ON CONFLICT (client_key, phone_match_key) DO NOTHING' : ''}
        RETURNING id
      `;
      
      const result = await query(sql, params);
      
      const insertedInBatch = Array.isArray(result.rows) ? result.rows.length : 0;
      inserted += insertedInBatch;
      duplicates += validBatch.length - insertedInBatch + (batch.length - validBatch.length);
      
      console.log(`[BATCH INSERT] Inserted ${insertedInBatch}/${validBatch.length} leads (batch ${Math.floor(i/batchSize) + 1})`);
      
    } catch (error) {
      // Fallback to one-by-one if batch fails
      console.warn(`[BATCH INSERT] Batch failed, falling back to individual inserts:`, error.message);
      
      for (const lead of batch) {
        try {
          const existing = await upsertImportedLead({
            clientKey,
            phone: lead.phone,
            name: lead.name,
            service: lead.service,
            source: lead.source,
            leadDialContext: lead.leadDialContext || null,
          });
          
          if (existing && !existing.created) {
            duplicates++;
          } else {
            inserted++;
          }
        } catch (individualError) {
          console.error(`[LEAD IMPORT] Failed to import ${lead.phone}:`, individualError.message);
        }
      }
    }
  }
  
  return { inserted, duplicates };
}

/**
 * Parse email body to extract lead information
 * Common for contact form emails, inquiry notifications
 * @param {string} emailBody - Email body text
 * @param {string} emailSubject - Email subject
 * @returns {Object} - Extracted lead data
 */
export function parseEmailForLead(emailBody, emailSubject = '') {
  const lead = {
    name: '',
    phone: '',
    email: '',
    service: '',
    source: 'email_forward',
    notes: emailBody.substring(0, 500) // Store first 500 chars as notes
  };
  
  // Extract name
  const namePatterns = [
    /name:?\s*([^\n]+)/i,
    /from:?\s*([^\n]+)/i,
    /contact:?\s*([^\n]+)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = emailBody.match(pattern);
    if (match) {
      lead.name = match[1].trim();
      break;
    }
  }
  
  // Extract phone
  const phonePattern = /(?:phone|mobile|tel|telephone|contact number):?\s*([\+\d\s\(\)\-]{10,20})/i;
  const phoneMatch = emailBody.match(phonePattern);
  if (phoneMatch) {
    lead.phone = phoneMatch[1].trim();
  }
  
  // Extract email
  const emailPattern = /(?:email|e-mail):?\s*([^\s]+@[^\s]+)/i;
  const emailMatch = emailBody.match(emailPattern);
  if (emailMatch) {
    lead.email = emailMatch[1].trim();
  } else {
    // Try to find any email in the body
    const genericEmailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const genericMatch = emailBody.match(genericEmailPattern);
    if (genericMatch) {
      lead.email = genericMatch[1].trim();
    }
  }
  
  // Extract service/interest from subject
  if (emailSubject) {
    lead.service = emailSubject.replace(/^(re:|fwd:)\s*/i, '').trim();
  }
  
  return lead;
}

