import { describe, test, expect } from '@jest/globals';

describe('db.js re-exports smearCallQueueScheduledFor', () => {
  test('smearCallQueueScheduledFor matches db/call-queue-smear implementation', async () => {
    const { smearCallQueueScheduledFor: fromDb } = await import('../../db.js');
    const { smearCallQueueScheduledFor: fromModule } = await import('../../db/call-queue-smear.js');
    const base = new Date('2024-01-15T10:00:00.000Z');
    expect(fromDb(base, 'k', '+1', 1).getTime()).toBe(fromModule(base, 'k', '+1', 1).getTime());
  });
});
