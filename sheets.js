// sheets.js (ESM)
import { google } from 'googleapis';

let sheetsClient;
async function getClient() {
  if (sheetsClient) return sheetsClient;

  let creds;
  if (process.env.GOOGLE_SA_JSON_BASE64) {
    creds = JSON.parse(Buffer.from(process.env.GOOGLE_SA_JSON_BASE64, 'base64').toString('utf8'));
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
    range: 'Sheet1!A:T',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
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
