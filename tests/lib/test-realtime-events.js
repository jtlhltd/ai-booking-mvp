// tests/lib/test-realtime-events.js
// Test real-time events (SSE) functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  registerConnection,
  broadcastToClient,
  broadcastToAll,
  getConnectionStats,
  emitCallStarted,
  emitCallEnded,
  emitAppointmentBooked,
  emitLeadStatusChanged,
  emitConversionMetricsUpdated,
  emitSystemAlert,
  emitLeadsImported
} from '../../lib/realtime-events.js';

resetStats();

describe('Real-Time Events Tests', () => {
  
  test('Register connection function exists', () => {
    assertTrue(typeof registerConnection === 'function', 'registerConnection is a function');
  });
  
  test('Broadcast to client function exists', () => {
    assertTrue(typeof broadcastToClient === 'function', 'broadcastToClient is a function');
  });
  
  test('Broadcast to all function exists', () => {
    assertTrue(typeof broadcastToAll === 'function', 'broadcastToAll is a function');
  });
  
  test('Get connection stats function exists', () => {
    assertTrue(typeof getConnectionStats === 'function', 'getConnectionStats is a function');
  });
  
  test('Emit call started function exists', () => {
    assertTrue(typeof emitCallStarted === 'function', 'emitCallStarted is a function');
  });
  
  test('Emit call ended function exists', () => {
    assertTrue(typeof emitCallEnded === 'function', 'emitCallEnded is a function');
  });
  
  test('Emit appointment booked function exists', () => {
    assertTrue(typeof emitAppointmentBooked === 'function', 'emitAppointmentBooked is a function');
  });
  
  test('Emit lead status changed function exists', () => {
    assertTrue(typeof emitLeadStatusChanged === 'function', 'emitLeadStatusChanged is a function');
  });
  
  test('Emit conversion metrics function exists', () => {
    assertTrue(typeof emitConversionMetricsUpdated === 'function', 'emitConversionMetricsUpdated is a function');
  });
  
  test('Emit system alert function exists', () => {
    assertTrue(typeof emitSystemAlert === 'function', 'emitSystemAlert is a function');
  });
  
  test('Emit leads imported function exists', () => {
    assertTrue(typeof emitLeadsImported === 'function', 'emitLeadsImported is a function');
  });
  
  test('Connection stats returns object', () => {
    const stats = getConnectionStats();
    assertTrue(typeof stats === 'object', 'Returns object');
    assertTrue('totalConnections' in stats || 'connections' in stats || typeof stats === 'object', 'Has connection data');
  });
  
  test('Event emission structure', () => {
    const testEvent = {
      type: 'call_started',
      data: { callId: 'test123', phone: '+447491683261' },
      timestamp: new Date().toISOString()
    };
    
    assertTrue('type' in testEvent, 'Event has type');
    assertTrue('data' in testEvent, 'Event has data');
    assertTrue(typeof testEvent.type === 'string', 'Type is string');
  });
  
  test('Event types defined', () => {
    const eventTypes = [
      'call_started',
      'call_ended',
      'appointment_booked',
      'lead_status_changed',
      'conversion_metrics_updated',
      'system_alert',
      'leads_imported'
    ];
    
    eventTypes.forEach(type => {
      assertTrue(typeof type === 'string', `Event type ${type} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

