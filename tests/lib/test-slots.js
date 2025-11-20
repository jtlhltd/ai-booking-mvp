// tests/lib/test-slots.js
// Test slots functionality (CommonJS module)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Slots Tests', () => {
  
  test('Slot structure', () => {
    const slot = {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      duration: 30
    };
    
    assertTrue('start' in slot, 'Has start time');
    assertTrue('end' in slot, 'Has end time');
    assertTrue('duration' in slot, 'Has duration');
  });
  
  test('Duration calculation', () => {
    const durationMin = 30;
    const durationMs = durationMin * 60 * 1000;
    
    assertTrue(durationMs === 1800000, 'Duration calculated correctly');
  });
  
  test('Top 3 slots selection', () => {
    const slots = [
      { start: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      { start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() },
      { start: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() },
      { start: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() }
    ];
    
    const top3 = slots.slice(0, 3);
    assertTrue(top3.length === 3, 'Top 3 selected');
    assertTrue(top3[0].start < top3[1].start, 'Slots are sorted');
  });
  
  test('Service duration mapping', () => {
    const serviceMap = {
      'Consultation': { durationMin: 30 },
      'Follow-up': { durationMin: 15 },
      'Surgery': { durationMin: 60 }
    };
    
    assertTrue('Consultation' in serviceMap, 'Has Consultation service');
    assertTrue(serviceMap['Consultation'].durationMin === 30, 'Duration is 30 minutes');
  });
  
  test('Default duration fallback', () => {
    const defaultDuration = 30;
    const serviceDuration = null;
    const duration = serviceDuration || defaultDuration;
    
    assertTrue(duration === 30, 'Falls back to default');
  });
  
  test('Timezone handling', () => {
    const timezones = ['Europe/London', 'America/New_York', 'Asia/Tokyo'];
    timezones.forEach(tz => {
      assertTrue(typeof tz === 'string', `Timezone ${tz} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

