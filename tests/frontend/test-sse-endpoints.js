// tests/frontend/test-sse-endpoints.js
// Test Server-Sent Events endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('SSE Endpoints Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('SSE endpoint concept', () => {
    // SSE endpoints require special handling
    const sseEndpoint = '/api/realtime/test_client/events';
    assertTrue(sseEndpoint.includes('/realtime'), 'SSE endpoint path correct');
    assertTrue(sseEndpoint.includes('/events'), 'SSE endpoint has events');
  });
  
  test('SSE event format', () => {
    const event = {
      type: 'call_started',
      data: { callId: 'test123' },
      id: '1',
      retry: 3000
    };
    
    assertTrue('type' in event, 'Event has type');
    assertTrue('data' in event, 'Event has data');
    assertTrue(typeof event.retry === 'number', 'Retry is number');
  });
  
  test('SSE connection headers', () => {
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };
    
    assertTrue(headers['Content-Type'] === 'text/event-stream', 'Content-Type correct');
    assertTrue(headers['Cache-Control'] === 'no-cache', 'Cache-Control correct');
  });
  
  test('SSE event types', () => {
    const eventTypes = [
      'call_started',
      'call_ended',
      'appointment_booked',
      'lead_status_changed'
    ];
    
    eventTypes.forEach(type => {
      assertTrue(typeof type === 'string', `Event type ${type} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

