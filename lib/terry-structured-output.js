/**
 * Terry Foods market-research structured output — field contract shared by
 * outbound sequence stages, Vapi artifactPlan, and call-dashboard marketing columns.
 */

export const TERRY_STRUCTURED_OUTPUT_ID =
  process.env.TERRY_VAPI_STRUCTURED_OUTPUT_ID?.trim() ||
  process.env.VAPI_STRUCTURED_OUTPUT_ID?.trim() ||
  '0cff18e4-6a16-4573-a713-cc7e0fcf3e06';

/** Property names expected on Vapi structured output / handoff qual data. */
export const TERRY_STRUCTURED_OUTPUT_FIELDS = [
  'decisionMakerName',
  'decisionMakerRole',
  'department',
  'bestCallbackWindow',
  'priorCallWasSubstantive',
  'buyerName',
  'buyerEmail',
  'buyerPhone',
  'ingredientCategories',
  'timeline',
  'callbackPreference',
  'volumeBand',
  'currentSuppliers',
  'dispositionForHuman',
  'callbackAt',
  'summaryText',
  'marketingNotes',
];

export function buildTerryArtifactPlan() {
  const id = TERRY_STRUCTURED_OUTPUT_ID;
  if (!id) return null;
  return { structuredOutputIds: [id] };
}
