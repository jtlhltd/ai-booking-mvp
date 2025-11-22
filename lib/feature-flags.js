// lib/feature-flags.js
// Service degradation modes and feature flags

import { getFullClient } from './db.js';

// Global feature flags
const globalFeatureFlags = {
  smsEnabled: true,
  calendarEnabled: true,
  vapiEnabled: true,
  remindersEnabled: true,
  webhooksEnabled: true
};

/**
 * Check if feature is enabled
 */
export async function isFeatureEnabled(feature, clientKey = null) {
  // Check global flags
  if (globalFeatureFlags[feature] === false) {
    return false;
  }
  
  // Check client-specific overrides
  if (clientKey) {
    try {
      const client = await getFullClient(clientKey);
      if (client?.featureFlags?.[feature] === false) {
        return false;
      }
    } catch (error) {
      console.error('[FEATURE FLAGS] Failed to check client flags:', error);
      // Continue with global flags on error
    }
  }
  
  return globalFeatureFlags[feature] !== false;
}

/**
 * Disable feature globally
 */
export function disableFeature(feature) {
  globalFeatureFlags[feature] = false;
  console.log(`[FEATURE FLAGS] Disabled ${feature} globally`);
}

/**
 * Enable feature globally
 */
export function enableFeature(feature) {
  globalFeatureFlags[feature] = true;
  console.log(`[FEATURE FLAGS] Enabled ${feature} globally`);
}

/**
 * Get all feature flags
 */
export function getFeatureFlags() {
  return { ...globalFeatureFlags };
}

/**
 * Degradation strategies
 */
export async function withDegradation(feature, primaryFn, fallbackFn = null) {
  const enabled = await isFeatureEnabled(feature);
  
  if (!enabled) {
    console.log(`[DEGRADATION] ${feature} disabled, using fallback`);
    if (fallbackFn) {
      return await fallbackFn();
    }
    throw new Error(`Feature ${feature} is disabled and no fallback provided`);
  }
  
  try {
    return await primaryFn();
  } catch (error) {
    console.warn(`[DEGRADATION] ${feature} failed, trying fallback:`, error.message);
    if (fallbackFn) {
      try {
        return await fallbackFn();
      } catch (fallbackError) {
        throw new Error(`Primary and fallback both failed: ${error.message}, ${fallbackError.message}`);
      }
    }
    throw error;
  }
}

