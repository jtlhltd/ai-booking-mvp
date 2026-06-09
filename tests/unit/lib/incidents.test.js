import { describe, test, beforeEach, expect } from '@jest/globals';
import {
  buildIncidentFingerprint,
  normalizeIncidentSeverity,
  recordIncidentEvent,
  _clearMemoryIncidentsForTests,
} from '../../../lib/incidents.js';

describe('incidents', () => {
  beforeEach(() => {
    _clearMemoryIncidentsForTests();
    delete process.env.DB_TYPE;
  });

  test('normalizeIncidentSeverity maps fatal to critical', () => {
    expect(normalizeIncidentSeverity('fatal')).toBe('critical');
    expect(normalizeIncidentSeverity('WARNING')).toBe('warning');
  });

  test('buildIncidentFingerprint prefers dedupeKey', () => {
    expect(buildIncidentFingerprint({ dedupeKey: 'queue:stuck', source: 'x', title: 'y' })).toBe(
      'queue:stuck',
    );
  });

  test('recordIncidentEvent notifies on first event then throttles', async () => {
    const first = await recordIncidentEvent({
      dedupeKey: 'test:throttle',
      title: 'Queue stuck',
      severity: 'warning',
      source: 'test',
      throttleMinutes: 60,
    });
    expect(first.isNew).toBe(true);
    expect(first.shouldNotify).toBe(true);

    const second = await recordIncidentEvent({
      dedupeKey: 'test:throttle',
      title: 'Queue stuck',
      severity: 'warning',
      source: 'test',
      throttleMinutes: 60,
    });
    expect(second.isNew).toBe(false);
    expect(second.shouldNotify).toBe(false);
    expect(second.eventCount).toBe(2);
  });

  test('recordIncidentEvent notifies again on severity escalation', async () => {
    await recordIncidentEvent({
      dedupeKey: 'test:escalate',
      title: 'DB slow',
      severity: 'warning',
      source: 'test',
      throttleMinutes: 60,
    });
    const escalated = await recordIncidentEvent({
      dedupeKey: 'test:escalate',
      title: 'DB slow',
      severity: 'critical',
      source: 'test',
      throttleMinutes: 60,
    });
    expect(escalated.severityEscalated).toBe(true);
    expect(escalated.shouldNotify).toBe(true);
  });
});
