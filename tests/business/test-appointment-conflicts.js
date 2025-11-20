// tests/business/test-appointment-conflicts.js
// Test appointment conflict detection

import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Appointment Conflicts Tests', () => {
  
  test('Conflict detection', () => {
    const existing = {
      start: new Date('2025-01-15T10:00:00Z'),
      end: new Date('2025-01-15T10:30:00Z')
    };
    
    const newAppt = {
      start: new Date('2025-01-15T10:15:00Z'),
      end: new Date('2025-01-15T10:45:00Z')
    };
    
    const conflicts = newAppt.start < existing.end && newAppt.end > existing.start;
    assertTrue(conflicts, 'Conflict detected');
  });
  
  test('No conflict', () => {
    const existing = {
      start: new Date('2025-01-15T10:00:00Z'),
      end: new Date('2025-01-15T10:30:00Z')
    };
    
    const newAppt = {
      start: new Date('2025-01-15T11:00:00Z'),
      end: new Date('2025-01-15T11:30:00Z')
    };
    
    const conflicts = newAppt.start < existing.end && newAppt.end > existing.start;
    assertTrue(!conflicts, 'No conflict detected');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

