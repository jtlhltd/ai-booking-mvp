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
  'Receptionist Name','Callback Needed','Call ID','Recording URL','Transcript Snippet'
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
    range: 'Sheet1!A1:T1',
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
  const row = [
    new Date().toISOString(),
    data.businessName || '',
    data.decisionMaker || '',
    data.phone || '',
    data.email || '',
    data.international || '',
    (Array.isArray(data.mainCouriers) ? data.mainCouriers.join(', ') : (data.mainCouriers || '')),
    data.frequency || '',
    (Array.isArray(data.mainCountries) ? data.mainCountries.join(', ') : (data.mainCountries || '')),
    data.exampleShipment || '',
    data.exampleShipmentCost || '',
    data.domesticFrequency || '',
    data.ukCourier || '',
    data.standardRateUpToKg || '',
    data.excludingFuelVat || '',
    data.singleVsMulti || '',
    data.receptionistName || '',
    data.callbackNeeded ? 'TRUE' : 'FALSE',
    data.callId || '',
    data.recordingUrl || '',
    (data.transcriptSnippet || '').slice(0, 300)
  ];
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
