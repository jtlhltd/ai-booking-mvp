import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

const findAppointments = jest.fn(async () => [{ id: 1 }]);
const getUpcomingAppointments = jest.fn(async () => [{ id: 2 }]);
const getAppointmentById = jest.fn(async () => ({ id: 3, appointmentId: '3' }));

const rescheduleAppointment = jest.fn(async () => ({ updated: true }));
const cancelAppointment = jest.fn(async () => ({ cancelled: true }));

// Make auth/tenant middleware no-op for contract tests.
jest.unstable_mockModule('../../middleware/security.js', () => ({
  authenticateApiKey: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next()
}));

jest.unstable_mockModule('../../lib/appointment-lookup.js', () => ({
  findAppointments,
  getUpcomingAppointments,
  getAppointmentById
}));

jest.unstable_mockModule('../../lib/appointment-modifier.js', () => ({
  rescheduleAppointment,
  cancelAppointment
}));

describe('Appointments API router contracts', () => {
  let consoleErrorSpy;
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    findAppointments.mockClear();
    getUpcomingAppointments.mockClear();
    getAppointmentById.mockClear();
    rescheduleAppointment.mockClear();
    cancelAppointment.mockClear();
    findAppointments.mockResolvedValue([{ id: 1 }]);
    getUpcomingAppointments.mockResolvedValue([{ id: 2 }]);
    getAppointmentById.mockResolvedValue({ id: 3, appointmentId: '3' });
    rescheduleAppointment.mockResolvedValue({ updated: true });
    cancelAppointment.mockResolvedValue({ cancelled: true });
  });

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

  test('upcoming rejects missing phone', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/appointments/test/upcoming').expect(400);
    expect(res.body.success).toBe(false);
  });

  test('upcoming happy path', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .get('/api/appointments/test/upcoming')
      .query({ phone: '+447700900000' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(getUpcomingAppointments).toHaveBeenCalled();
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

  test('reschedule success', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/appointments/test/123/reschedule')
      .send({ newTime: '2026-05-01T10:00:00.000Z' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(rescheduleAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKey: 'test',
        appointmentId: 123,
        newStartTime: '2026-05-01T10:00:00.000Z'
      })
    );
  });

  test('reschedule returns 500 when modifier throws', async () => {
    rescheduleAppointment.mockRejectedValueOnce(new Error('slot taken'));
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/appointments/test/1/reschedule')
      .send({ newTime: '2026-05-01T10:00:00.000Z' })
      .expect(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/slot taken/);
  });

  test('cancel success with offerAlternatives false', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/appointments/test/5/cancel')
      .send({ reason: 'x', offerAlternatives: false })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(cancelAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKey: 'test',
        appointmentId: 5,
        reason: 'x',
        offerAlternatives: false
      })
    );
  });

  test('cancel returns 500 when modifier throws', async () => {
    cancelAppointment.mockRejectedValueOnce(new Error('db down'));
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).post('/api/appointments/test/1/cancel').send({}).expect(500);
    expect(res.body.success).toBe(false);
  });

  test('get appointment 404', async () => {
    getAppointmentById.mockResolvedValueOnce(null);
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/appointments/test/99').expect(404);
    expect(res.body.success).toBe(false);
  });

  test('get appointment success', async () => {
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/appointments/test/7').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointment).toBeDefined();
  });

  test('lookup returns 500 when lookup throws', async () => {
    findAppointments.mockRejectedValueOnce(new Error('db'));
    const { default: router } = await import('../../routes/appointments.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/appointments/test/lookup').query({ email: 'a@b.com' }).expect(500);
    expect(res.body.success).toBe(false);
  });
});
