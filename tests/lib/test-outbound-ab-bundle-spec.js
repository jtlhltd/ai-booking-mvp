import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOutboundAbBundleSpec,
  stringsToMappedVariants,
  variantLabels
} from '../../lib/outbound-ab-bundle-spec.js';

test('variantLabels: 2 and 3 variants', () => {
  assert.deepEqual(variantLabels(2), ['control', 'variant_b']);
  assert.deepEqual(variantLabels(3), ['variant_0', 'variant_1', 'variant_2']);
});

test('stringsToMappedVariants: voice', () => {
  const id0 = '21m00Tcm4TlvDq8ikWAM';
  const id1 = 'pNInz6obpgDQGcFmaJgB';
  const v = stringsToMappedVariants('voice', [id0, id1]);
  assert.equal(v.length, 2);
  assert.equal(v[0].name, 'control');
  assert.deepEqual(v[0].config, { voice: id0 });
  assert.equal(v[1].name, 'variant_b');
  assert.deepEqual(v[1].config, { voice: id1 });
});

test('stringsToMappedVariants: voice rejects too-short id', () => {
  assert.throws(
    () => stringsToMappedVariants('voice', ['abcdefghij', 'short']),
    /Voice ID must/
  );
});

test('parseOutboundAbBundleSpec: aliases', () => {
  const vA = '21m00Tcm4TlvDq8ikWAM';
  const vB = 'pNInz6obpgDQGcFmaJgB';
  const spec = parseOutboundAbBundleSpec(
    JSON.stringify({
      voiceIds: [vA, vB],
      openingLines: ['hi', 'hey'],
      scriptBodies: ['s1', 's2']
    })
  );
  assert.deepEqual(spec.voices, [vA, vB]);
  assert.deepEqual(spec.openings, ['hi', 'hey']);
  assert.deepEqual(spec.scripts, ['s1', 's2']);
});

test('parseOutboundAbBundleSpec: single creative is duplicated for A/B shape', () => {
  const vid = '21m00Tcm4TlvDq8ikWAM';
  const spec = parseOutboundAbBundleSpec(
    JSON.stringify({
      voices: [vid],
      openings: ['hi'],
      scripts: ['s1']
    })
  );
  assert.deepEqual(spec.voices, [vid, vid]);
  assert.deepEqual(spec.openings, ['hi', 'hi']);
  assert.deepEqual(spec.scripts, ['s1', 's1']);
});

test('parseOutboundAbBundleSpec: rejects empty entry', () => {
  assert.throws(
    () =>
      parseOutboundAbBundleSpec(
        JSON.stringify({
          voices: ['21m00Tcm4TlvDq8ikWAM', ''],
          openings: ['a', 'b'],
          scripts: ['s1', 's2']
        })
      ),
    /Empty/
  );
});
