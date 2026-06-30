/**
 * One-shot: API key + consumer_webhook_json for d2d-xpress-app on Render.
 * Writes secrets to .cursor/tom-render-provision.json (gitignored path).
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiKey, query, init } from '../db.js';
import { generateApiKey, hashApiKey } from '../middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await init();

const clientKey = 'd2d-xpress-tom';
const webhookUrl = process.env.TOM_APP_WEBHOOK_URL || 'https://d2d-xpress-app-f02w.onrender.com/webhooks/callbot';

const apiKey = generateApiKey();
const webhookSecret = crypto.randomBytes(32).toString('hex');

await createApiKey({
  clientKey,
  keyName: 'd2d-xpress-app-render',
  keyHash: hashApiKey(apiKey),
  permissions: ['leads:write', 'calls:read', 'handoffs:read'],
});

const consumerWebhook = {
  url: webhookUrl,
  secret: webhookSecret,
  enabled: true,
  events: ['call.completed'],
};

await query(
  'UPDATE tenants SET consumer_webhook_json = $1::jsonb WHERE client_key = $2',
  [JSON.stringify(consumerWebhook), clientKey]
);

const outPath = path.join(__dirname, '..', '.cursor', 'tom-render-provision.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({
    CALLBOT_API_KEY: apiKey,
    WEBHOOK_SIGNING_SECRET: webhookSecret,
    LOGISTICS_SHEET_ID: process.env.LOGISTICS_SHEET_ID || '',
    GOOGLE_SA_JSON_BASE64: process.env.GOOGLE_SA_JSON_BASE64 || '',
  }),
  { mode: 0o600 }
);
console.log('provisioned', { clientKey, webhookUrl, outPath });
