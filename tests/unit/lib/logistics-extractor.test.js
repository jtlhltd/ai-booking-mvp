import { describe, expect, test } from '@jest/globals';

describe('lib/logistics-extractor', () => {
  test('extracts email, couriers, frequency, countries, weight/dims, costs, and flags', async () => {
    const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
    const transcript = `
      Please email me at alice@example.com.
      We ship internationally to Germany and the USA. We use DHL and Royal Mail.
      About 50 packages per week. UK shipping about 20 packages per day.
      Example shipment 2kg 10 x 20 x 30 cm costs £7.
      Standard rates are up to 2kg excluding fuel and VAT, multiple parcels.
    `;
    const out = extractLogisticsFields(transcript);
    expect(out.email).toBe('alice@example.com');
    expect(out.international).toBe('Y');
    expect(out.mainCouriers).toEqual(expect.arrayContaining(['DHL', 'Royal Mail']));
    expect(out.frequency).toMatch(/per week|weekly|daily|monthly/);
    expect(out.mainCountries).toEqual(expect.arrayContaining(['Germany', 'USA']));
    expect(out.exampleShipment).toContain('2kg');
    expect(out.exampleShipmentCost).toBe('£7');
    expect(out.domesticFrequency).toContain('20 per day');
    expect(out.standardRateUpToKg).toBe('2kg');
    expect(out.excludingFuelVat).toBe('Y');
    expect(out.singleVsMulti).toBe('Multiple');
  });

  test('returns empty defaults for non-string input', async () => {
    const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
    expect(extractLogisticsFields(null)).toEqual(
      expect.objectContaining({
        email: '',
        international: '',
        mainCouriers: [],
        mainCountries: []
      })
    );
    expect(extractLogisticsFields(undefined).email).toBe('');
    expect(extractLogisticsFields('').email).toBe('');
  });

  describe('email extraction across formats', () => {
    test.each([
      ['Contact us at test@example.com', 'test@example.com'],
      ['Email: john.smith@business.co.uk', 'john.smith@business.co.uk'],
      ['Reach me at contact+test@domain.com', 'contact+test@domain.com'],
      ['No email here', '']
    ])('extracts email from %s', async (transcript, expected) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      expect(extractLogisticsFields(transcript).email).toBe(expected);
    });
  });

  describe('courier detection', () => {
    test.each([
      ['We use DHL and FedEx', ['DHL', 'FedEx']],
      ['Royal Mail for UK shipping', ['Royal Mail']],
      ['We ship with UPS, DPD, and Yodel', ['UPS', 'DPD', 'Yodel']],
      ['Parcelforce is our main courier', ['Parcelforce']]
    ])('detects couriers in %s', async (transcript, expectedCouriers) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      const { mainCouriers } = extractLogisticsFields(transcript);
      for (const courier of expectedCouriers) {
        expect(mainCouriers).toContain(courier);
      }
    });
  });

  describe('country detection', () => {
    test.each([
      ['We ship to USA and Germany', ['USA', 'Germany']],
      ['Main countries: France, Spain, Italy', ['France', 'Spain', 'Italy']],
      ['We export to Canada and Australia', ['Canada', 'Australia']]
    ])('detects countries in %s', async (transcript, expectedCountries) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      const { mainCountries } = extractLogisticsFields(transcript);
      for (const country of expectedCountries) {
        expect(mainCountries).toContain(country);
      }
    });
  });

  describe('frequency parsing', () => {
    test.each([
      ['We ship 50 packages per week', /50.*per week/],
      ['About 20 packages per day', /20.*per day/],
      ['We ship daily', /daily/],
      ['Weekly shipments', /weekly/],
      ['Monthly deliveries', /monthly/]
    ])('parses frequency from %s', async (transcript, expectedRegex) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      expect(extractLogisticsFields(transcript).frequency).toMatch(expectedRegex);
    });
  });

  describe('international Y/N detection', () => {
    test.each([
      ['We export outside the UK', 'Y'],
      ['We only ship within the UK', 'N'],
      ['UK only shipping', 'N'],
      ['We send abroad', 'Y']
    ])('flags %s as %s', async (transcript, expected) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      expect(extractLogisticsFields(transcript).international).toBe(expected);
    });
  });

  describe('single vs multi-parcel detection', () => {
    test.each([
      ['We do single parcel shipments', 'Single'],
      ['Multiple parcels at once', 'Multiple'],
      ['Bulk shipments', 'Multiple'],
      ['One parcel at a time', 'Single']
    ])('classifies %s as %s', async (transcript, expected) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      expect(extractLogisticsFields(transcript).singleVsMulti).toBe(expected);
    });
  });

  describe('fuel/VAT exclusion detection', () => {
    test.each([
      ['Rates excluding fuel and VAT', 'Y'],
      ['Plus fuel and VAT', 'Y'],
      ['All inclusive rates', 'N'],
      ['Including fuel and VAT', 'N']
    ])('flags %s as %s', async (transcript, expected) => {
      const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
      expect(extractLogisticsFields(transcript).excludingFuelVat).toBe(expected);
    });
  });

  test('UK courier captured separately from international couriers', async () => {
    const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
    expect(extractLogisticsFields('We use Royal Mail for UK shipping').ukCourier).toBe('Royal Mail');
  });

  test('domestic frequency includes count', async () => {
    const { extractLogisticsFields } = await import('../../../lib/logistics-extractor.js');
    expect(extractLogisticsFields('We do 20 UK packages per day').domesticFrequency).toContain('20');
  });
});
