import { Router } from 'express';

import { scrubBody } from '../lib/log-scrubber.js';

export function createClientOpsRouter(deps) {
  const {
    getFullClient,
    nanoid,
    createABTestExperiment,
    invalidateClientCache,
    runOutboundAbTestSetup,
    runOutboundAbChallengerUpdate,
    runOutboundAbDimensionStop,
    isDashboardSelfServiceClient,
    isVapiOutboundAbExperimentOnlyPatch,
  } = deps || {};

  const router = Router();

  // Client Onboarding API (admin only)
  router.post('/api/onboard-client', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { onboardClient } = await import('../lib/client-onboarding.js');
      const result = await onboardClient(req.body);
      res.json(result);
    } catch (error) {
      console.error('[ONBOARDING API ERROR]', error);
      res.status(500).json({
        ok: false,
        error: error.message,
        details: error.stack,
      });
    }
  });

  // Update Client Configuration
  router.patch('/api/clients/:clientKey/config', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const apiKey = req.get('X-API-Key');
      const keyOk = apiKey && apiKey === process.env.API_KEY;
      const selfServiceOk =
        isDashboardSelfServiceClient(clientKey) && isVapiOutboundAbExperimentOnlyPatch(req.body);
      if (!keyOk && !selfServiceOk) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (selfServiceOk) {
        const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
          '../lib/outbound-ab-review-lock.js'
        );
        const existingLock = await getFullClient(clientKey);
        if (isOutboundAbReviewPending(existingLock?.vapi)) {
          return res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
        }
      }

      const { updateClientConfig } = await import('../lib/client-onboarding.js');
      const result = await updateClientConfig(clientKey, req.body);
      res.json(result);
    } catch (error) {
      console.error('[UPDATE CONFIG ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Dashboard A/B routes
  router.post('/api/clients/:clientKey/outbound-ab-test', async (req, res) => {
    const { clientKey } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    await runOutboundAbTestSetup(clientKey, req.body, res);
  });

  router.patch('/api/clients/:clientKey/outbound-ab-challenger', async (req, res) => {
    const { clientKey } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    await runOutboundAbChallengerUpdate(clientKey, req.body, res);
  });

  router.delete('/api/clients/:clientKey/outbound-ab-dimension/:dimension', async (req, res) => {
    const { clientKey, dimension } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    await runOutboundAbDimensionStop(clientKey, String(dimension || '').trim().toLowerCase(), res);
  });

  // Tom / dashboard: same as outbound-ab-test but body is JSON text + dimension
  router.post('/api/clients/:clientKey/outbound-ab-test-import', async (req, res) => {
    const { clientKey } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const { dimension, json, experimentName: expTop, replaceExisting } = req.body || {};
    const text = typeof json === 'string' ? json : json != null ? JSON.stringify(json) : '';
    if (!String(text).trim()) {
      return res.status(400).json({ ok: false, error: 'json field is required (string or object)' });
    }
    let parsed;
    try {
      const { parseOutboundAbUploadSpec } = await import('../lib/outbound-ab-upload-spec.js');
      parsed = parseOutboundAbUploadSpec(text, dimension);
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || String(e) });
    }
    const top = expTop != null ? String(expTop).trim() : '';
    const fromSpec = parsed.experimentName || '';
    const mergedName = top || fromSpec || undefined;
    await runOutboundAbTestSetup(
      clientKey,
      {
        dimension,
        variants: parsed.variants,
        replaceExisting: replaceExisting !== false,
        ...(mergedName ? { experimentName: mergedName } : {}),
      },
      res,
    );
  });

  // Tom / dashboard: one JSON upload → three experiments (voice, opening, script) + bundle phase
  router.post('/api/clients/:clientKey/outbound-ab-test-bundle', async (req, res) => {
    const { clientKey } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const raw = typeof req.body?.json === 'string' ? req.body.json : req.body?.json != null ? JSON.stringify(req.body.json) : '';
    const text = String(raw || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'json field is required (string or object)' });
    }
    let voices;
    let openings;
    let scripts;
    try {
      const { parseOutboundAbBundleSpec, stringsToMappedVariants } = await import('../lib/outbound-ab-bundle-spec.js');
      ({ voices, openings, scripts } = parseOutboundAbBundleSpec(text));
      const voiceVariants = stringsToMappedVariants('voice', voices);
      const openingVariants = stringsToMappedVariants('opening', openings);
      const scriptVariants = stringsToMappedVariants('script', scripts);

      const { deactivateAbTestExperimentsByName } = await import('../db.js');
      const existing = await getFullClient(clientKey);
      const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import('../lib/outbound-ab-review-lock.js');
      if (isOutboundAbReviewPending(existing?.vapi)) {
        return res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
      }
      const prevVapi = existing && existing.vapi && typeof existing.vapi === 'object' ? existing.vapi : {};
      for (const k of ['outboundAbVoiceExperiment', 'outboundAbOpeningExperiment', 'outboundAbScriptExperiment']) {
        const n = prevVapi[k] != null ? String(prevVapi[k]).trim() : '';
        if (n) await deactivateAbTestExperimentsByName(clientKey, n);
      }

      const slug = String(clientKey)
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24);
      const bid = nanoid(8);
      const voiceExp = `ab_b_${slug || 'tenant'}_${bid}_voice`;
      const openingExp = `ab_b_${slug || 'tenant'}_${bid}_open`;
      const scriptExp = `ab_b_${slug || 'tenant'}_${bid}_script`;

      for (const [name, variants] of [
        [voiceExp, voiceVariants],
        [openingExp, openingVariants],
        [scriptExp, scriptVariants],
      ]) {
        await deactivateAbTestExperimentsByName(clientKey, name);
        await createABTestExperiment({ clientKey, experimentName: name, variants, isActive: true });
      }

      const { OUTBOUND_AB_VAPI_KEYS } = await import('../lib/outbound-ab-variant.js');
      const { updateClientConfig } = await import('../lib/client-onboarding.js');
      const nowIso = new Date().toISOString();
      await updateClientConfig(clientKey, {
        vapi: {
          [OUTBOUND_AB_VAPI_KEYS.voice]: voiceExp,
          [OUTBOUND_AB_VAPI_KEYS.opening]: openingExp,
          [OUTBOUND_AB_VAPI_KEYS.script]: scriptExp,
          outboundAbFocusDimension: 'voice',
          outboundAbBundlePhase: 'voice',
          outboundAbBundleAt: nowIso,
          outboundAbReviewPending: '',
        },
      });

      return res.json({
        ok: true,
        voiceExperiment: voiceExp,
        openingExperiment: openingExp,
        scriptExperiment: scriptExp,
        bundlePhase: 'voice',
        outboundAbFocusDimension: 'voice',
        variantCounts: {
          voice: voiceVariants.length,
          opening: openingVariants.length,
          script: scriptVariants.length,
        },
      });
    } catch (e) {
      console.error('[OUTBOUND AB BUNDLE ERROR]', e);
      const msg = e && e.message ? String(e.message) : String(e);
      const code = /Invalid JSON|Missing |Empty |dimension must|Each list needs/.test(msg) ? 400 : 500;
      return res.status(code).json({ ok: false, error: msg });
    }
  });

  // Advance bundle: voice → opening → script → complete
  router.post('/api/clients/:clientKey/outbound-ab-test-bundle-advance', async (req, res) => {
    const { clientKey } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    try {
      const client = await getFullClient(clientKey);
      const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import('../lib/outbound-ab-review-lock.js');
      if (isOutboundAbReviewPending(client?.vapi)) {
        return res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
      }
      const { advanceOutboundAbBundlePhase } = await import('../lib/outbound-ab-bundle-advance.js');
      const out = await advanceOutboundAbBundlePhase(clientKey);
      if (!out.advanced) {
        return res.status(400).json({
          ok: false,
          error:
            out.reason === 'no_active_phase'
              ? 'No active bundle phase. Deploy a bundle from the dashboard first.'
              : out.reason || 'Cannot advance bundle',
        });
      }
      return res.json({
        ok: true,
        bundlePhase: out.bundlePhase,
        outboundAbFocusDimension: out.outboundAbFocusDimension,
      });
    } catch (error) {
      console.error('[OUTBOUND AB BUNDLE ADVANCE ERROR]', error);
      return res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  });

  // Operator: clear review lock and advance one bundle phase
  router.post('/api/clients/:clientKey/outbound-ab-review-continue', async (req, res) => {
    const { clientKey } = req.params;
    const apiKey = req.get('X-API-Key');
    const keyOk = apiKey && apiKey === process.env.API_KEY;
    const selfOk = isDashboardSelfServiceClient(clientKey);
    if (!keyOk && !selfOk) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    try {
      const { isOutboundAbReviewPending } = await import('../lib/outbound-ab-review-lock.js');
      const { updateClientConfig } = await import('../lib/client-onboarding.js');
      const before = await getFullClient(clientKey);
      if (!isOutboundAbReviewPending(before?.vapi)) {
        return res.status(400).json({
          ok: false,
          error: 'No review is pending. This action runs only after the sample-ready email.',
        });
      }
      await updateClientConfig(clientKey, { vapi: { outboundAbReviewPending: '' } });
      const after = await getFullClient(clientKey);
      const phase =
        after?.vapi?.outboundAbBundlePhase != null ? String(after.vapi.outboundAbBundlePhase).trim().toLowerCase() : '';
      let bundlePhase = phase || null;
      let outboundAbFocusDimension =
        after?.vapi?.outboundAbFocusDimension != null ? String(after.vapi.outboundAbFocusDimension).trim() : null;
      let advanced = false;
      if (phase && phase !== 'complete') {
        const { advanceOutboundAbBundlePhase } = await import('../lib/outbound-ab-bundle-advance.js');
        const adv = await advanceOutboundAbBundlePhase(clientKey);
        advanced = adv.advanced;
        if (adv.bundlePhase) bundlePhase = adv.bundlePhase;
        if (adv.outboundAbFocusDimension) outboundAbFocusDimension = adv.outboundAbFocusDimension;
      }
      invalidateClientCache(clientKey);
      const finalClient = await getFullClient(clientKey);
      return res.json({
        ok: true,
        reviewPending: false,
        bundleAdvanced: advanced,
        bundlePhase,
        outboundAbFocusDimension,
        vapi: finalClient?.vapi || null,
      });
    } catch (error) {
      console.error('[OUTBOUND AB REVIEW CONTINUE ERROR]', error);
      return res.status(500).json({ ok: false, error: error.message || String(error) });
    }
  });

  // Deactivate Client
  router.post('/api/clients/:clientKey/deactivate', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { deactivateClient } = await import('../lib/client-onboarding.js');
      const result = await deactivateClient(req.params.clientKey, req.body.reason);
      res.json(result);
    } catch (error) {
      console.error('[DEACTIVATE CLIENT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Public signup endpoint (no API key required)
  router.post('/api/signup', async (req, res) => {
    try {
      const {
        businessName,
        industry,
        primaryService,
        serviceArea,
        website,
        ownerName,
        email,
        phone,
        role,
        currentLeadSource,
        voiceGender,
        workingDays,
        workingHours,
        yearlySchedule,
        businessSize,
        monthlyLeads,
        timezone,
      } = req.body;

      if (!businessName || !industry || !primaryService || !serviceArea || !ownerName || !email || !phone) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
        });
      }

      console.log(`[SIGNUP] New signup request for ${businessName} (${email})`);
      console.log(`[SIGNUP] Request body:`, scrubBody(req.body));

      const { createClient, sendWelcomeEmail } = await import('../lib/auto-onboarding.js');
      console.log(`[SIGNUP] Auto-onboarding module imported successfully`);

      const result = await createClient({
        businessName,
        industry,
        primaryService,
        serviceArea,
        website,
        ownerName,
        email,
        phone,
        role,
        currentLeadSource,
        voiceGender,
        workingDays,
        workingHours,
        yearlySchedule,
        businessSize,
        monthlyLeads,
        timezone,
      });

      sendWelcomeEmail({
        clientKey: result.clientKey,
        businessName: result.businessName,
        ownerEmail: result.ownerEmail,
        apiKey: result.apiKey,
        systemPrompt: result.systemPrompt,
        businessSize,
        monthlyLeads,
        workingDays,
        workingHours,
        yearlySchedule,
      }).catch((error) => {
        console.error('[SIGNUP] Welcome email failed:', error);
      });

      return res.json({
        success: true,
        clientKey: result.clientKey,
        apiKey: result.apiKey,
        message: 'Account created successfully! Check your email for setup instructions.',
      });
    } catch (error) {
      console.error('[SIGNUP] Error:', error);

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'An account with this business name already exists. Please contact support.',
        });
      }

      if (error.code === '42P01') {
        console.error('[SIGNUP] Database table missing, creating...');
        try {
          const { query } = await import('../db.js');
          await query(`
          CREATE TABLE IF NOT EXISTS client_metadata (
            id BIGSERIAL PRIMARY KEY,
            client_key TEXT NOT NULL UNIQUE,
            owner_name TEXT,
            owner_email TEXT,
            owner_phone TEXT,
            industry TEXT,
            website TEXT,
            service_area TEXT,
            plan_name TEXT,
            trial_ends_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

          const { createClient, sendWelcomeEmail } = await import('../lib/auto-onboarding.js');
          const plan = 'free_trial';
          const result = await createClient({
            businessName,
            industry,
            primaryService,
            serviceArea,
            website,
            ownerName,
            email,
            phone,
            role,
            currentLeadSource,
            voiceGender,
            workingDays,
            workingHours,
            yearlySchedule,
            businessSize,
            monthlyLeads,
            timezone,
            businessHours: '9am-5pm Mon-Fri',
            plan,
          });

          sendWelcomeEmail({
            clientKey: result.clientKey,
            businessName: result.businessName,
            ownerEmail: result.ownerEmail,
            apiKey: result.apiKey,
            systemPrompt: result.systemPrompt,
            businessSize,
            monthlyLeads,
            workingDays,
            workingHours,
            yearlySchedule,
          }).catch((emailError) => {
            console.error('[SIGNUP] Welcome email failed:', emailError);
          });

          return res.json({
            success: true,
            clientKey: result.clientKey,
            apiKey: result.apiKey,
            message: 'Account created successfully! Check your email for setup instructions.',
          });
        } catch (retryError) {
          console.error('[SIGNUP] Retry failed:', retryError);
        }
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create account. Please try again or contact support.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });

  return router;
}

