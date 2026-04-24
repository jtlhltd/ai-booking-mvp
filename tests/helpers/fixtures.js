/**
 * Shared fixtures for unit/contract tests.
 * Keep these minimal and override per-test.
 */

export function tenantFixture(overrides = {}) {
  return {
    clientKey: 'c1',
    key: 'c1',
    tenantKey: 'c1',
    displayName: 'Clinic',
    locale: 'en-GB',
    booking: {
      timezone: 'Europe/London',
      defaultDurationMin: 30,
      country: 'GB',
    },
    smsTemplates: {},
    ...overrides,
  };
}

export function leadFixture(overrides = {}) {
  return {
    id: 'lead_1',
    name: 'Alex',
    phone: '+447700900123',
    status: 'new',
    ...overrides,
  };
}

