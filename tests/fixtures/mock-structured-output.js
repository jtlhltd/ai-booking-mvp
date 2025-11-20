// tests/fixtures/mock-structured-output.js
// Mock structured output examples from VAPI

export const structuredOutputs = {
  full: {
    businessName: 'ABC Logistics Ltd',
    decisionMaker: 'Jane Doe',
    email: 'jane@abclogistics.com',
    internationalYN: 'Y',
    courier1: 'DHL',
    courier2: 'FedEx',
    courier3: 'UPS',
    frequency: '50 per week',
    country1: 'USA',
    country2: 'Germany',
    country3: 'France',
    exampleShipment: '5kg, 30x20x15cm',
    exampleShipmentCost: '£7',
    domesticFrequency: '20 per day',
    ukCourier: 'Royal Mail',
    standardRateUpToKg: '2kg',
    exclFuelVAT: 'Y',
    singleVsMultiParcel: 'Single',
    receptionistName: 'Sarah',
    callbackNeeded: 'N'
  },
  
  partial: {
    businessName: 'Test Business',
    email: 'test@example.com',
    internationalYN: 'Y',
    courier1: 'DHL',
    frequency: '10 per week'
  },
  
  minimal: {
    businessName: 'Minimal Business'
  },
  
  withCallback: {
    businessName: 'Test Business',
    decisionMaker: 'John Smith',
    phone: '+447491683261',
    receptionistName: 'Sarah',
    callbackNeeded: 'Y',
    reason: 'Decision maker not available'
  },
  
  domestic: {
    businessName: 'UK Only Business',
    internationalYN: 'N',
    ukCourier: 'Royal Mail',
    domesticFrequency: '20 per day'
  },
  
  multiParcel: {
    businessName: 'Bulk Shipping Co',
    singleVsMultiParcel: 'Multiple',
    frequency: '100 per week'
  }
};

export function getStructuredOutput(scenario = 'full') {
  return structuredOutputs[scenario] || structuredOutputs.full;
}

