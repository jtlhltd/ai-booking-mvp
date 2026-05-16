import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  applyLlmScriptToAssistantOverrides,
  buildSequenceLlmPromptPayload,
  generateSequenceStageScriptWithLlm,
  isSequenceLlmScriptsEnabled,
  resolveSequenceStageAssistantOverrides,
} from '../../../lib/outbound-sequence-script-llm.js';

const stage = {
  id: 'stage1_gatekeeper',
  label: 'Gatekeeper',
  firstMessage: 'Hi, logistics please.',
  systemMessage: 'Find the DM. Required: decisionMakerName.',
  requiredFields: ['decisionMakerName'],
  isFinal: false,
};

const client = {
  displayName: 'D2D Xpress',
  outboundSequence: { enabled: true, stages: [stage] },
};

describe('outbound-sequence-script-llm', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SEQUENCE_LLM_SCRIPTS = '1';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.SEQUENCE_SCRIPT_LLM_MODEL = 'gpt-4o-mini';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('isSequenceLlmScriptsEnabled respects env', () => {
    process.env.SEQUENCE_LLM_SCRIPTS = '1';
    expect(isSequenceLlmScriptsEnabled()).toBe(true);
    process.env.SEQUENCE_LLM_SCRIPTS = '0';
    expect(isSequenceLlmScriptsEnabled()).toBe(false);
  });

  test('buildSequenceLlmPromptPayload includes lead and import hints', () => {
    const payload = buildSequenceLlmPromptPayload(
      stage,
      { name: 'Acme Freight', service: 'FTL', source: 'csv', notes: 'Lane MAN-BHX' },
      client,
      { stagesCompleted: [] },
      { variableValues: { crmCampaign: 'spring-26', laneHint: 'MAN-BHX' } }
    );
    expect(payload.lead.name).toBe('Acme Freight');
    expect(payload.importHints.laneHint).toBe('MAN-BHX');
    expect(payload.requiredFields).toContain('decisionMakerName');
  });

  test('generateSequenceStageScriptWithLlm parses OpenAI JSON response', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                firstMessage: 'Hi, may I speak with whoever handles shipping at Acme?',
                systemMessage: 'You are calling from D2D Xpress. Capture decisionMakerName only.',
              }),
            },
          },
        ],
      }),
    }));

    const out = await generateSequenceStageScriptWithLlm({
      stage,
      lead: { name: 'Acme Freight' },
      client,
      ctx: { stagesCompleted: [] },
    });

    expect(out.ok).toBe(true);
    expect(out.script.firstMessage).toContain('Acme');
    expect(out.script.systemMessage).toContain('decisionMakerName');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('resolveSequenceStageAssistantOverrides falls back to static when LLM fails', async () => {
    process.env.OPENAI_API_KEY = '';
    const out = await resolveSequenceStageAssistantOverrides({
      stage,
      lead: { name: 'Acme' },
      client,
      ctx: { stagesCompleted: [] },
    });
    expect(out.scriptSource).toBe('static');
    expect(out.overrides.firstMessage).toBe(stage.firstMessage);
  });

  test('applyLlmScriptToAssistantOverrides preserves variableValues', () => {
    const base = {
      firstMessage: 'old',
      variableValues: { leadName: 'Acme', tenantBusinessName: 'D2D' },
    };
    const merged = applyLlmScriptToAssistantOverrides(base, {
      firstMessage: 'new opener',
      systemMessage: 'new system',
    });
    expect(merged.firstMessage).toBe('new opener');
    expect(merged.variableValues.leadName).toBe('Acme');
    expect(merged.model.messages[0].content).toBe('new system');
  });
});
