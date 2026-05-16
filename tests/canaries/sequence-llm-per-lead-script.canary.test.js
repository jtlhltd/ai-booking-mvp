/**
 * Canary for Intent Contract: sequence.llm-per-lead-stage-script
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('canary: sequence.llm-per-lead-stage-script', () => {
  test('instant-calling resolves LLM sequence overrides with metadata', () => {
    const instant = readFileSync(path.join(repoRoot, 'lib/instant-calling.js'), 'utf8');
    const llm = readFileSync(path.join(repoRoot, 'lib/outbound-sequence-script-llm.js'), 'utf8');
    expect(llm).toMatch(/SEQUENCE_LLM_SCRIPTS/);
    expect(llm).toMatch(/resolveSequenceStageAssistantOverrides/);
    expect(instant).toMatch(/resolveSequenceStageAssistantOverrides/);
    expect(instant).toMatch(/sequenceScriptSource/);
  });
});
