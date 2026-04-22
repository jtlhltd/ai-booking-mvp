import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

// Make auth/tenant middleware no-op for contract tests.
jest.unstable_mockModule('../../middleware/security.js', () => ({
  authenticateApiKey: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next()
}));

jest.unstable_mockModule('../../lib/appointment-lookup.js', () => ({
  findAppointments: jest.fn(async () => [{ id: 1 }]),
  getUpcomingAppointments: jest.fn(async () => [{ id: 2 }]),
  getAppointmentById: jest.fn(async () => ({ id: 3 }))
}));

jest.unstable_mockModule('../../lib/appointment-modifier.js', () => ({
  rescheduleAppointment: jest.fn(async () => ({ updated: true })),
  cancelAppointment: jest.fn(async () => ({ cancelled: true }))
}));

describe('Appointments API router contracts', () => {
  test('lookup rejects missing query', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/appointments/test/lookup').expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String)
      })
    );
  });

  test('lookup happy path returns appointments', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .get('/api/appointments/test/lookup')
      .query({ phone: '+447700900000' })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        count: expect.any(Number),
        appointments: expect.any(Array)
      })
    );
  });

  test('reschedule rejects missing newTime', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/api/appointments/test/123/reschedule')
      .send({ reason: 'test' })
      .expect(400);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String)
      })
    );
  });
});

