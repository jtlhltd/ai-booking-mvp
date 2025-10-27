// lib/logistics-extractor.js
// Standalone logistics field extraction from call transcripts

export function extractLogisticsFields(transcript) {
  const text = (transcript || '').toLowerCase();
  const transcriptOriginal = transcript || '';
  
  const pick = (re) => {
    const m = text.match(re);
    return m ? (m[1] || m[0]).trim() : '';
  };
  const pickAll = (re) => {
    const matches = [...text.matchAll(re)].map(m => (m[1] || m[0]).trim());
    return Array.from(new Set(matches));
  };

  // Email - Multiple patterns for extraction
  const email = pick(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || 
                pick(/(?:email|address|contact)\s*[:\-]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) ||
                pick(/([a-z0-9]+(?:\.[a-z0-9]+)*@(?:gmail|yahoo|hotmail|outlook|company|business)\.[a-z]{2,})/i);

  // International yes/no
  let international = '';
  if (/outside\s+the\s+uk.*\byes\b|\binternational\b.*\byes\b|export.*yes|send.*abroad.*yes|do\s+send\s+internationally|send\s+internationally|\bexport\b/i.test(transcriptOriginal)) {
    international = 'Y';
  } else if (/outside\s+the\s+uk.*\bno\b|\binternational\b.*\bno\b|only\s+uk|uk\s+only|domestic\s+only/i.test(transcriptOriginal)) {
    international = 'N';
  }

  // Main couriers - Look for known courier names
  const knownCouriers = ['ups','fedex','dhl','dpd','hermes','evri','royal mail','parcel force','parcelforce','yodel','dpd','apc','citylink','dx','interlink','amazon logistics'];
  const mainCouriers = knownCouriers.filter(c => text.includes(c)).map(c => c.charAt(0).toUpperCase() + c.slice(1));

  // Frequency - Look for patterns like "200 per week", "daily", etc.
  let frequency = '';
  const freqMatch = text.match(/(\d+)\s*(?:per|times?)\s*(day|week|month)/i);
  if (freqMatch) {
    frequency = `${freqMatch[1]} per ${freqMatch[2]}`;
  } else {
    const dailyMatch = text.match(/\b(daily|weekly|monthly)\b/i);
    if (dailyMatch) frequency = dailyMatch[1];
    
    // Also catch "about 500 packages" or "200 packages a month"
    const pkgMatch = text.match(/(?:about|around|approximately)?\s*(\d+)\s*(?:packages?|parcels?)\s*(?:per|a|every)?\s*(day|week|month)?/i);
    if (pkgMatch && !frequency) {
      frequency = `${pkgMatch[1]} ${pkgMatch[2] ? 'per ' + pkgMatch[2] : 'per month'}`;
    }
  }

  // Main countries
  const countryWords = ['usa','united states','canada','germany','france','spain','italy','netherlands','ireland','australia','china','hong kong','japan','uae','dubai','saudi','india','poland','sweden','norway','denmark','belgium','portugal','greece','south africa','mexico','brazil','singapore','malaysia','thailand','south korea','taiwan','new zealand'];
  const mainCountries = countryWords.filter(c => text.includes(c)).map(c => c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));

  // Example shipment: weight/dimensions
  let exampleShipment = '';
  
  // Pattern 1: "2kg, 20cm x 30cm x 15cm" or similar
  const wdMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilograms?|lbs?|pounds?)(?:[,\s]+(?:around|about|approximately)?\s*)?(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s*(?:cm|mm|inches?)?/i);
  if (wdMatch) {
    exampleShipment = `${wdMatch[1]}kg, ${wdMatch[2]} x ${wdMatch[3]} x ${wdMatch[4]}cm`;
  } else {
    // Pattern 2: Just dimensions
    const dimMatch = text.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s*(?:cm|mm|inches?)/i);
    if (dimMatch) {
      exampleShipment = `${dimMatch[1]} x ${dimMatch[2]} x ${dimMatch[3]}cm`;
    } else {
      // Pattern 3: Just weight with context
      const weightMatch = text.match(/(?:around|about|typically|usually|around)\s*(\d+(?:\.\d+)?)\s*(?:kg|kilograms?|lbs?|pounds?)/i);
      if (weightMatch) {
        exampleShipment = `${weightMatch[1]}kg`;
      }
    }
  }

  // Example shipment cost
  let exampleShipmentCost = '';
  const costMatch = text.match(/(?:around|about|approximately|average|typically)?\s*(?:cost|spend|pay)\s*(?:is|are|of)?\s*(£?\s?\d+(?:[\.,]\d{2})?|\d+\s*(?:pounds?|dollars?|euros?))/i);
  if (costMatch) {
    exampleShipmentCost = costMatch[1].trim();
  } else {
    // Simpler pattern
    const simpleCost = pick(/(£\s?\d+(?:\.\d{2})?)/);
    if (simpleCost) exampleShipmentCost = simpleCost;
  }

  // Domestic frequency
  let domesticFrequency = '';
  const ukFreqMatch = text.match(/(\d+)\s*(?:uk|domestic)?\s*(?:packages?|parcels?)\s*(?:per|a)?\s*(day|week)/i);
  if (ukFreqMatch) {
    domesticFrequency = `${ukFreqMatch[1]} per ${ukFreqMatch[2]}`;
  } else {
    const ukDailyMatch = text.match(/\b(?:uk|domestic).*?(daily|weekly)/i);
    if (ukDailyMatch) domesticFrequency = ukDailyMatch[1];
  }

  // UK courier
  const ukCourier = pick(/uk[^\n]{0,50}\b(ups|fedex|dhl|dpd|hermes|evri|royal\s*mail|parcelforce|yodel|apc|citylink|dx|interlink)\b/i) || 
                    pick(/\buk\s+courier[^\n]{0,50}\b(ups|fedex|dhl|dpd|hermes|evri|royal\s*mail|parcelforce|yodel|apc|citylink|dx|interlink)\b/i);

  // Standard rate up to kg
  let standardRateUpToKg = '';
  const rateMatch = text.match(/pay\s+£?(\d+(?:\.\d+)?)\s*up\s+to\s*(\d+\s*kg?)/i);
  if (rateMatch) {
    standardRateUpToKg = `£${rateMatch[1]} up to ${rateMatch[2]}`;
  }

  // Excluding fuel and VAT?
  let excludingFuelVat = '';
  if (/excluding\s+fuel|excl\.?\s+fuel|excluding\s+vat|plus\s+fuel|plus\s+vat|additional\s+fuel|additional\s+vat/i.test(transcriptOriginal)) {
    excludingFuelVat = 'Y';
  } else if (/including\s+fuel|including\s+vat|all\s+inclusive/i.test(transcriptOriginal)) {
    excludingFuelVat = 'N';
  }

  // Single vs multi-parcel
  let singleVsMulti = '';
  if (/single\s+parcels?|one\s+parcel|individual\s+packages?/i.test(transcriptOriginal)) {
    singleVsMulti = 'Single';
  } else if (/multiple\s+parcels?|multi-?parcel|bulk\s+shipments?|many\s+parcels?/i.test(transcriptOriginal)) {
    singleVsMulti = 'Multiple';
  }

  return {
    email,
    international,
    mainCouriers,
    frequency,
    mainCountries,
    exampleShipment,
    exampleShipmentCost,
    domesticFrequency,
    ukCourier,
    standardRateUpToKg,
    excludingFuelVat,
    singleVsMulti
  };
}

