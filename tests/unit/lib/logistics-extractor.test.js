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
  });
});

