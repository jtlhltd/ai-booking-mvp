/**
 * Dashboard outbound A/B HTTP handlers (extracted from server composition root).
 */

import { getClientKeyLookupCandidates } from './client-key-lookup.js';

export function getDashboardSelfServiceClientKeys() {
  const e = process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS;
  if (e === undefined || e === '') {
    return [];
  }
  return String(e)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
export function isDashboardSelfServiceClient(clientKey) {
  const allowed = new Set(getDashboardSelfServiceClientKeys());
  for (const ck of getClientKeyLookupCandidates(clientKey)) {
    if (allowed.has(ck)) return true;
  }
  return false;
}
const DASHBOARD_SELF_SERVICE_VAPI_AB_KEYS = new Set([
  'outboundAbVoiceExperiment',
  'outboundAbOpeningExperiment',
  'outboundAbScriptExperiment',
  'outboundAbExperiment',
  'outboundAbFocusDimension',
  'outboundAbMinSamplesPerVariant',
  'outboundAbSampleReadyEmail'
]);

export function isVapiOutboundAbExperimentOnlyPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'vapi') return false;
  const v = body.vapi;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const vk = Object.keys(v);
  if (vk.length === 0) return false;
  for (const k of vk) {
    if (!DASHBOARD_SELF_SERVICE_VAPI_AB_KEYS.has(k)) return false;
    const val = v[k];
    if (val !== null && val !== undefined && typeof val !== 'string') return false;
  }
  return true;
}

export function createOutboundAbHandlers(deps) {
  const { invalidateClientCache, getFullClient, nanoid, createABTestExperiment } = deps;

  async function runOutboundAbTestSetup(clientKey, body, res) {
    try {
      const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
        './outbound-ab-review-lock.js'
      );
      invalidateClientCache(clientKey);
      const lockClient = await getFullClient(clientKey);
      if (isOutboundAbReviewPending(lockClient?.vapi)) {
        res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
        return;
      }
      const { OUTBOUND_AB_VAPI_KEYS } = await import('./outbound-ab-variant.js');
      const { experimentName, variants, replaceExisting = true, dimension } = body || {};
      const dimRaw = dimension != null ? String(dimension).trim().toLowerCase() : '';
      if (dimRaw !== 'voice' && dimRaw !== 'opening' && dimRaw !== 'script') {
        res.status(400).json({
          ok: false,
          error: 'dimension is required: "voice", "opening", or "script"'
        });
        return;
      }
      const validateVoiceIdForAb =
        dimRaw === 'voice'
          ? (await import('./elevenlabs-voice-id.js')).validateElevenLabsVoiceIdForAb
          : null;
      let nameTrim = experimentName != null ? String(experimentName).trim() : '';
      if (!nameTrim) {
        const slug = String(clientKey)
          .replace(/[^a-z0-9_-]+/gi, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 24);
        nameTrim = `ab_${slug || 'tenant'}_${nanoid(10)}`;
      }
      if (!Array.isArray(variants) || variants.length < 1) {
        res.status(400).json({ ok: false, error: 'At least one variant is required' });
        return;
      }
      let variantsList = [...variants];
      if (variantsList.length === 1) {
        const { resolveOutboundAbBaselineForDimension } = await import('./outbound-ab-baseline.js');
        const baseline = await resolveOutboundAbBaselineForDimension(clientKey, lockClient, dimRaw, {
          excludeSameDimensionExperiment: true
        });
        const u = variantsList[0];
        if (dimRaw === 'voice') {
          let ch = u.voice != null ? String(u.voice).trim() : '';
          if (!ch) {
            res.status(400).json({ ok: false, error: 'Challenger voice is empty' });
            return;
          }
          const voiceCheck = validateVoiceIdForAb(ch);
          if (!voiceCheck.ok) {
            res.status(400).json({ ok: false, error: voiceCheck.error });
            return;
          }
          ch = voiceCheck.id;
          if (baseline && ch === baseline) {
            res.status(400).json({
              ok: false,
              error: 'New voice matches your current live assistant voice. Use a different voice ID for the test.'
            });
            return;
          }
          variantsList = [{ name: 'control' }, { name: 'variant_b', voice: ch }];
        } else if (dimRaw === 'opening') {
          const ch = u.firstMessage != null ? String(u.firstMessage).trim() : '';
          if (!ch) {
            res.status(400).json({ ok: false, error: 'Challenger opening line is empty' });
            return;
          }
          if (baseline && ch === baseline) {
            res.status(400).json({
              ok: false,
              error: 'Opening line matches your current live assistant line. Change the uploaded text to run a test.'
            });
            return;
          }
          variantsList = [{ name: 'control' }, { name: 'variant_b', firstMessage: ch }];
        } else {
          const ch =
            u.script != null
              ? String(u.script).trim()
              : u.systemMessage != null
                ? String(u.systemMessage).trim()
                : '';
          if (!ch) {
            res.status(400).json({ ok: false, error: 'Challenger script is empty' });
            return;
          }
          if (baseline && ch === baseline) {
            res.status(400).json({
              ok: false,
              error: 'Script matches your current live assistant script. Change the uploaded script to run a test.'
            });
            return;
          }
          variantsList = [{ name: 'control' }, { name: 'variant_b', script: ch }];
        }
      }
      if (variantsList.length < 2) {
        res.status(400).json({ ok: false, error: 'At least two variants are required' });
        return;
      }
      const mapped = [];
      for (const v of variantsList) {
        const vn = String(v.name || v.variantName || '').trim();
        if (!vn) {
          res.status(400).json({ ok: false, error: 'Each variant needs a name' });
          return;
        }
        const isControlArm = vn.toLowerCase() === 'control';
        const voice = v.voice != null ? String(v.voice).trim() : '';
        const firstMessage = v.firstMessage != null ? String(v.firstMessage).trim() : '';
        const script =
          v.script != null
            ? String(v.script).trim()
            : v.systemMessage != null
              ? String(v.systemMessage).trim()
              : '';
        const config = {};
        if (dimRaw === 'voice') {
          if (isControlArm) {
            mapped.push({ name: vn, config: {} });
            continue;
          }
          if (!voice) {
            res.status(400).json({
              ok: false,
              error: `Variant "${vn}": voice experiments require a non-empty voice ID per variant`
            });
            return;
          }
          const voiceCheck = validateVoiceIdForAb(voice);
          if (!voiceCheck.ok) {
            res.status(400).json({ ok: false, error: voiceCheck.error });
            return;
          }
          config.voice = voiceCheck.id;
        } else if (dimRaw === 'opening') {
          if (isControlArm) {
            mapped.push({ name: vn, config: {} });
            continue;
          }
          if (!firstMessage) {
            res.status(400).json({
              ok: false,
              error: `Variant "${vn}": opening-line experiments require a non-empty opening line per variant`
            });
            return;
          }
          config.firstMessage = firstMessage;
        } else {
          if (isControlArm) {
            mapped.push({ name: vn, config: {} });
            continue;
          }
          if (!script) {
            res.status(400).json({
              ok: false,
              error: `Variant "${vn}": script experiments require non-empty script (system instructions) per variant`
            });
            return;
          }
          config.script = script;
        }
        mapped.push({ name: vn, config });
      }
      if (replaceExisting) {
        const { deactivateAbTestExperimentsByName } = await import('../db.js');
        const vapiKeyForDim = OUTBOUND_AB_VAPI_KEYS[dimRaw];
        const prevExp =
          lockClient?.vapi && typeof lockClient.vapi === 'object'
            ? String(lockClient.vapi[vapiKeyForDim] || '').trim()
            : '';
        if (prevExp && prevExp !== nameTrim) {
          await deactivateAbTestExperimentsByName(clientKey, prevExp);
        }
        await deactivateAbTestExperimentsByName(clientKey, nameTrim);
      }
      await createABTestExperiment({
        clientKey,
        experimentName: nameTrim,
        variants: mapped,
        isActive: true
      });
      const vapiKey = OUTBOUND_AB_VAPI_KEYS[dimRaw];
      const { updateClientConfig } = await import('./client-onboarding.js');
      await updateClientConfig(clientKey, {
        vapi: { [vapiKey]: nameTrim, outboundAbFocusDimension: dimRaw }
      });
      const { getOutboundAbExperimentSummary } = await import('../db.js');
      const { enrichOutboundAbDashboardSummariesFromAssistant } = await import(
        './outbound-ab-dashboard-enrich.js'
      );
      const summaryClient = await getFullClient(clientKey, { bypassCache: true });
      let voiceSummary = null;
      let openingSummary = null;
      let scriptSummary = null;
      if (dimRaw === 'voice') {
        voiceSummary = await getOutboundAbExperimentSummary(clientKey, nameTrim);
      } else if (dimRaw === 'opening') {
        openingSummary = await getOutboundAbExperimentSummary(clientKey, nameTrim);
      } else {
        scriptSummary = await getOutboundAbExperimentSummary(clientKey, nameTrim);
      }
      if (summaryClient) {
        await enrichOutboundAbDashboardSummariesFromAssistant(
          summaryClient,
          { voiceSummary, openingSummary, scriptSummary, legacyOutboundAbSummary: null },
          {}
        );
      }
      const slotSummary =
        dimRaw === 'voice' ? voiceSummary : dimRaw === 'opening' ? openingSummary : scriptSummary;
      res.json({
        ok: true,
        experimentName: nameTrim,
        dimension: dimRaw,
        vapiKey,
        variantCount: mapped.length,
        outboundAbFocusDimension: dimRaw,
        slotSummary
      });
    } catch (error) {
      console.error('[OUTBOUND AB TEST SETUP ERROR]', error);
      res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  }

  async function runOutboundAbChallengerUpdate(clientKey, body, res) {
    try {
      const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
        './outbound-ab-review-lock.js'
      );
      invalidateClientCache(clientKey);
      const lockClient = await getFullClient(clientKey);
      if (isOutboundAbReviewPending(lockClient?.vapi)) {
        res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
        return;
      }
      const { OUTBOUND_AB_VAPI_KEYS } = await import('./outbound-ab-variant.js');
      const dimRaw = body?.dimension != null ? String(body.dimension).trim().toLowerCase() : '';
      if (dimRaw !== 'voice' && dimRaw !== 'opening' && dimRaw !== 'script') {
        res.status(400).json({ ok: false, error: 'dimension must be voice, opening, or script' });
        return;
      }
      const vapiKey = OUTBOUND_AB_VAPI_KEYS[dimRaw];
      const expName =
        lockClient?.vapi && typeof lockClient.vapi === 'object'
          ? String(lockClient.vapi[vapiKey] || '').trim()
          : '';
      if (!expName) {
        res.status(404).json({
          ok: false,
          error: 'No active outbound A/B experiment configured for this dimension.'
        });
        return;
      }
      const { resolveChallengerVariantNameForExperiment, updateActiveAbTestVariantConfig } = await import('../db.js');
      const challengerName = await resolveChallengerVariantNameForExperiment(clientKey, expName);
      if (!challengerName) {
        res.status(404).json({ ok: false, error: 'No challenger variant row found for this experiment.' });
        return;
      }
      let ch = '';
      if (dimRaw === 'voice') {
        ch = body.voice != null ? String(body.voice).trim() : '';
        const { validateElevenLabsVoiceIdForAb } = await import('./elevenlabs-voice-id.js');
        const voiceCheck = validateElevenLabsVoiceIdForAb(ch);
        if (!voiceCheck.ok) {
          res.status(400).json({ ok: false, error: voiceCheck.error });
          return;
        }
        ch = voiceCheck.id;
      } else if (dimRaw === 'opening') {
        ch = body.firstMessage != null ? String(body.firstMessage).trim() : '';
      } else {
        ch =
          body.script != null
            ? String(body.script).trim()
            : body.systemMessage != null
              ? String(body.systemMessage).trim()
              : '';
      }
      if (!ch) {
        res.status(400).json({ ok: false, error: 'Challenger value is empty' });
        return;
      }
      const { resolveOutboundAbBaselineForDimension } = await import('./outbound-ab-baseline.js');
      const baseline = await resolveOutboundAbBaselineForDimension(clientKey, lockClient, dimRaw, {
        excludeSameDimensionExperiment: true
      });
      if (baseline && ch === baseline) {
        res.status(400).json({
          ok: false,
          error: 'New value matches your live assistant for this dimension. Use a different challenger.'
        });
        return;
      }
      const config =
        dimRaw === 'voice' ? { voice: ch } : dimRaw === 'opening' ? { firstMessage: ch } : { script: ch };
      const updated = await updateActiveAbTestVariantConfig({
        clientKey,
        experimentName: expName,
        variantName: challengerName,
        variantConfig: config
      });
      if (!updated) {
        res.status(500).json({
          ok: false,
          error: 'Could not update challenger (experiment may have been deactivated).'
        });
        return;
      }
      const { getOutboundAbExperimentSummary } = await import('../db.js');
      const { enrichOutboundAbDashboardSummariesFromAssistant } = await import(
        './outbound-ab-dashboard-enrich.js'
      );
      const summaryClient = await getFullClient(clientKey, { bypassCache: true });
      let voiceSummary = null;
      let openingSummary = null;
      let scriptSummary = null;
      if (dimRaw === 'voice') {
        voiceSummary = await getOutboundAbExperimentSummary(clientKey, expName);
      } else if (dimRaw === 'opening') {
        openingSummary = await getOutboundAbExperimentSummary(clientKey, expName);
      } else {
        scriptSummary = await getOutboundAbExperimentSummary(clientKey, expName);
      }
      if (summaryClient) {
        await enrichOutboundAbDashboardSummariesFromAssistant(
          summaryClient,
          { voiceSummary, openingSummary, scriptSummary, legacyOutboundAbSummary: null },
          {}
        );
      }
      const slotSummary =
        dimRaw === 'voice' ? voiceSummary : dimRaw === 'opening' ? openingSummary : scriptSummary;
      res.json({
        ok: true,
        experimentName: expName,
        dimension: dimRaw,
        variantName: challengerName,
        slotSummary
      });
    } catch (error) {
      console.error('[OUTBOUND AB CHALLENGER PATCH]', error);
      res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  }

  async function runOutboundAbDimensionStop(clientKey, dimRaw, res) {
    try {
      const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
        './outbound-ab-review-lock.js'
      );
      invalidateClientCache(clientKey);
      const lockClient = await getFullClient(clientKey);
      if (isOutboundAbReviewPending(lockClient?.vapi)) {
        res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
        return;
      }
      const { OUTBOUND_AB_VAPI_KEYS } = await import('./outbound-ab-variant.js');
      const { deactivateAbTestExperimentsByName, deactivateAllActiveOutboundAbSliceExperiments } =
        await import('../db.js');
      const { vapiPatchAfterStopOutboundAbDimension } = await import('./outbound-ab-focus.js');
      const { updateClientConfig } = await import('./client-onboarding.js');
      const d = String(dimRaw || '').trim().toLowerCase();
      if (d !== 'voice' && d !== 'opening' && d !== 'script') {
        res.status(400).json({ ok: false, error: 'dimension must be voice, opening, or script' });
        return;
      }
      const vapiKey = OUTBOUND_AB_VAPI_KEYS[d];
      const expName =
        lockClient?.vapi && typeof lockClient.vapi === 'object'
          ? String(lockClient.vapi[vapiKey] || '').trim()
          : '';
      if (expName) {
        await deactivateAbTestExperimentsByName(clientKey, expName);
      }
      const sliceExperimentsDeactivated = await deactivateAllActiveOutboundAbSliceExperiments(
        clientKey,
        d
      );
      const vapiPatch = vapiPatchAfterStopOutboundAbDimension(lockClient.vapi, d);
      await updateClientConfig(clientKey, { vapi: vapiPatch });
      invalidateClientCache(clientKey);
      const after = await getFullClient(clientKey);
      const v = after?.vapi && typeof after.vapi === 'object' ? after.vapi : {};
      const trimDial = (x) => (x != null && String(x).trim() !== '' ? String(x).trim() : '');
      const voiceExp = trimDial(v.outboundAbVoiceExperiment);
      const openingExp = trimDial(v.outboundAbOpeningExperiment);
      const scriptExp = trimDial(v.outboundAbScriptExperiment);
      const focusStored = trimDial(v.outboundAbFocusDimension).toLowerCase();
      const focusValid =
        focusStored === 'voice' || focusStored === 'opening' || focusStored === 'script' ? focusStored : '';
      const { resolveOutboundAbDimensionsForDial, outboundAbDialWarning } = await import('./outbound-ab-focus.js');
      const dialPairs = resolveOutboundAbDimensionsForDial({
        voiceExp,
        openingExp,
        scriptExp,
        focusDimension: focusValid
      });
      const dialActiveDimensions = dialPairs.map((pair) => pair[0]);
      const dialWarning = outboundAbDialWarning({
        voiceExp,
        openingExp,
        scriptExp,
        focusDimension: focusValid
      });
      res.json({
        ok: true,
        dimension: d,
        stoppedExperimentName: expName || null,
        sliceExperimentsDeactivated,
        dashboardDial: {
          dialActiveDimensions,
          dialWarning,
          focusDimension: focusValid || null
        }
      });
    } catch (error) {
      console.error('[OUTBOUND AB DIMENSION STOP]', error);
      res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  }

  return {
    runOutboundAbTestSetup,
    runOutboundAbChallengerUpdate,
    runOutboundAbDimensionStop,
  };
}
