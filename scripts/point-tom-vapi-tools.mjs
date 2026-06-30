/**
 * Point Tom's Vapi assistant tools at the D2D Xpress app on Render.
 * Webhook server (end-of-call-report) stays on Call Bot.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOM_APP_BASE = (process.env.TOM_APP_URL || 'https://d2d-xpress-app-f02w.onrender.com').replace(/\/+$/, '');
const ASSISTANT_ID = process.env.TOM_VAPI_ASSISTANT_ID || 'b1ba0ad3-c519-4ab7-aa6f-9fba6516a0ee';
const SAVE_LOGISTICS_TOOL_ID = process.env.TOM_SAVE_LOGISTICS_TOOL_ID || '12a94e96-84c2-453f-bdfe-68a8ee049787';

const vapiKey =
  process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
if (!vapiKey) throw new Error('VAPI_PRIVATE_KEY (or VAPI_API_KEY) required');

async function vapi(method, urlPath, body) {
  const res = await fetch(`https://api.vapi.ai${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${vapiKey}`,
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

const scheduleCallbackToolPayload = {
  type: 'function',
  function: {
    name: 'schedule_callback',
    description:
      'Schedule a callback when the receptionist or decision-maker is unavailable. Capture business name, phone, receptionist name, and reason.',
    parameters: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'Business name' },
        phone: { type: 'string', description: 'Business phone number' },
        receptionistName: { type: 'string', description: 'Name of person who answered' },
        reason: { type: 'string', description: 'Reason for callback' },
        preferredTime: { type: 'string', description: 'Preferred callback time if given' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['businessName', 'phone', 'reason'],
    },
  },
  server: {
    url: `${TOM_APP_BASE}/tools/schedule_callback`,
    timeoutSeconds: 30,
  },
};

async function main() {
  // 1) Point save_logistics_data HTTP tool at Tom app (maps to /tools/access_google_sheet handler)
  await vapi('PATCH', `/tool/${SAVE_LOGISTICS_TOOL_ID}`, {
    server: {
      url: `${TOM_APP_BASE}/tools/access_google_sheet`,
      timeoutSeconds: 30,
    },
  });
  console.log('Updated save_logistics_data tool server URL');

  // 2) Create or reuse schedule_callback tool on Tom app
  const toolsList = await vapi('GET', '/tool?limit=100');
  const tools = Array.isArray(toolsList) ? toolsList : toolsList.results || [];
  let scheduleTool = tools.find(
    (t) =>
      t.function?.name === 'schedule_callback' &&
      t.server?.url?.includes('d2d-xpress-app')
  );
  if (!scheduleTool) {
    scheduleTool = await vapi('POST', '/tool', scheduleCallbackToolPayload);
    console.log('Created schedule_callback tool', scheduleTool.id);
  } else {
    await vapi('PATCH', `/tool/${scheduleTool.id}`, {
      server: scheduleCallbackToolPayload.server,
    });
    console.log('Updated schedule_callback tool', scheduleTool.id);
  }

  // 3) Attach tools to Tom assistant (keep existing voicemail/dtmf/code tools)
  const assistant = await vapi('GET', `/assistant/${ASSISTANT_ID}`);
  const existing = assistant.model?.toolIds || [];
  const merged = [...new Set([...existing, SAVE_LOGISTICS_TOOL_ID, scheduleTool.id])];
  await vapi('PATCH', `/assistant/${ASSISTANT_ID}`, {
    model: {
      ...assistant.model,
      toolIds: merged,
    },
  });
  console.log('Assistant toolIds:', merged);

  const out = {
    assistantId: ASSISTANT_ID,
    tomAppBase: TOM_APP_BASE,
    saveLogisticsToolId: SAVE_LOGISTICS_TOOL_ID,
    scheduleCallbackToolId: scheduleTool.id,
    webhookServer: assistant.server?.url,
  };
  fs.writeFileSync(path.join(__dirname, '..', '.cursor', 'tom-vapi-tools-pointed.json'), JSON.stringify(out, null, 2));
  console.log('Done', out);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
