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
  const v = stringsToMappedVariants('voice', ['a', 'b']);
  assert.equal(v.length, 2);
  assert.equal(v[0].name, 'control');
  assert.deepEqual(v[0].config, { voice: 'a' });
  assert.equal(v[1].name, 'variant_b');
  assert.deepEqual(v[1].config, { voice: 'b' });
});

test('parseOutboundAbBundleSpec: aliases', () => {
  const spec = parseOutboundAbBundleSpec(
    JSON.stringify({
      voiceIds: ['v1', 'v2'],
      openingLines: ['hi', 'hey'],
      scriptBodies: ['s1', 's2']
    })
  );
  assert.deepEqual(spec.voices, ['v1', 'v2']);
  assert.deepEqual(spec.openings, ['hi', 'hey']);
  assert.deepEqual(spec.scripts, ['s1', 's2']);
});

test('parseOutboundAbBundleSpec: rejects empty entry', () => {
  assert.throws(
    () =>
      parseOutboundAbBundleSpec(
        JSON.stringify({
          voices: ['v1', ''],
          openings: ['a', 'b'],
          scripts: ['s1', 's2']
        })
      ),
    /Empty/
  );
});
