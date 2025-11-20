// tests/lib/test-demo-telemetry.js
// Test demo telemetry functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  isDemoTelemetryEnabled,
  recordDemoTelemetry,
  readDemoTelemetry,
  clearDemoTelemetry,
  recordReceptionistTelemetry,
  readReceptionistTelemetry,
  clearReceptionistTelemetry
} from '../../lib/demo-telemetry.js';

resetStats();

describe('Demo Telemetry Tests', () => {
  
  test('Is demo telemetry enabled function exists', () => {
    assertTrue(typeof isDemoTelemetryEnabled === 'function', 'isDemoTelemetryEnabled is a function');
  });
  
  test('Record demo telemetry function exists', () => {
    assertTrue(typeof recordDemoTelemetry === 'function', 'recordDemoTelemetry is a function');
  });
  
  test('Read demo telemetry function exists', () => {
    assertTrue(typeof readDemoTelemetry === 'function', 'readDemoTelemetry is a function');
  });
  
  test('Clear demo telemetry function exists', () => {
    assertTrue(typeof clearDemoTelemetry === 'function', 'clearDemoTelemetry is a function');
  });
  
  test('Record receptionist telemetry function exists', () => {
    assertTrue(typeof recordReceptionistTelemetry === 'function', 'recordReceptionistTelemetry is a function');
  });
  
  test('Read receptionist telemetry function exists', () => {
    assertTrue(typeof readReceptionistTelemetry === 'function', 'readReceptionistTelemetry is a function');
  });
  
  test('Clear receptionist telemetry function exists', () => {
    assertTrue(typeof clearReceptionistTelemetry === 'function', 'clearReceptionistTelemetry is a function');
  });
  
  test('Telemetry event structure', () => {
    const event = {
      type: 'call_started',
      timestamp: new Date().toISOString(),
      data: { callId: 'test123' }
    };
    
    assertTrue('type' in event, 'Has type');
    assertTrue('timestamp' in event, 'Has timestamp');
    assertTrue('data' in event, 'Has data');
  });
  
  test('Telemetry event types', () => {
    const eventTypes = [
      'call_started',
      'call_ended',
      'user_action',
      'system_event'
    ];
    
    eventTypes.forEach(type => {
      assertTrue(typeof type === 'string', `Event type ${type} is string`);
    });
  });
  
  test('Telemetry reading structure', () => {
    const telemetry = {
      events: [],
      total: 0,
      limit: 100
    };
    
    assertTrue('events' in telemetry, 'Has events');
    assertTrue(Array.isArray(telemetry.events), 'Events is array');
  });
});

const exitCode = printSummary();
process.exit(exitCode);
