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
    console.log('[UPDATE LOGISTICS] Searching for row:', {
      phone: phone || 'MISSING',
      callId: updates.callId || 'MISSING',
      hasRecordingUrl: !!updates.recordingUrl,
      hasTranscript: !!updates.transcriptSnippet
    });
    
    // Read all rows to find the one with matching phone or callId
    const response = await s.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:U'
    });
    
    const rows = response.data.values || [];
    console.log('[UPDATE LOGISTICS] Total rows in sheet:', rows.length);
    
    if (rows.length < 2) {
      console.log('[UPDATE LOGISTICS] No data rows (only header)');
      return false; // No data rows (header only)
    }
    
    const phoneColumnIndex = 3; // Column D (0-indexed: A=0, B=1, C=2, D=3)
    const callIdColumnIndex = 18; // Column S (0-indexed)
    let rowIndex = -1;
    
    // First, try to match by callId if provided (more reliable)
    if (updates.callId) {
      console.log('[UPDATE LOGISTICS] Searching by callId:', updates.callId);
      for (let i = 1; i < rows.length; i++) {
        const existingCallId = rows[i][callIdColumnIndex] || '';
        const rowPhone = rows[i][phoneColumnIndex] || '';
        console.log(`[UPDATE LOGISTICS] Row ${i + 1}: callId="${existingCallId}", phone="${rowPhone}"`);
        
        if (existingCallId === updates.callId) {
          rowIndex = i + 1;
          console.log(`[UPDATE LOGISTICS] ✅ Found match by callId at row ${rowIndex}`);
          break;
        }
      }
    }
    
    // If no callId match, try phone number (only update rows without callId)
    if (rowIndex === -1 && phone) {
      console.log('[UPDATE LOGISTICS] No callId match, searching by phone:', phone);
      const normalizedSearchPhone = phone.replace(/\s+/g, '').replace(/^\+/, '');
      
      for (let i = 1; i < rows.length; i++) {
        const rowPhone = rows[i][phoneColumnIndex] || '';
        const existingCallId = rows[i][callIdColumnIndex] || '';
        
        // Normalize phone numbers for comparison
        const normalizedRowPhone = rowPhone.replace(/\s+/g, '').replace(/^\+/, '');
        
        if (normalizedRowPhone === normalizedSearchPhone || 
            normalizedRowPhone.endsWith(normalizedSearchPhone) ||
            normalizedSearchPhone.endsWith(normalizedRowPhone)) {
          console.log(`[UPDATE LOGISTICS] Phone match found at row ${i + 1}, existing callId: "${existingCallId}"`);
          
          // Only update if this row doesn't have a Call ID yet
          if (!existingCallId) {
            rowIndex = i + 1; // +1 because Sheets uses 1-based indexing
            console.log(`[UPDATE LOGISTICS] ✅ Found match by phone at row ${rowIndex} (no existing callId)`);
            break;
          } else {
            console.log(`[UPDATE LOGISTICS] ⚠️ Skipping row ${i + 1} - already has callId: "${existingCallId}"`);
          }
        }
      }
    }
    
    // If still no match and we have a callId but no phone, try to find the most recent row without a callId
    // This handles the case where the tool call created a row during the call, but the webhook doesn't have the phone
    if (rowIndex === -1 && updates.callId && !phone) {
      console.log('[UPDATE LOGISTICS] No callId or phone match, searching for most recent row without callId');
      
      // Search from bottom to top (most recent first)
      for (let i = rows.length - 1; i >= 1; i--) {
        const existingCallId = rows[i][callIdColumnIndex] || '';
        const rowPhone = rows[i][phoneColumnIndex] || '';
        
        // Find the first row (from bottom) that has a phone but no callId
        if (!existingCallId && rowPhone) {
          rowIndex = i + 1; // +1 because Sheets uses 1-based indexing
          console.log(`[UPDATE LOGISTICS] ✅ Found most recent row without callId at row ${rowIndex} (phone: "${rowPhone}")`);
          break;
        }
      }
    }
    
    if (rowIndex === -1) {
      console.log('[UPDATE LOGISTICS] ❌ No matching row found');
      console.log('[UPDATE LOGISTICS] Search criteria:', {
        searchedCallId: updates.callId || 'none',
        searchedPhone: phone || 'none',
        totalRows: rows.length - 1
      });
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
    const updatesMade = [];
    if (updates.callId && headerMap['Call ID'] !== undefined) {
      currentRow[headerMap['Call ID']] = updates.callId;
      updatesMade.push('Call ID');
    }
    if (updates.recordingUrl && headerMap['Recording URI'] !== undefined) {
      currentRow[headerMap['Recording URI']] = updates.recordingUrl;
      updatesMade.push('Recording URI');
    }
    if (updates.transcriptSnippet && headerMap['Transcript Snippet'] !== undefined) {
      currentRow[headerMap['Transcript Snippet']] = (updates.transcriptSnippet || '').slice(0, 300);
      updatesMade.push('Transcript Snippet');
    }
    
    console.log(`[UPDATE LOGISTICS] Updating row ${rowIndex} with:`, updatesMade);
    console.log(`[UPDATE LOGISTICS] Update values:`, {
      callId: updates.callId || 'none',
      recordingUrl: updates.recordingUrl ? updates.recordingUrl.substring(0, 50) + '...' : 'none',
      transcriptSnippet: updates.transcriptSnippet ? updates.transcriptSnippet.substring(0, 50) + '...' : 'none'
    });
    
    // Write updated row back
    await s.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!A${rowIndex}:U${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [currentRow] }
    });
    
    console.log(`[UPDATE LOGISTICS] ✅ Successfully updated row ${rowIndex} for phone ${phone || 'N/A'}`);
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
