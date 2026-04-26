import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/vapi-function-handlers', () => {
  test('returns error when clientKey missing in metadata', async () => {
    const { handleVapiFunctionCall } = await import('../../../lib/vapi-function-handlers.js');
    const out = await handleVapiFunctionCall({ functionName: 'get_business_info', arguments: {}, metadata: {} });
    expect(out).toEqual(expect.objectContaining({ success: false, error: expect.any(String) }));
  });

  test('returns error for unknown function', async () => {
    const { handleVapiFunctionCall } = await import('../../../lib/vapi-function-handlers.js');
    const out = await handleVapiFunctionCall({ functionName: 'nope', arguments: {}, metadata: { clientKey: 'c1' } });
    expect(out).toEqual(expect.objectContaining({ success: false }));
  });

  test('get_business_info delegates to business-info helpers', async () => {
    jest.unstable_mockModule('../../../lib/business-info.js', () => ({
      getBusinessInfo: jest.fn(async () => ({ name: 'Acme' })),
      getBusinessHoursString: jest.fn(async () => 'Mon-Fri'),
      getServicesList: jest.fn(async () => ['cut']),
      answerQuestion: jest.fn(async () => 'A'),
    }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));
    jest.unstable_mockModule('../../../lib/appointment-lookup.js', () => ({ findAppointments: jest.fn(), getUpcomingAppointments: jest.fn(), getAppointmentById: jest.fn() }));
    jest.unstable_mockModule('../../../lib/appointment-modifier.js', () => ({ rescheduleAppointment: jest.fn(), cancelAppointment: jest.fn() }));
    jest.unstable_mockModule('../../../lib/customer-profiles.js', () => ({ getCustomerProfile: jest.fn(), upsertCustomerProfile: jest.fn(), getCustomerGreeting: jest.fn() }));

    const { handleVapiFunctionCall } = await import('../../../lib/vapi-function-handlers.js');
    const out = await handleVapiFunctionCall({ functionName: 'get_business_info', arguments: {}, metadata: { clientKey: 'c1' } });
    expect(out).toEqual(expect.objectContaining({ success: true }));
  });
});

