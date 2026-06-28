/**
 * Idempotent seed: Terry Foods ingredient-buyer outreach tenant + multi-stage sequence.
 * Vapi assistant/phone IDs from TERRY_VAPI_* env or platform VAPI_* fallbacks.
 */

const CLIENT_KEY = 'terry-ingredients-outreach';
const DEFAULT_SO = process.env.VAPI_STRUCTURED_OUTPUT_ID || '0cff18e4-6a16-4573-a713-cc7e0fcf3e06';

export const TERRY_INGREDIENTS_OUTBOUND_SEQUENCE = {
  enabled: true,
  maxTotalDialsPerLead: 7,
  maxSequenceDurationDays: 14,
  stages: [
    {
      id: 'stage1_gatekeeper',
      label: 'Gatekeeper & procurement contact',
      firstMessage:
        'Hi, please could I speak with whoever looks after ingredient purchasing or procurement?',
      systemMessage: `You are calling on behalf of {tenantBusinessName}, a food ingredients supplier. Your ONLY goal on this call is to (1) identify the person who buys ingredients or manages procurement, (2) capture their name, role, and department, (3) find the best time to speak with them. Do NOT pitch products, prices, or volumes yet. If asked what this is about: "We supply food ingredients to manufacturers — I just need to know who handles purchasing so we can arrange a brief follow-up." End politely once you have the buyer contact name. Set priorCallWasSubstantive to true only if the buyer spoke with you directly; otherwise false.`,
      structuredOutputId: DEFAULT_SO,
      requiredFields: ['decisionMakerName'],
      optionalFields: [
        'decisionMakerRole',
        'department',
        'bestCallbackWindow',
        'priorCallWasSubstantive'
      ],
      maxDurationSeconds: 120,
      maxAttemptsInStage: 3,
      nextStage: 'stage2_buyer_contact',
      scheduling: {
        minDelayMinutesBeforeNext: 1440,
        maxDelayMinutesBeforeNext: 2880,
        honorCallbackWindowField: null
      }
    },
    {
      id: 'stage2_buyer_contact',
      label: 'Buyer contact capture',
      firstMessage: 'Hi, could I speak with {decisionMakerName} please?',
      systemMessage: `Follow-up from {tenantBusinessName}. Prior context: buyer contact is {decisionMakerName} ({decisionMakerRole}) in {department} at {leadName}. If priorCallWasSubstantive is true, open: "Quick follow-up to our earlier chat — have you got a minute?" Otherwise open neutrally. Goal: confirm you are speaking with the ingredients buyer and capture direct contact details. Required: buyerName, buyerEmail OR buyerPhone, ingredientCategories (what they buy). Optional: bestCallbackWindow. Do NOT pitch. If wrong person, ask when {decisionMakerName} is available and end. Set priorCallWasSubstantive true when you spoke with the buyer.`,
      structuredOutputId: DEFAULT_SO,
      requiredFields: ['buyerName', 'ingredientCategories'],
      optionalFields: ['buyerEmail', 'buyerPhone', 'bestCallbackWindow', 'priorCallWasSubstantive'],
      maxDurationSeconds: 180,
      maxAttemptsInStage: 3,
      nextStage: 'stage3_qualification',
      scheduling: {
        minDelayMinutesBeforeNext: 2880,
        maxDelayMinutesBeforeNext: 5760,
        honorCallbackWindowField: null
      }
    },
    {
      id: 'stage3_qualification',
      label: 'Light qualification & handoff',
      firstMessage: 'Hi {buyerName}, quick follow-up from {tenantBusinessName}.',
      systemMessage: `You have prior context: buyer {buyerName}, categories {ingredientCategories}, company {leadName}. Soft-confirm what you already know. Goal: light discovery (volumeBand, currentSuppliers) and schedule a human callback from {tenantBusinessName} with relevant specs and samples. Required: timeline, callbackPreference. Optional: volumeBand, currentSuppliers, dispositionForHuman. Do NOT re-ask full contact capture. End by confirming when a Terry Foods specialist can call.`,
      structuredOutputId: DEFAULT_SO,
      requiredFields: ['timeline', 'callbackPreference'],
      optionalFields: ['volumeBand', 'currentSuppliers', 'dispositionForHuman', 'callbackAt'],
      maxDurationSeconds: 180,
      maxAttemptsInStage: 3,
      isFinal: true,
      scheduling: {
        minDelayMinutesBeforeNext: 0,
        maxDelayMinutesBeforeNext: 0,
        honorCallbackWindowField: null
      }
    }
  ]
};

function tenantVapiJson() {
  const assistantId =
    process.env.TERRY_VAPI_ASSISTANT_ID?.trim() ||
    process.env.VAPI_ASSISTANT_ID?.trim() ||
    '';
  const phoneNumberId =
    process.env.TERRY_VAPI_PHONE_NUMBER_ID?.trim() ||
    process.env.VAPI_PHONE_NUMBER_ID?.trim() ||
    '';
  return JSON.stringify({
    assistantId,
    phoneNumberId,
    maxDurationSeconds: 180
  });
}

function tenantWhiteLabelJson() {
  return JSON.stringify({
    name: 'Terry Foods',
    businessName: 'Terry Foods',
    industry: 'Food ingredients',
    description: 'Ingredient buyer outreach',
    branding: {
      primaryColor: '#175f68',
      secondaryColor: '#72bf44'
    },
    businessHours: {
      start: 9,
      end: 17,
      days: [1, 2, 3, 4, 5]
    }
  });
}

function tenantCalendarJson() {
  return JSON.stringify({
    calendarId: null,
    services: {},
    booking: {
      defaultDurationMin: 30,
      timezone: 'Europe/London'
    }
  });
}

/**
 * Idempotent: inserts tenant when missing; seeds sequence only when outbound_sequence_json IS NULL.
 * Set RESEED_TERRY_INGREDIENTS_SEQUENCE=1 to force sequence overwrite.
 */
export async function migrateTerryIngredientsOutreachPostgres(pool) {
  if (!pool) return;

  await pool.query(
    `INSERT INTO tenants (
       client_key, display_name, timezone, locale,
       numbers_json, twilio_json, vapi_json, calendar_json,
       sms_templates_json, white_label_config, is_enabled
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
     ON CONFLICT (client_key) DO NOTHING`,
    [
      CLIENT_KEY,
      'Terry Foods',
      'Europe/London',
      'en-GB',
      null,
      null,
      tenantVapiJson(),
      tenantCalendarJson(),
      null,
      tenantWhiteLabelJson()
    ]
  );

  const json = JSON.stringify(TERRY_INGREDIENTS_OUTBOUND_SEQUENCE);
  const force = String(process.env.RESEED_TERRY_INGREDIENTS_SEQUENCE || '').trim() === '1';
  if (force) {
    await pool.query(
      `UPDATE tenants SET outbound_sequence_json = $1::jsonb WHERE client_key = $2`,
      [json, CLIENT_KEY]
    );
    return;
  }
  await pool.query(
    `UPDATE tenants
       SET outbound_sequence_json = $1::jsonb
     WHERE client_key = $2
       AND outbound_sequence_json IS NULL`,
    [json, CLIENT_KEY]
  );
}

export function migrateTerryIngredientsOutreachSqlite(sqlite) {
  if (!sqlite) return;

  const existing = sqlite
    .prepare('SELECT client_key FROM tenants WHERE client_key = ?')
    .get(CLIENT_KEY);
  if (!existing) {
    sqlite
      .prepare(
        `INSERT INTO tenants (
           client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json,
           sms_templates_json, white_label_config, is_enabled
         ) VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        CLIENT_KEY,
        'Terry Foods',
        'Europe/London',
        'en-GB',
        null,
        null,
        tenantVapiJson(),
        tenantCalendarJson(),
        null,
        tenantWhiteLabelJson(),
        1
      );
  }

  const json = JSON.stringify(TERRY_INGREDIENTS_OUTBOUND_SEQUENCE);
  const force = String(process.env.RESEED_TERRY_INGREDIENTS_SEQUENCE || '').trim() === '1';
  if (force) {
    sqlite
      .prepare('UPDATE tenants SET outbound_sequence_json = ? WHERE client_key = ?')
      .run(json, CLIENT_KEY);
    return;
  }
  sqlite
    .prepare(
      `UPDATE tenants
         SET outbound_sequence_json = ?
       WHERE client_key = ?
         AND outbound_sequence_json IS NULL`
    )
    .run(json, CLIENT_KEY);
}
