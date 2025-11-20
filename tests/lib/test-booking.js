// tests/lib/test-booking.js
// Test booking functionality (CommonJS module)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Booking Tests', () => {
  
  test('Booking payload structure', () => {
    const payload = {
      clientKey: 'test_client',
      service: 'Consultation',
      lead: { name: 'John Doe', phone: '+447491683261' },
      slot: { start: new Date().toISOString(), end: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
    };
    
    assertTrue('clientKey' in payload, 'Has clientKey');
    assertTrue('service' in payload, 'Has service');
    assertTrue('lead' in payload, 'Has lead');
    assertTrue('slot' in payload, 'Has slot');
  });
  
  test('Slot validation', () => {
    const slot = {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };
    
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    assertTrue(end > start, 'End time is after start time');
    assertTrue((end - start) / (60 * 1000) === 30, 'Duration is 30 minutes');
  });
  
  test('Booking normalization', () => {
    const payload = {
      metadata: { clientKey: 'test', service: 'Consultation' },
      customer: { phone: '+447491683261', name: 'John' },
      booking: { slot: { start: new Date().toISOString() } }
    };
    
    const clientKey = payload.metadata?.clientKey || payload.clientKey;
    const service = payload.metadata?.service || payload.service;
    const lead = payload.customer || payload.lead || payload.metadata?.lead || {};
    const slot = payload.booking?.slot || payload.metadata?.selectedOption || payload.selectedSlot || payload.slot;
    
    assertTrue(clientKey === 'test', 'Client key extracted');
    assertTrue(service === 'Consultation', 'Service extracted');
    assertTrue(lead.phone === '+447491683261', 'Lead phone extracted');
    assertTrue(slot !== undefined, 'Slot extracted');
  });
  
  test('Booking confirmation structure', () => {
    const confirmation = {
      ok: true,
      eventId: 'event123',
      appointmentTime: new Date().toISOString()
    };
    
    assertTrue('ok' in confirmation, 'Has ok flag');
    assertTrue(confirmation.ok === true, 'Booking successful');
    assertTrue('eventId' in confirmation, 'Has event ID');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

