// lib/logistics-extractor.js
// Standalone logistics field extraction from call transcripts

export function extractLogisticsFields(transcript) {
  const results = {
    email: '',
    international: '',
    mainCouriers: [],
    frequency: '',
    mainCountries: [],
    exampleShipment: '',
    exampleShipmentCost: '',
    domesticFrequency: '',
    ukCourier: '',
    standardRateUpToKg: '',
    excludingFuelVat: '',
    singleVsMulti: ''
  };
  
  if (!transcript || typeof transcript !== 'string') return results;
  
  const text = transcript.toLowerCase();
  const original = transcript;

  // Email - strict validation
  const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
  const emailMatch = transcript.match(emailRegex);
  results.email = emailMatch ? emailMatch[0] : '';

  // International yes/no
  if (/export|outside\s+the\s+uk|international|send.*abroad|ship.*internationally/i.test(original)) {
    results.international = 'Y';
  } else if (/only\s+uk|uk\s+only|domestic\s+only|only\s+ship.*uk|only\s+within.*uk|we\s+only\s+ship\s+within/i.test(original)) {
    results.international = 'N';
  }

  // Main couriers - exact word boundaries only
  const courierMap = {
    'yodel': 'Yodel',
    'royal mail': 'Royal Mail',
    'parcelforce': 'Parcelforce',
    'parcel force': 'Parcelforce',
    'ups': 'UPS',
    'fedex': 'FedEx',
    'dhl': 'DHL',
    'dpd': 'DPD',
    'hermes': 'Hermes',
    'evri': 'Evri',
    'apc': 'APC',
    'citylink': 'Citylink',
    'dx': 'DX',
    'interlink': 'Interlink'
  };

  for (const [key, value] of Object.entries(courierMap)) {
    const regex = new RegExp(`\\b${key.replace(/ /g, '\\s+')}\\b`, 'i');
    if (regex.test(original)) {
      results.mainCouriers.push(value);
    }
  }

  // Frequency - match patterns like "50 packages per week", "about 20 per day"
  const freqMatch = original.match(/(?:about\s+)?(\d+)\s*(?:packages?|parcels?|times?|shipments?)?\s*(?:per|a)\s*(day|week|month)/i) ||
                    original.match(/(\d+)\s*(?:per|times?)\s*(day|week|month)/i);
  if (freqMatch) {
    results.frequency = `${freqMatch[1]} per ${freqMatch[2]}`;
  } else if (/\bdaily\b/i.test(original)) {
    results.frequency = 'daily';
  } else if (/\bweekly\b/i.test(original)) {
    results.frequency = 'weekly';
  } else if (/\bmonthly\b/i.test(original)) {
    results.frequency = 'monthly';
  }

  // Main countries
  const countries = {
    'usa': 'USA',
    'united states': 'United States',
    'canada': 'Canada',
    'germany': 'Germany',
    'france': 'France',
    'spain': 'Spain',
    'italy': 'Italy',
    'netherlands': 'Netherlands',
    'ireland': 'Ireland',
    'australia': 'Australia',
    'china': 'China',
    'hong kong': 'Hong Kong',
    'japan': 'Japan',
    'uae': 'UAE',
    'russia': 'Russia',
    'india': 'India',
    'poland': 'Poland',
    'sweden': 'Sweden',
    'norway': 'Norway',
    'denmark': 'Denmark',
    'belgium': 'Belgium',
    'portugal': 'Portugal'
  };

  for (const [key, value] of Object.entries(countries)) {
    if (original.toLowerCase().includes(key)) {
      results.mainCountries.push(value);
    }
  }

  // Example shipment: weight/dimensions
  const weightMatch = original.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilograms?|kgs?)/i);
  const dimsByMatch = original.match(/(\d+)\s*(?:x|by)\s*(\d+)\s*(?:x|by)\s*(\d+)\s*(?:cm|mm|in|inch|inches)?/i);
  if (weightMatch && dimsByMatch) {
    results.exampleShipment = `${weightMatch[1]}kg, ${dimsByMatch[1]} x ${dimsByMatch[2]} x ${dimsByMatch[3]}cm`;
  } else if (dimsByMatch) {
    results.exampleShipment = `${dimsByMatch[1]} x ${dimsByMatch[2]} x ${dimsByMatch[3]}cm`;
  } else if (weightMatch) {
    results.exampleShipment = `${weightMatch[1]}kg`;
  }

  // Example shipment cost
  // Example shipment cost - support "£7" and "7 pound(s)"
  const costPounds = original.match(/\b(\d+(?:\.\d{1,2})?)\s*pounds?\b/i);
  const costSymbol = original.match(/£\s?(\d+(?:\.\d{1,2})?)/);
  if (costSymbol) {
    results.exampleShipmentCost = `£${costSymbol[1]}`;
  } else if (costPounds) {
    results.exampleShipmentCost = `£${costPounds[1]}`;
  }

  // Domestic frequency - match "20 packages per day" when context suggests UK/domestic
  // Look for patterns like "UK shipping, about 20 packages per day" or "domestic shipping, 20 per day"
  const ukFreqPattern1 = /(?:uk|domestic)[^.]{0,100}?(?:about\s+)?(\d+)\s*(?:packages?|parcels?)?\s*(?:per|a)\s*(day|week)/i;
  const ukFreqPattern2 = /(?:about\s+)?(\d+)\s*(?:uk|domestic)\s*(?:packages?|parcels?)\s*(?:per|a)\s*(day|week)/i;
  const ukFreqMatch = original.match(ukFreqPattern1) || original.match(ukFreqPattern2);
  if (ukFreqMatch) {
    results.domesticFrequency = `${ukFreqMatch[1]} per ${ukFreqMatch[2]}`;
  }
  
  // Standard rate up to KG - match "up to 2kg" or "standard rates are up to 2kg"
  const stdRateMatch = original.match(/(?:up\s+to|standard.*up\s+to|rates?.*up\s+to)\s*(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)/i);
  if (stdRateMatch) {
    results.standardRateUpToKg = `${stdRateMatch[1]}kg`;
  }

  // UK courier
  for (const [key, value] of Object.entries(courierMap)) {
    if (/\buk\b/i.test(original) && new RegExp(`\\b${key.replace(/ /g, '\\s+')}\\b`, 'i').test(original)) {
      results.ukCourier = value;
      break;
    }
  }

  // Excluding fuel and VAT?
  if (/excluding.*fuel|excl.*fuel|plus.*fuel|additional.*fuel|excluding.*vat|plus.*vat/i.test(original)) {
    results.excludingFuelVat = 'Y';
  } else if (/including.*fuel|all\s+inclusive/i.test(original)) {
    results.excludingFuelVat = 'N';
  }

  // Single vs multi-parcel
  if (/\bsingle\s+parcels?\b|\bone\s+parcel\b/i.test(original)) {
    results.singleVsMulti = 'Single';
  } else if (/\bmultiple\s+parcels?\b|\bbulk\s+shipments?\b/i.test(original)) {
    results.singleVsMulti = 'Multiple';
  }

  return results;
}
