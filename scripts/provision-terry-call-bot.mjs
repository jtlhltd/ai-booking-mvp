#!/usr/bin/env node
/**
 * Create (or reuse) the Terry Foods placeholder call bot in Vapi and select it on
 * tenant terry-ingredients-outreach.
 *
 * Usage:
 *   node scripts/provision-terry-call-bot.mjs
 *   node scripts/provision-terry-call-bot.mjs --create-new   # force new assistant even if placeholder exists
 *
 * Requires: VAPI_PRIVATE_KEY, DATABASE_URL (Postgres)
 */

import 'dotenv/config';
import { init, getFullClient } from '../db.js';
import { updateClientConfig } from '../lib/client-onboarding.js';
import {
  assistantExistsInOrg,
  createVapiAssistant,
  listVapiAssistants,
} from '../lib/vapi-assistant-admin.js';
import {
  buildTerryPlaceholderAssistantPayload,
  findTerryPlaceholderAssistant,
  patchTerryAssistantStructuredOutput,
  TERRY_PLACEHOLDER_ASSISTANT_NAME,
  TERRY_STRUCTURED_OUTPUT_ID,
} from '../lib/terry-call-bot-placeholder.js';

const CLIENT_KEY = 'terry-ingredients-outreach';

async function main() {
  const forceNew = process.argv.includes('--create-new');

  if (!process.env.VAPI_PRIVATE_KEY?.trim() && !process.env.VAPI_API_KEY?.trim()) {
    console.error('VAPI_PRIVATE_KEY is required');
    process.exit(1);
  }

  await init();
  const client = await getFullClient(CLIENT_KEY);
  if (!client) {
    console.error(`Tenant ${CLIENT_KEY} not found — run DB migrations first`);
    process.exit(1);
  }

  let assistant = null;
  if (!forceNew) {
    const all = await listVapiAssistants();
    assistant = findTerryPlaceholderAssistant(all);
    if (assistant) {
      console.log(`Reusing placeholder assistant ${assistant.id}`);
    }
  }

  if (!assistant) {
    const payload = buildTerryPlaceholderAssistantPayload();
    assistant = await createVapiAssistant(payload);
    console.log(`Created placeholder assistant ${assistant.id} (${TERRY_PLACEHOLDER_ASSISTANT_NAME})`);
  }

  const assistantId = String(assistant.id).trim();
  try {
    await patchTerryAssistantStructuredOutput(assistantId);
    console.log(`Structured output ${TERRY_STRUCTURED_OUTPUT_ID} attached to assistant`);
  } catch (err) {
    console.warn(`Could not patch structured output (assistant may still work via sequence metadata): ${err?.message || err}`);
  }
  const phoneNumberId =
    process.env.TERRY_VAPI_PHONE_NUMBER_ID?.trim() ||
    process.env.VAPI_PHONE_NUMBER_ID?.trim() ||
    client.vapi?.phoneNumberId ||
    '';

  const vapiPatch = { assistantId };
  if (phoneNumberId) vapiPatch.phoneNumberId = String(phoneNumberId);

  await updateClientConfig(CLIENT_KEY, { vapi: vapiPatch });

  const saved = await getFullClient(CLIENT_KEY, { bypassCache: true });
  const selected = saved?.vapi?.assistantId || saved?.vapiAssistantId;
  const ok = selected === assistantId && (await assistantExistsInOrg(assistantId));

  console.log(JSON.stringify({
    ok,
    clientKey: CLIENT_KEY,
    assistantId,
    assistantName: TERRY_PLACEHOLDER_ASSISTANT_NAME,
    phoneNumberId: saved?.vapi?.phoneNumberId || null,
    selectedAssistantId: selected,
  }, null, 2));

  if (!ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
