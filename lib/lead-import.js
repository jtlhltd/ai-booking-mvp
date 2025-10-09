// lib/lead-import.js
// Lead import system for clients to send their leads

import { findOrCreateLead } from '../db.js';
import { validatePhoneNumber } from './phone-validation.js';

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
 * Import leads for a client with validation
 * @param {string} clientKey - Client identifier
 * @param {Array} leads - Array of lead objects
 * @param {Object} options - Import options
 * @returns {Object} - Import results
 */
export async function importLeads(clientKey, leads, options = {}) {
  const {
    validatePhones = false,
    skipDuplicates = true,
    autoStartCampaign = false
  } = options;
  
  console.log(`[LEAD IMPORT] Starting import for ${clientKey}: ${leads.length} leads`);
  
  const results = {
    total: leads.length,
    imported: 0,
    skipped: 0,
    invalid: 0,
    duplicates: 0,
    validated: 0,
    errors: []
  };
  
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
      
      // Check for duplicates
      if (skipDuplicates) {
        const existing = await findOrCreateLead({
          tenantKey: clientKey,
          phone: lead.phone,
          name: lead.name,
          service: lead.service,
          source: lead.source
        });
        
        if (existing && existing.id) {
          // Lead already exists
          results.duplicates++;
          continue;
        }
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
      
      // Import lead
      await findOrCreateLead({
        tenantKey: clientKey,
        phone: lead.phone,
        name: lead.name,
        service: lead.service,
        source: lead.source
      });
      
      results.imported++;
      
      if (results.imported % 50 === 0) {
        console.log(`[LEAD IMPORT] Progress: ${results.imported}/${leads.length}`);
      }
      
    } catch (error) {
      results.skipped++;
      results.errors.push({
        row: lead.rowNumber,
        error: error.message,
        data: lead
      });
    }
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

