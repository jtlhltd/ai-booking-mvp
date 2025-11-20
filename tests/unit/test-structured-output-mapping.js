// tests/unit/test-structured-output-mapping.js
// Test structured output to sheet column mapping

import { extractLogisticsFields } from '../../lib/logistics-extractor.js';
import { describe, test, assertEqual, assertTrue, assertContains, printSummary, resetStats } from '../utils/test-helpers.js';
import { getStructuredOutput } from '../fixtures/mock-structured-output.js';

resetStats();

describe('Structured Output Mapping Tests', () => {
  
  function mapStructuredOutput(structuredOutput, transcript = '') {
    // Same mapping logic as in routes/vapi-webhooks.js
    const mapped = {
      email: structuredOutput.email || '',
      international: structuredOutput.internationalYN || '',
      mainCouriers: [
        structuredOutput.courier1,
        structuredOutput.courier2,
        structuredOutput.courier3
      ].filter(Boolean),
      frequency: structuredOutput.frequency || '',
      mainCountries: [
        structuredOutput.country1,
        structuredOutput.country2,
        structuredOutput.country3
      ].filter(Boolean),
      exampleShipment: structuredOutput.exampleShipment || '',
      exampleShipmentCost: structuredOutput.exampleShipmentCost || '',
      domesticFrequency: structuredOutput.domesticFrequency || '',
      ukCourier: structuredOutput.ukCourier || '',
      standardRateUpToKg: structuredOutput.standardRateUpToKg || '',
      excludingFuelVat: structuredOutput.exclFuelVAT || '',
      singleVsMulti: structuredOutput.singleVsMultiParcel || ''
    };
    
    // Fill gaps from transcript if structured output is incomplete
    if (transcript) {
      const transcriptExtracted = extractLogisticsFields(transcript);
      Object.keys(mapped).forEach(key => {
        if (!mapped[key] && transcriptExtracted[key]) {
          mapped[key] = transcriptExtracted[key];
        }
      });
    }
    
    return mapped;
  }
  
  test('Full structured output mapping', () => {
    const structured = getStructuredOutput('full');
    const mapped = mapStructuredOutput(structured);
    
    assertEqual(mapped.email, structured.email, 'Email mapped');
    assertEqual(mapped.international, structured.internationalYN, 'International mapped');
    assertTrue(mapped.mainCouriers.length >= 2, 'Multiple couriers mapped');
    assertContains(mapped.mainCouriers, 'DHL', 'DHL in couriers');
    assertContains(mapped.mainCouriers, 'FedEx', 'FedEx in couriers');
    assertEqual(mapped.frequency, structured.frequency, 'Frequency mapped');
    assertTrue(mapped.mainCountries.length >= 2, 'Multiple countries mapped');
  });
  
  test('Partial structured output mapping', () => {
    const structured = getStructuredOutput('partial');
    const mapped = mapStructuredOutput(structured);
    
    assertEqual(mapped.email, structured.email, 'Email mapped from partial');
    assertEqual(mapped.international, structured.internationalYN, 'International mapped from partial');
    assertTrue(mapped.mainCouriers.length > 0, 'At least one courier mapped');
  });
  
  test('Structured output with transcript fallback', () => {
    const structured = getStructuredOutput('partial');
    const transcript = 'We use Royal Mail for UK shipping, about 20 packages per day.';
    const mapped = mapStructuredOutput(structured, transcript);
    
    // Should have data from both structured output and transcript
    assertEqual(mapped.email, structured.email, 'Email from structured output');
    assertTrue(mapped.ukCourier.length > 0, 'UK courier from transcript fallback');
    assertTrue(mapped.domesticFrequency.length > 0, 'Domestic frequency from transcript');
  });
  
  test('Array field handling - couriers', () => {
    const structured = {
      courier1: 'DHL',
      courier2: 'FedEx',
      courier3: 'UPS'
    };
    const mapped = mapStructuredOutput(structured);
    
    assertEqual(mapped.mainCouriers.length, 3, 'All three couriers included');
    assertContains(mapped.mainCouriers, 'DHL', 'DHL included');
    assertContains(mapped.mainCouriers, 'FedEx', 'FedEx included');
    assertContains(mapped.mainCouriers, 'UPS', 'UPS included');
  });
  
  test('Array field handling - countries', () => {
    const structured = {
      country1: 'USA',
      country2: 'Germany',
      country3: 'France'
    };
    const mapped = mapStructuredOutput(structured);
    
    assertEqual(mapped.mainCountries.length, 3, 'All three countries included');
    assertContains(mapped.mainCountries, 'USA', 'USA included');
    assertContains(mapped.mainCountries, 'Germany', 'Germany included');
    assertContains(mapped.mainCountries, 'France', 'France included');
  });
  
  test('Missing field handling', () => {
    const structured = {
      businessName: 'Test Business'
      // Missing all other fields
    };
    const mapped = mapStructuredOutput(structured);
    
    assertEqual(mapped.email, '', 'Missing email returns empty');
    assertEqual(mapped.mainCouriers.length, 0, 'Missing couriers returns empty array');
    assertEqual(mapped.frequency, '', 'Missing frequency returns empty');
  });
  
  test('Empty structured output', () => {
    const mapped = mapStructuredOutput({});
    
    assertEqual(mapped.email, '', 'Empty structured output handled');
    assertEqual(mapped.mainCouriers.length, 0, 'Empty couriers array');
    assertEqual(mapped.mainCountries.length, 0, 'Empty countries array');
  });
  
  test('All 21 logistics columns mapped', () => {
    const structured = getStructuredOutput('full');
    const mapped = mapStructuredOutput(structured);
    
    // Check all required fields are present (even if empty)
    const requiredFields = [
      'email', 'international', 'mainCouriers', 'frequency', 'mainCountries',
      'exampleShipment', 'exampleShipmentCost', 'domesticFrequency', 'ukCourier',
      'standardRateUpToKg', 'excludingFuelVat', 'singleVsMulti'
    ];
    
    requiredFields.forEach(field => {
      assertTrue(field in mapped, `Field ${field} present in mapped data`);
    });
  });
  
  test('Field name mapping correctness', () => {
    const structured = {
      internationalYN: 'Y',
      exclFuelVAT: 'Y',
      singleVsMultiParcel: 'Single'
    };
    const mapped = mapStructuredOutput(structured);
    
    assertEqual(mapped.international, 'Y', 'internationalYN maps to international');
    assertEqual(mapped.excludingFuelVat, 'Y', 'exclFuelVAT maps to excludingFuelVat');
    assertEqual(mapped.singleVsMulti, 'Single', 'singleVsMultiParcel maps to singleVsMulti');
  });
  
  test('Transcript fallback priority', () => {
    const structured = {
      email: 'structured@example.com'
    };
    const transcript = 'Contact us at transcript@example.com';
    const mapped = mapStructuredOutput(structured, transcript);
    
    // Structured output should take priority
    assertEqual(mapped.email, 'structured@example.com', 'Structured output takes priority');
    
    // But transcript should fill missing fields
    const structuredMinimal = {};
    const mapped2 = mapStructuredOutput(structuredMinimal, transcript);
    assertTrue(mapped2.email.length > 0, 'Transcript fills missing email');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

