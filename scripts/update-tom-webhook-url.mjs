import 'dotenv/config';
import { init, query } from '../db.js';

const url = process.env.TOM_APP_WEBHOOK_URL || 'https://d2d-xpress-app-f02w.onrender.com/webhooks/callbot';

await init();
const { rows } = await query(
  "SELECT consumer_webhook_json FROM tenants WHERE client_key = 'd2d-xpress-tom'"
);
const prev = rows[0]?.consumer_webhook_json || {};
const next = typeof prev === 'string' ? JSON.parse(prev) : { ...prev };
next.url = url;
next.enabled = true;
await query(
  'UPDATE tenants SET consumer_webhook_json = $1::jsonb WHERE client_key = $2',
  [JSON.stringify(next), 'd2d-xpress-tom']
);
console.log('webhook url updated to', url);
