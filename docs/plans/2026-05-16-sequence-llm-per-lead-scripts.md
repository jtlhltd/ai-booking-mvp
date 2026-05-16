# Sequence LLM per-lead stage scripts

## Context

- Multi-call uses static `outbound_sequence_json` stage templates; Tom needs lead-specific wording (company, lane, campaign, prior stage facts).
- User approved LLM generation (gpt-4o-mini default); marginal cost is small vs Vapi.

## Definition of done

- When `SEQUENCE_LLM_SCRIPTS=1` and `OPENAI_API_KEY` set, sequence dials use LLM-generated `firstMessage` + `systemMessage` per lead per stage attempt.
- Static `buildAssistantOverridesForStage` still supplies `variableValues`, caps, and fallback if LLM fails.
- Call metadata records `sequenceScriptSource` (`llm` | `static`).
- INTENT row + unit tests (mocked fetch) + canary; `npm run test:ci` passes.

## Non-goals

- Dial-context cache across retries (v2); UI editor for prompts; new OpenAI call sites outside `lib/outbound-sequence-script-llm.js`.

## Work breakdown

- [x] `lib/outbound-sequence-script-llm.js` + `resolveSequenceStageAssistantOverrides`
- [x] Wire `instant-calling.js`
- [x] INTENT + tests (CI on commit)

## Risk & rollback

- Set `SEQUENCE_LLM_SCRIPTS=0` or unset `OPENAI_API_KEY` to revert to static templates instantly.
