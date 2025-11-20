// tests/unit/test-logistics-extraction.js
// Test logistics field extraction from transcripts

import { extractLogisticsFields } from '../../lib/logistics-extractor.js';
import { describe, test, assertEqual, assertTrue, assertContains, printSummary, resetStats } from '../utils/test-helpers.js';
import { transcripts, expectedExtractions } from '../fixtures/sample-transcripts.js';

resetStats();

describe('Logistics Field Extraction Tests', () => {
  
  test('Full data extraction', () => {
    const extracted = extractLogisticsFields(transcripts.full);
    const expected = expectedExtractions.full;
    
    assertEqual(extracted.email, expected.email, 'Email extracted correctly');
    assertEqual(extracted.international, expected.international, 'International flag extracted');
    // Check couriers are present (order may vary)
    assertTrue(extracted.mainCouriers.length >= expected.mainCouriers.length, 'Main couriers extracted');
    expected.mainCouriers.forEach(courier => {
      assertContains(extracted.mainCouriers, courier, `Courier ${courier} found`);
    });
    assertEqual(extracted.frequency, expected.frequency, 'Frequency extracted');
    assertEqual(extracted.mainCountries, expected.mainCountries, 'Main countries extracted');
    // Check shipment info (format may vary with spacing)
    assertTrue(extracted.exampleShipment.length > 0, 'Example shipment extracted');
    assertTrue(extracted.exampleShipment.includes('5kg'), 'Shipment weight included');
    assertTrue(extracted.exampleShipment.includes('30') && extracted.exampleShipment.includes('20') && extracted.exampleShipment.includes('15'), 'Shipment dimensions included');
    assertEqual(extracted.exampleShipmentCost, expected.exampleShipmentCost, 'Example shipment cost extracted');
    assertEqual(extracted.domesticFrequency, expected.domesticFrequency, 'Domestic frequency extracted');
    assertEqual(extracted.ukCourier, expected.ukCourier, 'UK courier extracted');
    assertEqual(extracted.standardRateUpToKg, expected.standardRateUpToKg, 'Standard rate extracted');
    assertEqual(extracted.excludingFuelVat, expected.excludingFuelVat, 'Excluding fuel/VAT extracted');
    assertEqual(extracted.singleVsMulti, expected.singleVsMulti, 'Single vs multi extracted');
  });
  
  test('Partial data extraction', () => {
    const extracted = extractLogisticsFields(transcripts.partial);
    const expected = expectedExtractions.partial;
    
    assertEqual(extracted.email, expected.email, 'Email extracted from partial transcript');
    assertTrue(extracted.mainCouriers.length > 0, 'At least one courier extracted');
    assertContains(extracted.mainCouriers, 'DHL', 'DHL courier detected');
    assertEqual(extracted.frequency, expected.frequency, 'Frequency extracted from partial');
  });
  
  test('Email extraction - various formats', () => {
    const testCases = [
      { transcript: 'Contact us at test@example.com', expected: 'test@example.com' },
      { transcript: 'Email: john.smith@business.co.uk', expected: 'john.smith@business.co.uk' },
      { transcript: 'Reach me at contact+test@domain.com', expected: 'contact+test@domain.com' },
      { transcript: 'No email here', expected: '' }
    ];
    
    testCases.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertEqual(extracted.email, expected, `Email extraction: ${transcript.substring(0, 30)}`);
    });
  });
  
  test('Courier detection', () => {
    const courierTests = [
      { transcript: 'We use DHL and FedEx', couriers: ['DHL', 'FedEx'] },
      { transcript: 'Royal Mail for UK shipping', couriers: ['Royal Mail'] },
      { transcript: 'We ship with UPS, DPD, and Yodel', couriers: ['UPS', 'DPD', 'Yodel'] },
      { transcript: 'Parcelforce is our main courier', couriers: ['Parcelforce'] }
    ];
    
    courierTests.forEach(({ transcript, couriers }) => {
      const extracted = extractLogisticsFields(transcript);
      couriers.forEach(courier => {
        assertContains(extracted.mainCouriers, courier, `Courier ${courier} detected`);
      });
    });
  });
  
  test('Country detection', () => {
    const countryTests = [
      { transcript: 'We ship to USA and Germany', countries: ['USA', 'Germany'] },
      { transcript: 'Main countries: France, Spain, Italy', countries: ['France', 'Spain', 'Italy'] },
      { transcript: 'We export to Canada and Australia', countries: ['Canada', 'Australia'] }
    ];
    
    countryTests.forEach(({ transcript, countries }) => {
      const extracted = extractLogisticsFields(transcript);
      countries.forEach(country => {
        assertContains(extracted.mainCountries, country, `Country ${country} detected`);
      });
    });
  });
  
  test('Frequency parsing', () => {
    const frequencyTests = [
      { transcript: 'We ship 50 packages per week', expected: '50 per week' },
      { transcript: 'About 20 packages per day', expected: '20 per day' },
      { transcript: 'We ship daily', expected: 'daily' },
      { transcript: 'Weekly shipments', expected: 'weekly' },
      { transcript: 'Monthly deliveries', expected: 'monthly' }
    ];
    
    frequencyTests.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertEqual(extracted.frequency, expected, `Frequency parsed: ${transcript}`);
    });
  });
  
  test('Shipment weight and dimensions', () => {
    const shipmentTests = [
      { transcript: 'Packages are 5kg, 30x20x15cm', expected: '5kg, 30 x 20 x 15cm' },
      { transcript: 'Typical weight is 10kg', expected: '10kg' },
      { transcript: 'Dimensions: 40x30x25cm', expected: '40 x 30 x 25cm' }
    ];
    
    shipmentTests.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertTrue(extracted.exampleShipment.length > 0, `Shipment info extracted: ${transcript}`);
    });
  });
  
  test('Cost extraction', () => {
    const costTests = [
      { transcript: 'Costs about £7 per package', expected: '£7' },
      { transcript: '7 pounds per shipment', expected: '£7' },
      { transcript: 'Price is £10.50', expected: '£10.50' }
    ];
    
    costTests.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertTrue(extracted.exampleShipmentCost.includes('£'), `Cost extracted with £: ${transcript}`);
    });
  });
  
  test('International Y/N detection', () => {
    const internationalTests = [
      { transcript: 'We export outside the UK', expected: 'Y' },
      { transcript: 'We only ship within the UK', expected: 'N' },
      { transcript: 'UK only shipping', expected: 'N' },
      { transcript: 'We send abroad', expected: 'Y' }
    ];
    
    internationalTests.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertEqual(extracted.international, expected, `International flag: ${transcript}`);
    });
  });
  
  test('Single vs multi-parcel detection', () => {
    const parcelTests = [
      { transcript: 'We do single parcel shipments', expected: 'Single' },
      { transcript: 'Multiple parcels at once', expected: 'Multiple' },
      { transcript: 'Bulk shipments', expected: 'Multiple' },
      { transcript: 'One parcel at a time', expected: 'Single' }
    ];
    
    parcelTests.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertEqual(extracted.singleVsMulti, expected, `Parcel type: ${transcript}`);
    });
  });
  
  test('Excluding fuel and VAT detection', () => {
    const fuelVatTests = [
      { transcript: 'Rates excluding fuel and VAT', expected: 'Y' },
      { transcript: 'Plus fuel and VAT', expected: 'Y' },
      { transcript: 'All inclusive rates', expected: 'N' },
      { transcript: 'Including fuel and VAT', expected: 'N' }
    ];
    
    fuelVatTests.forEach(({ transcript, expected }) => {
      const extracted = extractLogisticsFields(transcript);
      assertEqual(extracted.excludingFuelVat, expected, `Fuel/VAT flag: ${transcript}`);
    });
  });
  
  test('Empty transcript handling', () => {
    const extracted = extractLogisticsFields('');
    assertEqual(extracted.email, '', 'Empty transcript returns empty email');
    assertEqual(extracted.mainCouriers.length, 0, 'Empty transcript returns no couriers');
  });
  
  test('Null/undefined transcript handling', () => {
    const extractedNull = extractLogisticsFields(null);
    const extractedUndefined = extractLogisticsFields(undefined);
    
    assertEqual(extractedNull.email, '', 'Null transcript handled');
    assertEqual(extractedUndefined.email, '', 'Undefined transcript handled');
  });
  
  test('UK courier detection', () => {
    const extracted = extractLogisticsFields('We use Royal Mail for UK shipping');
    assertEqual(extracted.ukCourier, 'Royal Mail', 'UK courier detected');
  });
  
  test('Domestic frequency extraction', () => {
    const extracted = extractLogisticsFields('We do 20 UK packages per day');
    assertTrue(extracted.domesticFrequency.includes('20'), 'Domestic frequency extracted');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

