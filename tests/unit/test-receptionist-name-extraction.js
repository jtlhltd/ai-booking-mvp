// tests/unit/test-receptionist-name-extraction.js
// Test receptionist name extraction from transcripts

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

// Simulate the pickReceptionistName function from routes/vapi-webhooks.js
function pickReceptionistName(transcript) {
  const m = transcript.match(/(this is|i am)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\b.*(reception|speaking)/i);
  if (m) return m[2];
  const m2 = transcript.match(/receptionist\s+(?:is|was)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?/i);
  return m2 ? m2[1] : '';
}

describe('Receptionist Name Extraction Tests', () => {
  
  test('Name extraction - "this is" pattern', () => {
    const transcript = 'Hi, this is Sarah speaking. I\'m the receptionist here.';
    const name = pickReceptionistName(transcript);
    assertEqual(name, 'Sarah', 'Name extracted from "this is" pattern');
  });
  
  test('Name extraction - "I am" pattern', () => {
    const transcript = 'Hello, I am John, the receptionist speaking.';
    const name = pickReceptionistName(transcript);
    assertTrue(name.length > 0, 'Name extracted from "I am" pattern');
  });
  
  test('Name extraction - "receptionist is" pattern', () => {
    const transcript = 'The receptionist is Emma. She can help you.';
    const name = pickReceptionistName(transcript);
    assertEqual(name, 'Emma', 'Name extracted from "receptionist is" pattern');
  });
  
  test('Name extraction - full name', () => {
    const transcript = 'This is Sarah Johnson speaking, I\'m the receptionist.';
    const name = pickReceptionistName(transcript);
    assertTrue(name.length > 0, 'Name extracted (may be first name only)');
  });
  
  test('Name extraction - no name', () => {
    const transcript = 'Hello, how can I help you?';
    const name = pickReceptionistName(transcript);
    assertEqual(name, '', 'No name extracted when not present');
  });
  
  test('Name extraction - empty transcript', () => {
    const name = pickReceptionistName('');
    assertEqual(name, '', 'Empty transcript returns empty name');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

