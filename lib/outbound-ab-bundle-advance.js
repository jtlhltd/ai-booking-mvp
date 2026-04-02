// Single step: voice → opening → script → complete (config only).

import { getFullClient } from '../db.js';
import { updateClientConfig } from './client-onboarding.js';

/**
 * @returns {Promise<{ advanced: boolean, bundlePhase?: string, outboundAbFocusDimension?: string, reason?: string }>}
 */
export async function advanceOutboundAbBundlePhase(clientKey) {
  const client = await getFullClient(clientKey);
  const phaseRaw =
    client && client.vapi && client.vapi.outboundAbBundlePhase != null
      ? String(client.vapi.outboundAbBundlePhase).trim().toLowerCase()
      : '';
  if (!phaseRaw || phaseRaw === 'complete') {
    return { advanced: false, reason: 'no_active_phase' };
  }
  if (phaseRaw === 'voice') {
    await updateClientConfig(clientKey, {
      vapi: { outboundAbFocusDimension: 'opening', outboundAbBundlePhase: 'opening' }
    });
    return { advanced: true, bundlePhase: 'opening', outboundAbFocusDimension: 'opening' };
  }
  if (phaseRaw === 'opening') {
    await updateClientConfig(clientKey, {
      vapi: { outboundAbFocusDimension: 'script', outboundAbBundlePhase: 'script' }
    });
    return { advanced: true, bundlePhase: 'script', outboundAbFocusDimension: 'script' };
  }
  if (phaseRaw === 'script') {
    await updateClientConfig(clientKey, {
      vapi: { outboundAbBundlePhase: 'complete' }
    });
    return { advanced: true, bundlePhase: 'complete', outboundAbFocusDimension: 'script' };
  }
  return { advanced: false, reason: `unknown_phase_${phaseRaw}` };
}
