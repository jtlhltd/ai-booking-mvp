// sheets.js (ESM)
import { google } from 'googleapis';

let sheetsClient;
async function getClient() {
  if (sheetsClient) return sheetsClient;

  let creds;
  if (process.env.GOOGLE_SA_JSON_BASE64) {
    try {
      creds = JSON.parse(Buffer.from(process.env.GOOGLE_SA_JSON_BASE64, 'base64').toString('utf8'));
      console.log('[GOOGLE AUTH] Loaded credentials from GOOGLE_SA_JSON_BASE64');
    } catch (error) {
      console.error('[GOOGLE AUTH ERROR] Failed to parse GOOGLE_SA_JSON_BASE64:', error.message);
      throw new Error('Invalid GOOGLE_SA_JSON_BASE64 format');
    }
  } else {
    console.error('[GOOGLE AUTH ERROR] GOOGLE_SA_JSON_BASE64 environment variable not set');
    throw new Error('Google Service Account credentials not configured');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export const HEADERS = [
  'Lead ID','Name','Phone','Service','Source',
  'Status','Attempts','Last Attempt At','Booked?','Booking Start','Booking End','Notes'
];

// Logistics extraction headers (strict script fields)
export const LOGISTICS_HEADERS = [
  'Timestamp','Business Name','Decision Maker','Phone','Email','International (Y/N)',
  'Main Couriers','Frequency','Main Countries','Example Shipment (weight x dims)','Example Shipment Cost',
  'Domestic Frequency','UK Courier','Std Rate up to KG','Excl Fuel & VAT?','Single vs Multi-parcel',
  'Receptionist Name','Callback Needed','Call ID','Recording URI','Transcript Snippet'
];

export async function ensureHeader(spreadsheetId) {
  const s = await getClient();
  await s.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:L1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] }
  });
}

export async function ensureLogisticsHeader(spreadsheetId) {
  const s = await getClient();
  await s.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:U1',
    valueInputOption: 'RAW',
    requestBody: { values: [LOGISTICS_HEADERS] }
  });
}

export async function appendLead(spreadsheetId, lead) {
  const s = await getClient();
  await ensureHeader(spreadsheetId);
  const row = [
    lead.id, lead.name, lead.phone, lead.service,
    lead.source || '', lead.status || 'pending', lead.attempts || 0,
    lead.last_attempt_at || '', lead.booked ? 'TRUE' : 'FALSE',
    lead.booking_start || '', lead.booking_end || '', lead.notes || ''
  ];
  const res = await s.spreadsheets.values.append({
    spreadsheetId, range: 'Sheet1!A:L',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
  const updatedRange = res.data.updates?.updatedRange || '';
  const m = updatedRange.match(/!(?:[A-Z]+)(\d+):/);
  return { rowNumber: m ? parseInt(m[1], 10) : null };
}

export async function appendLogistics(spreadsheetId, data) {
  const s = await getClient();
  await ensureLogisticsHeader(spreadsheetId);
  
  // Map data to exact column positions using an object
  const columnData = {
    'Timestamp': new Date().toISOString(),
    'Business Name': data.businessName || '',
    'Decision Maker': data.decisionMaker || '',
    'Phone': data.phone || '',
    'Email': data.email || '',
    'International (Y/N)': data.international || '',
    'Main Couriers': Array.isArray(data.mainCouriers) ? data.mainCouriers.join(', ') : (data.mainCouriers || ''),
    'Frequency': data.frequency || '',
    'Main Countries': Array.isArray(data.mainCountries) ? data.mainCountries.join(', ') : (data.mainCountries || ''),
    'Example Shipment (weight x dims)': data.exampleShipment || '',
    'Example Shipment Cost': data.exampleShipmentCost || '',
    'Domestic Frequency': data.domesticFrequency || '',
    'UK Courier': data.ukCourier || '',
    'Std Rate up to KG': data.standardRateUpToKg || '',
    'Excl Fuel & VAT?': data.excludingFuelVat || '',
    'Single vs Multi-parcel': data.singleVsMulti || '',
    'Receptionist Name': data.receptionistName || '',
    'Callback Needed': (data.callbackNeeded === true || data.callbackNeeded === 'TRUE') ? 'TRUE' : 'FALSE',
    'Call ID': data.callId || '',
    'Recording URI': data.recordingUrl || '',
    'Transcript Snippet': (data.transcriptSnippet || '').slice(0, 300)
  };
  
  // Build row array in exact header order
  const row = LOGISTICS_HEADERS.map(header => columnData[header] || '');
  
  console.log('[SHEETS DEBUG] Column mapping:', JSON.stringify(columnData, null, 2));
  console.log('[SHEETS DEBUG] Row being written:', JSON.stringify(row, null, 2));
  
  // Verify each column matches its header
  for (let i = 0; i < LOGISTICS_HEADERS.length && i < row.length; i++) {
    console.log(`[SHEETS DEBUG] Column ${i + 1} (${LOGISTICS_HEADERS[i]}): "${row[i]}"`);
  }
  
  await s.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:U',  // Fixed: Should be A:U (21 columns), not A:T (20 columns)
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

export async function updateLogisticsRowByPhone(spreadsheetId, phone, updates) {
  const s = await getClient();
  
  try {
    // Read all rows to find the one with matching phone
    const response = await s.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:U'
    });
    
    const rows = response.data.values || [];
    if (rows.length < 2) return false; // No data rows (header only)
    
    // Find row index by phone (column D, index 3)
    const phoneColumnIndex = 3; // Column D (0-indexed: A=0, B=1, C=2, D=3)
    let rowIndex = -1;
    
    for (let i = 1; i < rows.length; i++) { // Start from row 2 (skip header)
      const rowPhone = rows[i][phoneColumnIndex] || '';
      // Normalize phone numbers for comparison
      const normalizedRowPhone = rowPhone.replace(/\s+/g, '').replace(/^\+/, '');
      const normalizedSearchPhone = phone.replace(/\s+/g, '').replace(/^\+/, '');
      
      if (normalizedRowPhone === normalizedSearchPhone || 
          normalizedRowPhone.endsWith(normalizedSearchPhone) ||
          normalizedSearchPhone.endsWith(normalizedRowPhone)) {
        // Check if this row doesn't have a Call ID yet (column S, index 18)
        const callIdColumnIndex = 18;
        const existingCallId = rows[i][callIdColumnIndex] || '';
        if (!existingCallId) {
          rowIndex = i + 1; // +1 because Sheets uses 1-based indexing
          break;
        }
      }
    }
    
    if (rowIndex === -1) {
      console.log('[UPDATE LOGISTICS] No matching row found or row already has Call ID');
      return false;
    }
    
    // Get current row
    const currentRow = rows[rowIndex - 1] || [];
    // Ensure row has all 21 columns
    while (currentRow.length < 21) {
      currentRow.push('');
    }
    
    // Map updates to column indices
    const headerMap = Object.fromEntries(LOGISTICS_HEADERS.map((h, i) => [h, i]));
    
    // Update specific columns
    if (updates.callId && headerMap['Call ID'] !== undefined) {
      currentRow[headerMap['Call ID']] = updates.callId;
    }
    if (updates.recordingUrl && headerMap['Recording URI'] !== undefined) {
      currentRow[headerMap['Recording URI']] = updates.recordingUrl;
    }
    if (updates.transcriptSnippet && headerMap['Transcript Snippet'] !== undefined) {
      currentRow[headerMap['Transcript Snippet']] = (updates.transcriptSnippet || '').slice(0, 300);
    }
    
    // Write updated row back
    await s.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!A${rowIndex}:U${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [currentRow] }
    });
    
    console.log(`[UPDATE LOGISTICS] Updated row ${rowIndex} for phone ${phone}`);
    return true;
  } catch (error) {
    console.error('[UPDATE LOGISTICS ERROR]', error);
    return false;
  }
}

export async function updateLead(spreadsheetId, { leadId, rowNumber, patch }) {
  const s = await getClient();
  await ensureHeader(spreadsheetId);

  if (!rowNumber) {
    const read = await s.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:A' });
    const rows = read.data.values || [];
    const idx = rows.findIndex(r => r[0] === leadId);
    if (idx < 0) return;
    rowNumber = idx + 1;
  }

  const current = await s.spreadsheets.values.get({
    spreadsheetId, range: `Sheet1!A${rowNumber}:L${rowNumber}`
  });
  const values = (current.data.values && current.data.values[0]) || new Array(12).fill('');

  const map = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
  for (const [k, v] of Object.entries(patch)) if (map[k] !== undefined) values[map[k]] = v;

  await s.spreadsheets.values.update({
    spreadsheetId, range: `Sheet1!A${rowNumber}:L${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

// Read sheet data
export async function readSheet(spreadsheetId, range = 'Sheet1!A:Z') {
  try {
    const s = await getClient();
    const response = await s.spreadsheets.values.get({
      spreadsheetId,
      range
    });
    
    const rows = response.data.values || [];
    console.log('[SHEETS] Sheet data read successfully, rows:', rows.length);
    
    return {
      success: true,
      rows,
      rowCount: rows.length
    };
  } catch (error) {
    console.error('[SHEETS ERROR] Failed to read sheet:', error);
    throw error;
  }
}
