/**
 * Move d2d-xpress-app from Lead Qualifier to a dedicated workspace.
 * Usage: node scripts/migrate-tom-render-workspace.mjs --workspace-id tea-xxx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OLD_SERVICE_ID = 'srv-d91qh2m7r5hc738q9890';
const API_BASE = 'https://api.render.com/v1';

function getApiKey() {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error('RENDER_API_KEY required');
  return key;
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} -> ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function loadProvision() {
  const p = path.join(__dirname, '..', '.cursor', 'tom-render-provision.json');
  if (!fs.existsSync(p)) throw new Error(`Missing ${p} — run provision-tom-render-once.mjs first`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function deleteOldService() {
  try {
    await api('DELETE', `/services/${OLD_SERVICE_ID}`);
    console.log('Deleted old service', OLD_SERVICE_ID);
  } catch (e) {
    if (String(e.message).includes('404')) {
      console.log('Old service already gone');
    } else {
      throw e;
    }
  }
}

async function createService(workspaceId, provision) {
  const payload = {
    type: 'web_service',
    name: 'd2d-xpress-app',
    ownerId: workspaceId,
    repo: 'https://github.com/jtlhltd/d2d-xpress-app',
    branch: 'master',
    autoDeploy: 'yes',
    serviceDetails: {
      runtime: 'node',
      plan: 'starter',
      region: 'oregon',
      envSpecificDetails: {
        buildCommand: 'npm install',
        startCommand: 'npm start',
      },
    },
    envVars: [
      { key: 'NODE_VERSION', value: '20' },
      { key: 'PORT', value: '4000' },
      { key: 'TENANT_DISPLAY_NAME', value: 'D2D Xpress' },
      { key: 'CALLBOT_API_URL', value: 'https://ai-booking-mvp.onrender.com' },
      { key: 'CALLBOT_API_KEY', value: provision.CALLBOT_API_KEY },
      { key: 'WEBHOOK_SIGNING_SECRET', value: provision.WEBHOOK_SIGNING_SECRET },
      { key: 'LOGISTICS_SHEET_ID', value: provision.LOGISTICS_SHEET_ID },
      { key: 'GOOGLE_SA_JSON_BASE64', value: provision.GOOGLE_SA_JSON_BASE64 },
    ],
  };
  const created = await api('POST', '/services', payload);
  const service = created?.service || created;
  console.log('Created service', service?.id, service?.serviceDetails?.url || service?.url);
  return service;
}

async function pollWorkspaces(targetName) {
  const list = await api('GET', '/owners');
  const owners = Array.isArray(list) ? list : list?.owners || [];
  return owners.find((o) => String(o.name).toLowerCase() === targetName.toLowerCase());
}

async function main() {
  const args = process.argv.slice(2);
  let workspaceId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace-id') workspaceId = args[i + 1];
  }

  if (!workspaceId) {
    const found = await pollWorkspaces('D2D Xpress');
    if (!found) {
      console.error('Workspace "D2D Xpress" not found. Create it in Render (+ New Workspace), then re-run.');
      process.exit(1);
    }
    workspaceId = found.id || found.owner?.id;
    console.log('Found workspace', found.name, workspaceId);
  }

  const provision = loadProvision();
  await deleteOldService();
  // Brief pause so slug can be released
  await new Promise((r) => setTimeout(r, 5000));
  const service = await createService(workspaceId, provision);
  console.log(JSON.stringify({ ok: true, workspaceId, serviceId: service?.id, url: 'https://d2d-xpress-app.onrender.com' }));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
