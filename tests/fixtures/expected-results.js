// tests/fixtures/expected-results.js
// Expected results for various test scenarios

export const expectedExtractionResults = {
  fullTranscript: {
    email: 'john@testbusiness.com',
    international: 'Y',
    mainCouriers: ['DHL', 'FedEx'],
    frequency: '50 per week',
    mainCountries: ['USA', 'Germany', 'France'],
    exampleShipment: '5kg, 30x20x15cm',
    exampleShipmentCost: '£7',
    domesticFrequency: '20 per day',
    ukCourier: 'Royal Mail',
    standardRateUpToKg: '2kg',
    excludingFuelVat: 'Y',
    singleVsMulti: 'Single'
  },
  
  partialTranscript: {
    email: 'contact@business.co.uk',
    mainCouriers: ['DHL', 'Yodel'],
    frequency: '10 per week'
  },
  
  internationalOnly: {
    international: 'Y',
    mainCouriers: ['UPS'],
    mainCountries: ['Canada', 'Australia'],
    frequency: '30 per month'
  }
};

export const expectedQualityAnalysis = {
  positive: {
    sentiment: 'positive',
    qualityScore: 8,
    objections: [],
    keyPhrases: ['interested', 'tell me more', 'sounds good']
  },
  
  negative: {
    sentiment: 'negative',
    qualityScore: 3,
    objections: ['price', 'timing'],
    keyPhrases: ['too expensive', 'not interested', 'remove me']
  },
  
  neutral: {
    sentiment: 'neutral',
    qualityScore: 5,
    objections: [],
    keyPhrases: []
  }
};

export const expectedSheetData = {
  fullLogistics: {
    Timestamp: '2025-01-01T12:00:00.000Z',
    'Business Name': 'Test Business Ltd',
    'Decision Maker': 'John Smith',
    Phone: '+447491683261',
    Email: 'test@example.com',
    'International (Y/N)': 'Y',
    'Main Couriers': 'DHL, FedEx',
    Frequency: '50 per week',
    'Main Countries': 'USA, Germany',
    'Example Shipment (weight x dims)': '5kg, 30x20x15cm',
    'Example Shipment Cost': '£7',
    'Domestic Frequency': '20 per day',
    'UK Courier': 'Royal Mail',
    'Std Rate up to KG': '2kg',
    'Excl Fuel & VAT?': 'Y',
    'Single vs Multi-parcel': 'Single',
    'Receptionist Name': 'Sarah',
    'Callback Needed': 'FALSE',
    'Call ID': 'test_call_123',
    'Recording URI': 'https://api.vapi.ai/recordings/test.mp3',
    'Transcript Snippet': 'Hi, this is a test...'
  }
};

