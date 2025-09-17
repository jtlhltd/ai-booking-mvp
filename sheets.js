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

export async function ensureHeader(spreadsheetId) {
  const s = await getClient();
  await s.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:L1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] }
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
