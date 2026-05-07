/**
 * Idempotent seed: enables multi-stage outbound sequence for anchor tenant.
 * Replace structuredOutputId UUIDs in Vapi if they differ per stage in production.
 */

const DEFAULT_SO = process.env.VAPI_STRUCTURED_OUTPUT_ID || '0cff18e4-6a16-4573-a713-cc7e0fcf3e06';

export const TOM_OUTBOUND_SEQUENCE = {
  enabled: true,
  maxTotalDialsPerLead: 7,
  maxSequenceDurationDays: 14,
  stages: [
    {
      id: 'stage1_gatekeeper',
      label: 'Gatekeeper & DM identification',
      firstMessage: 'Hi, please can I speak with the person in charge of logistics and shipping?',
      systemMessage: `You are a professional logistics partner from {tenantBusinessName}. Your ONLY goal on this call is to (1) identify the decision maker for shipping and logistics, (2) capture their name and role, (3) find out the best time to speak with them. Do NOT pitch volumes, lanes, or rates — those come on a later call. If asked what this is about: "We partner with UPS, FedEx and DHL on one platform — I just need to know who handles shipping so we can arrange a quick follow-up." End politely once you have the decision maker name. Set priorCallWasSubstantive to true only if the DM spoke with you directly; otherwise false.`,
      structuredOutputId: DEFAULT_SO,
      requiredFields: ['decisionMakerName'],
      optionalFields: ['decisionMakerRole', 'bestCallbackWindow', 'priorCallWasSubstantive'],
      maxDurationSeconds: 120,
      maxAttemptsInStage: 3,
      nextStage: 'stage2_discovery',
      scheduling: {
        minDelayMinutesBeforeNext: 1440,
        maxDelayMinutesBeforeNext: 2880,
        honorCallbackWindowField: null
      }
    },
    {
      id: 'stage2_discovery',
      label: 'Needs discovery',
      firstMessage: 'Hi, can I please speak with {decisionMakerName}?',
      systemMessage: `Follow-up from {tenantBusinessName}. Prior context: DM is {decisionMakerName} ({decisionMakerRole}) at {leadName}. If priorCallWasSubstantive is true, open: "Quick follow-up to our earlier chat — got a couple of minutes?" Otherwise open neutrally. Always soft-confirm anything you already know before asking new questions. Goal: learn how they ship. Required capture: originCity, destinationCity, volumePerWeek, currentCarriers. Optional: internationalYN, mainCountries, painPoints, equipment. Do NOT pitch or close. If wrong person answers, ask when {decisionMakerName} is available and end. Set priorCallWasSubstantive true when you spoke with the DM.`,
      structuredOutputId: DEFAULT_SO,
      requiredFields: ['originCity', 'destinationCity', 'volumePerWeek', 'currentCarriers'],
      optionalFields: ['internationalYN', 'mainCountries', 'painPoints', 'equipment', 'priorCallWasSubstantive'],
      maxDurationSeconds: 240,
      maxAttemptsInStage: 3,
      nextStage: 'stage3_close',
      scheduling: {
        minDelayMinutesBeforeNext: 2880,
        maxDelayMinutesBeforeNext: 5760,
        honorCallbackWindowField: null
      }
    },
    {
      id: 'stage3_close',
      label: 'Qualification close & handoff',
      firstMessage: 'Hi {decisionMakerName}, quick follow-up to lock in next steps.',
      systemMessage: `You have prior context: lanes {originCity} to {destinationCity}, about {volumePerWeek} per week, carriers {currentCarriers}, pain: {painPoints}. Soft-confirm the headline numbers before continuing. Goal: timeline for a quote or trial, authority / other stakeholders, and a firm human callback from {tenantBusinessName}. Do NOT re-ask full discovery. End by confirming when a human can call with lane-specific rates.`,
      structuredOutputId: DEFAULT_SO,
      requiredFields: ['timeline', 'callbackPreference'],
      optionalFields: ['authority', 'callbackAt', 'dispositionForHuman'],
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

/**
 * Idempotent: only seeds when the column is NULL. Operator-edited JSON
 * (including the rollback flip `enabled: false`) is preserved across restarts.
 * Set `RESEED_TOM_OUTBOUND_SEQUENCE=1` to force overwrite (use sparingly).
 */
export async function migrateTomOutboundSequencePostgres(pool) {
  if (!pool) return;
  const json = JSON.stringify(TOM_OUTBOUND_SEQUENCE);
  const force = String(process.env.RESEED_TOM_OUTBOUND_SEQUENCE || '').trim() === '1';
  if (force) {
    await pool.query(
      `UPDATE tenants SET outbound_sequence_json = $1::jsonb WHERE client_key = 'd2d-xpress-tom'`,
      [json]
    );
    return;
  }
  await pool.query(
    `UPDATE tenants
       SET outbound_sequence_json = $1::jsonb
     WHERE client_key = 'd2d-xpress-tom'
       AND outbound_sequence_json IS NULL`,
    [json]
  );
}

export function migrateTomOutboundSequenceSqlite(sqlite) {
  if (!sqlite) return;
  const json = JSON.stringify(TOM_OUTBOUND_SEQUENCE);
  const force = String(process.env.RESEED_TOM_OUTBOUND_SEQUENCE || '').trim() === '1';
  if (force) {
    sqlite
      .prepare(`UPDATE tenants SET outbound_sequence_json = ? WHERE client_key = 'd2d-xpress-tom'`)
      .run(json);
    return;
  }
  sqlite
    .prepare(
      `UPDATE tenants
         SET outbound_sequence_json = ?
       WHERE client_key = 'd2d-xpress-tom'
         AND outbound_sequence_json IS NULL`
    )
    .run(json);
}
