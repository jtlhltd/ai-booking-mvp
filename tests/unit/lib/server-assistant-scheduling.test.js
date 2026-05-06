import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('lib/server-assistant-scheduling', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('selectOptimalAssistant picks high-score branch', async () => {
    const prevAssistant = process.env.VAPI_ASSISTANT_ID;
    const prevPhone = process.env.VAPI_PHONE_NUMBER_ID;
    process.env.VAPI_ASSISTANT_ID = 'def-asst';
    process.env.VAPI_PHONE_NUMBER_ID = 'def-phone';
    const { selectOptimalAssistant } = await import('../../../lib/server-assistant-scheduling.js');
    const out = await selectOptimalAssistant({
      client: {
        vapiHighValueAssistantId: 'hv-asst',
        vapiHighValuePhoneNumberId: 'hv-phone'
      },
      existingLead: { score: 90 },
      isYes: false,
      isStart: false
    });
    expect(out.assistantId).toBe('hv-asst');
    expect(out.phoneNumberId).toBe('hv-phone');
    process.env.VAPI_ASSISTANT_ID = prevAssistant;
    process.env.VAPI_PHONE_NUMBER_ID = prevPhone;
  });

  test('safeAsync catches handler errors and returns 500 JSON', async () => {
    const { safeAsync } = await import('../../../lib/server-assistant-scheduling.js');
    const wrapped = safeAsync(async () => {
      throw new Error('boom');
    });
    const req = { url: '/t', method: 'POST', ip: '127.0.0.1', get: () => '' };
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await wrapped(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'Internal server error' })
    );
  });

  test('createBusinessHoursHelpers delegates to business-hours module', async () => {
    jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
      isBusinessHoursForTenant: jest.fn(() => true),
      getNextBusinessOpenForTenant: jest.fn(() => new Date('2030-01-02T10:00:00.000Z'))
    }));
    const { createBusinessHoursHelpers } = await import('../../../lib/server-assistant-scheduling.js');
    const { isBusinessHours, getNextBusinessHour } = createBusinessHoursHelpers('Europe/London');
    expect(isBusinessHours({ booking: { timezone: 'Europe/London' } })).toBe(true);
    expect(getNextBusinessHour({ booking: { timezone: 'Europe/London' } }).toISOString()).toContain('2030');
  });
});
