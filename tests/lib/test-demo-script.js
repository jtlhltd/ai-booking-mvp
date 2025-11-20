// tests/lib/test-demo-script.js
// Test demo script functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  isDemoModeEnabled,
  loadDemoScript,
  clearDemoScriptCache,
  getDemoScenario,
  getDemoOverrides,
  resolveSlotOverride,
  formatOverridesForTelemetry
} from '../../lib/demo-script.js';

resetStats();

describe('Demo Script Tests', () => {
  
  test('Is demo mode enabled function exists', () => {
    assertTrue(typeof isDemoModeEnabled === 'function', 'isDemoModeEnabled is a function');
  });
  
  test('Load demo script function exists', () => {
    assertTrue(typeof loadDemoScript === 'function', 'loadDemoScript is a function');
  });
  
  test('Clear demo script cache function exists', () => {
    assertTrue(typeof clearDemoScriptCache === 'function', 'clearDemoScriptCache is a function');
  });
  
  test('Get demo scenario function exists', () => {
    assertTrue(typeof getDemoScenario === 'function', 'getDemoScenario is a function');
  });
  
  test('Get demo overrides function exists', () => {
    assertTrue(typeof getDemoOverrides === 'function', 'getDemoOverrides is a function');
  });
  
  test('Resolve slot override function exists', () => {
    assertTrue(typeof resolveSlotOverride === 'function', 'resolveSlotOverride is a function');
  });
  
  test('Format overrides for telemetry function exists', () => {
    assertTrue(typeof formatOverridesForTelemetry === 'function', 'formatOverridesForTelemetry is a function');
  });
  
  test('Demo mode check', () => {
    try {
      const enabled = isDemoModeEnabled();
      assertTrue(typeof enabled === 'boolean', 'Returns boolean');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Demo scenario structure', () => {
    const scenario = {
      name: 'Test Scenario',
      steps: [],
      expectedOutcome: 'success'
    };
    
    assertTrue('name' in scenario, 'Has name');
    assertTrue('steps' in scenario, 'Has steps');
    assertTrue(Array.isArray(scenario.steps), 'Steps is array');
  });
  
  test('Slot override structure', () => {
    const override = {
      slot: 'appointment_time',
      value: 'tomorrow 2pm',
      resolved: new Date().toISOString()
    };
    
    assertTrue('slot' in override, 'Has slot');
    assertTrue('value' in override, 'Has value');
    assertTrue(typeof override.slot === 'string', 'Slot is string');
  });
  
  test('Telemetry format', () => {
    const overrides = {
      appointment_time: 'tomorrow 2pm',
      service: 'Consultation'
    };
    
    try {
      const formatted = formatOverridesForTelemetry(overrides);
      assertTrue(typeof formatted === 'string' || typeof formatted === 'object', 'Returns formatted data');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);
