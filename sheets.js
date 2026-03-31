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
  'Main Couriers','International Shipments per Week','Main Countries','Example Shipment (weight x dims)','Example Shipment Cost',
  'UK Shipments per Week','UK Courier','Std Rate up to KG','Excl Fuel & VAT?','Single vs Multi-parcel',
  'Receptionist Name','Callback Needed','Call ID','Recording URI','Transcript Snippet','Called Number'
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
    range: 'Sheet1!A1:V1',
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
  
  // Map structuredData keys (VAPI schema) OR extractor keys (camelCase) to sheet columns
  const d = data || {};
  const inc = d['Includes Fuel & VAT (Y/N)'] ?? '';
  const exclFromInc = inc === 'Y' ? 'N' : inc === 'N' ? 'Y' : '';
  const columnData = {
    'Timestamp': new Date().toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    'Business Name': d['Business Name'] ?? d.businessName ?? '',
    'Decision Maker': d['Decision Maker'] ?? d.decisionMaker ?? '',
    'Phone': d['Phone Number'] ?? d.phone ?? '',
    'Email': d['Email'] ?? d.email ?? '',
    'International (Y/N)': d['International (Y/N)'] ?? d.international ?? '',
    'Main Couriers': d['International Courier'] ?? (Array.isArray(d.mainCouriers) ? d.mainCouriers.join(', ') : (d.mainCouriers ?? '')),
    'International Shipments per Week': d['International Shipments per Week'] ?? d.internationalShipmentsPerWeek ?? d.frequency ?? '',
    'Main Countries': d['Main Countries'] ?? (Array.isArray(d.mainCountries) ? d.mainCountries.join(', ') : (d.mainCountries ?? '')),
    'Example Shipment (weight x dims)': d['Example Shipment Weight'] ?? d.exampleShipment ?? '',
    'Example Shipment Cost': d['Example Shipment Cost'] ?? d.exampleShipmentCost ?? '',
    'UK Shipments per Week': d['UK Shipments per Week'] ?? d.ukShipmentsPerWeek ?? d.domesticFrequency ?? '',
    'UK Courier': d['UK Courier'] ?? d.ukCourier ?? '',
    'Std Rate up to KG': d['UK Standard Rate'] ?? d.standardRateUpToKg ?? '',
    'Excl Fuel & VAT?': exclFromInc || d.excludingFuelVat || d.exclFuelVat || '',
    'Single vs Multi-parcel': d['Single vs Multi-parcel'] ?? d.singleVsMulti ?? d.singleVsMultiParcel ?? '',
    'Receptionist Name': d.receptionistName ?? '',
    'Callback Needed': '',
    'Call ID': d.callId ?? '',
    'Recording URI': d.recordingUrl ?? '',
    'Transcript Snippet': (d.transcriptSnippet ?? '').slice(0, 300),
    'Called Number': d.calledNumber ?? d.phone ?? ''
  };

  // Hard guard: do not create a row unless at least one real logistics field is present.
  // Ignore metadata-only fields (timestamp, call id, recording, transcript, callback flag, business name/phone).
  const meaningfulLogisticsFields = [
    'Decision Maker',
    'Email',
    'International (Y/N)',
    'Main Couriers',
    'International Shipments per Week',
    'Main Countries',
    'Example Shipment (weight x dims)',
    'Example Shipment Cost',
    'UK Shipments per Week',
    'UK Courier',
    'Std Rate up to KG',
    'Excl Fuel & VAT?',
    'Single vs Multi-parcel',
    'Receptionist Name'
  ];
  const hasMeaningfulData = meaningfulLogisticsFields.some((field) => {
    const raw = columnData[field];
    if (raw == null) return false;
    const v = String(raw).trim().toLowerCase();
    return v !== '' && v !== 'unknown' && v !== 'n/a' && v !== 'na';
  });
  if (!hasMeaningfulData) {
    console.log('[SHEETS] Skipping logistics append: no meaningful logistics data', {
      callId: columnData['Call ID'] || '',
      phone: columnData['Phone'] || ''
    });
    return { skipped: true };
  }
  
  // Build row array — explicit handling: null, undefined, or "" → "Unknown" (no || or ?? silent fallback)
  const row = LOGISTICS_HEADERS.map(header => {
    const value = columnData[header];
    if (value === null || value === undefined || value === '') return '';
    return String(value);
  });
  
  console.log('[SHEETS DEBUG] Column mapping:', JSON.stringify(columnData, null, 2));
  console.log('[SHEETS DEBUG] Row being written:', JSON.stringify(row, null, 2));
  
  // Verify each column matches its header
  for (let i = 0; i < LOGISTICS_HEADERS.length && i < row.length; i++) {
    console.log(`[SHEETS DEBUG] Column ${i + 1} (${LOGISTICS_HEADERS[i]}): "${row[i]}"`);
  }
  
  await s.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:V',  // 22 columns including Called Number
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
      range: 'Sheet1!A:V'
    });
    
    const rows = response.data.values || [];
    console.log('[UPDATE LOGISTICS] Total rows in sheet:', rows.length);
    
    if (rows.length < 2) {
      console.log('[UPDATE LOGISTICS] No data rows (only header)');
      return false; // No data rows (header only)
    }
    
    const phoneColumnIndex = 3; // Column D (0-indexed: A=0, B=1, C=2, D=3)
    const callIdColumnIndex = 18; // Column S (0-indexed) after removing Frequency & Domestic Frequency
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
    // Ensure row has all 22 columns
    while (currentRow.length < 22) {
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
    if (updates.calledNumber && headerMap['Called Number'] !== undefined) {
      currentRow[headerMap['Called Number']] = updates.calledNumber;
      updatesMade.push('Called Number');
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
      range: `Sheet1!A${rowIndex}:V${rowIndex}`,
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

/** Update logistics status / called flag for a specific Sheet1 row (by row index). */
export async function updateLogisticsStatusByRow(spreadsheetId, rowNumber, { called }) {
  const s = await getClient();
  if (!rowNumber || rowNumber < 2) {
    console.warn('[UPDATE LOGISTICS STATUS] Invalid rowNumber:', rowNumber);
    return false;
  }
  try {
    const range = `Sheet1!A${rowNumber}:V${rowNumber}`;
    const current = await s.spreadsheets.values.get({
      spreadsheetId,
      range
    });
    const row = (current.data.values && current.data.values[0]) ? [...current.data.values[0]] : [];
    while (row.length < LOGISTICS_HEADERS.length) row.push('');
    const headerMap = Object.fromEntries(LOGISTICS_HEADERS.map((h, i) => [h, i]));
    // Re-use the existing "Callback Needed" logistics column to persist our Called? flag.
    if (headerMap['Callback Needed'] !== undefined) {
      row[headerMap['Callback Needed']] = called ? 'TRUE' : 'FALSE';
    }
    await s.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
    console.log('[UPDATE LOGISTICS STATUS] Updated row', rowNumber, 'called =', called);
    return true;
  } catch (error) {
    console.error('[UPDATE LOGISTICS STATUS ERROR]', error);
    return false;
  }
}

/** Update Called? (stored in "Callback Needed") by searching sheet for callId/phone. */
export async function updateLogisticsCalledFlag(spreadsheetId, { callId = '', phone = '', called }) {
  const s = await getClient();
  try {
    const response = await s.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:V'
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return false;

    const header = rows[0] || [];
    const headerMap = {};
    header.forEach((h, i) => { headerMap[String(h || '').trim()] = i; });
    const cbIdx = headerMap['Callback Needed'];
    const callIdIdx = headerMap['Call ID'];
    const phoneIdx = headerMap['Phone'];
    if (cbIdx == null) return false;

    const wantCallId = String(callId || '').trim();
    const wantPhone = String(phone || '').trim();
    const wantPhoneNorm = wantPhone.replace(/\s+/g, '').replace(/^\+/, '');
    let rowNumber = -1;

    if (wantCallId && callIdIdx != null) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][callIdIdx] || '').trim() === wantCallId) {
          rowNumber = i + 1;
          break;
        }
      }
    }

    if (rowNumber === -1 && wantPhone && phoneIdx != null) {
      for (let i = 1; i < rows.length; i++) {
        const rp = String(rows[i][phoneIdx] || '').trim();
        const rpNorm = rp.replace(/\s+/g, '').replace(/^\+/, '');
        if (!rpNorm) continue;
        if (rpNorm === wantPhoneNorm || rpNorm.endsWith(wantPhoneNorm) || wantPhoneNorm.endsWith(rpNorm)) {
          rowNumber = i + 1;
          break;
        }
      }
    }

    if (rowNumber === -1) return false;

    // Update only the Callback Needed cell
    const colLetter = String.fromCharCode('A'.charCodeAt(0) + cbIdx);
    const range = `Sheet1!${colLetter}${rowNumber}:${colLetter}${rowNumber}`;
    await s.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[called ? 'TRUE' : 'FALSE']] }
    });
    console.log('[UPDATE LOGISTICS CALLED FLAG] Updated', { rowNumber, called });
    return true;
  } catch (error) {
    console.error('[UPDATE LOGISTICS CALLED FLAG ERROR]', error);
    return false;
  }
}

/** Map Sheet1 rows (header in row 0) to plain objects for dashboard / APIs. */
export function logisticsSheetRowsToRecords(values) {
  const rows = Array.isArray(values) ? values : [];
  if (rows.length < 2) return [];
  const headers = (rows[0] || []).map((h) => String(h || '').trim());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const o = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      o[key] = r[j] != null && r[j] !== '' ? String(r[j]) : '';
    }
    records.push(o);
  }
  return records;
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
