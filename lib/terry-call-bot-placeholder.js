/** Terry Foods market-research call bot — placeholder script for dashboard editing. */

export const TERRY_PLACEHOLDER_ASSISTANT_NAME = 'Terry Foods research (placeholder)';

export const TERRY_PLACEHOLDER_FIRST_MESSAGE =
  'Hi, this is calling from Terry Foods. We supply ingredients to food manufacturers — do you have a moment to help me with a quick research question?';

export const TERRY_PLACEHOLDER_SYSTEM_PROMPT = `You are a polite research caller for Terry Foods, a food ingredients supplier.

GOAL: Gather marketing intel — not to sell on this call. Capture contact details for follow-up campaigns.

ON THE CALL:
- Identify yourself as calling from Terry Foods on a brief research call.
- Ask who handles ingredient purchasing or procurement.
- If speaking with the right person, politely ask for: their name, email, role, ingredient categories they buy, and general interest in hearing from Terry Foods.
- If you reach a gatekeeper, ask for the buyer's name and best contact details — do not push for a hard sell.
- Keep calls under three minutes. Be warm, professional, and concise.

IF ASKED WHAT THIS IS ABOUT:
"We supply food ingredients to manufacturers — I'm gathering contact details so our team can share relevant information later."

DO NOT: quote prices, pressure for meetings, or argue. End politely if they are not interested.

When the conversation ends, ensure structured fields are filled where possible (name, email, role, categories, interest).`;

export function buildTerryPlaceholderAssistantPayload(options = {}) {
  const publicBase =
    options.publicBaseUrl ||
    process.env.PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    'https://ai-booking-mvp.onrender.com';
  const serverUrl = `${String(publicBase).replace(/\/+$/, '')}/webhooks/vapi`;

  return {
    name: TERRY_PLACEHOLDER_ASSISTANT_NAME,
    firstMessage: TERRY_PLACEHOLDER_FIRST_MESSAGE,
    serverUrl,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 300,
      messages: [
        {
          role: 'system',
          content: TERRY_PLACEHOLDER_SYSTEM_PROMPT,
        },
      ],
    },
    voice: {
      provider: '11labs',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      stability: 0.7,
      similarityBoost: 0.75,
      style: 0.2,
      useSpeakerBoost: true,
    },
    maxDurationSeconds: 180,
    recordingEnabled: true,
    endCallPhrases: ['goodbye', 'not interested', 'remove me', 'stop calling'],
  };
}

export function findTerryPlaceholderAssistant(assistants) {
  if (!Array.isArray(assistants)) return null;
  const target = TERRY_PLACEHOLDER_ASSISTANT_NAME.toLowerCase();
  return (
    assistants.find(
      (a) => a && typeof a.name === 'string' && a.name.trim().toLowerCase() === target,
    ) || null
  );
}
