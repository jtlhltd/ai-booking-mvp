import { init, query, addToCallQueue, closeDatabaseConnectionsForTests } from '../../db.js';

const describeIf = process.env.RUN_SQLITE_INTEGRATION_TESTS === '1' ? describe : describe.skip;

describeIf('Call queue blocks opted-out numbers (V1)', () => {
  beforeAll(async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATABASE_URL = '';
    await init();
  });

  afterAll(async () => {
    await closeDatabaseConnectionsForTests();
  });

  test('addToCallQueue throws opted_out for vapi_call to opted-out phone', async () => {
    await query(`DELETE FROM opt_out_list`);
    await query(`INSERT INTO opt_out_list (client_key, phone, reason, active) VALUES ($1, $2, $3, 1)`, ['d2d-xpress-tom', '+447700900111', 'user_request']);

    await expect(
      addToCallQueue({
        clientKey: 'd2d-xpress-tom',
        leadPhone: '+44 7700 900111',
        priority: 5,
        scheduledFor: new Date(),
        callType: 'vapi_call',
        callData: { triggerType: 'test' }
      })
    ).rejects.toMatchObject({ code: 'opted_out' });
  });
});

