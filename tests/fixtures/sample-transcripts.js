// tests/fixtures/sample-transcripts.js
// Sample transcripts for testing logistics extraction

export const transcripts = {
  full: `Hi, this is Sarah calling from ABC Logistics. I'm speaking with John Smith at Test Business Ltd. 
    
We ship internationally using DHL and FedEx, about 50 packages per week to USA, Germany, and France. 
Our typical shipment is 5kg, dimensions are 30x20x15cm, costs about £7 per package. 
We use Royal Mail for UK domestic shipping, about 20 packages per day. 
Our standard rates are up to 2kg, excluding fuel and VAT. 
We primarily do single parcel shipments. 
You can reach me at john@testbusiness.com.`,

  partial: `We use DHL and Yodel for shipping, about 10 packages per week. Email me at contact@business.co.uk`,

  minimal: `We ship packages. Contact us at info@test.com`,

  international: `Yes, we export outside the UK. We ship to Canada and Australia using UPS. About 30 packages per month.`,

  domestic: `We only ship within the UK. We use Royal Mail, about 20 packages per day.`,

  withReceptionist: `Hi, this is Sarah speaking. I'm the receptionist here. The decision maker is John Smith, but he's not available right now. Can you call back later?`,

  callbackNeeded: `The decision maker is not in right now. Can you call back tomorrow?`,

  multiParcel: `We ship multiple parcels at once, bulk shipments. About 100 packages per week.`,

  singleParcel: `We do single parcel shipments, one at a time.`,

  withCost: `Our typical shipment costs about 7 pounds per package, sometimes £10 for larger items.`,

  withDimensions: `Our packages are usually 30x20x15cm, sometimes 40x30x25cm for larger items.`,

  withWeight: `We ship packages that are typically 5kg, sometimes up to 10kg.`,

  excludingFuelVat: `Our rates are excluding fuel and VAT, you pay those separately.`,

  includingFuelVat: `Our rates are all inclusive, including fuel and VAT.`,

  empty: ``,

  short: `Hi, we ship packages.`,

  noLogistics: `Hi, this is a general business call with no logistics information.`
};

export const expectedExtractions = {
  full: {
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
  partial: {
    email: 'contact@business.co.uk',
    mainCouriers: ['DHL', 'Yodel'],
    frequency: '10 per week'
  },
  international: {
    international: 'Y',
    mainCouriers: ['UPS'],
    mainCountries: ['Canada', 'Australia'],
    frequency: '30 per month'
  }
};

