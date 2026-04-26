import { describe, test, expect, jest } from '@jest/globals';
import { getIntegrationStatuses } from '../../lib/integration-statuses.js';

describe('lib/integration-statuses', () => {
  test('without clientKey marks Vapi as error and Twilio/Calendar as warning', async () => {
    const query = jest.fn();
    const out = await getIntegrationStatuses('', { query });
    expect(query).not.toHaveBeenCalled();
    const vapi = out.find((i) => i.name === 'Vapi Voice');
    expect(vapi.status).toBe('error');
    expect(out.find((i) => i.name === 'Twilio SMS').status).toBe('warning');
  });

  test('when tenant missing returns early with Vapi error', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const out = await getIntegrationStatuses('missing_tenant', { query });
    expect(query).toHaveBeenCalled();
    expect(out.find((i) => i.name === 'Vapi Voice').status).toBe('error');
  });
});
