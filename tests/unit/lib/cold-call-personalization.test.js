import { describe, test, expect } from '@jest/globals';
import {
  getOptimalCallTime,
  generateFollowUpPlan,
  generateVoicemailFollowUpEmail,
  generatePersonalizedScript,
  getIndustryContext,
  getRegionalContext
} from '../../../lib/cold-call-personalization.js';

describe('lib/cold-call-personalization', () => {
  test('getOptimalCallTime picks vertical-specific windows', () => {
    expect(
      getOptimalCallTime({ name: 'Bright Dental Care', address: 'London' })
    ).toMatch(/09:00/);
    expect(getOptimalCallTime({ name: 'Smith Legal LLP' })).toMatch(/09:00/);
    expect(getOptimalCallTime({ name: 'Glow Beauty Salon' })).toMatch(/14:00/);
    expect(getOptimalCallTime({ name: 'Generic Cafe', address: '' })).toMatch(/09:00/);
  });

  test('generateFollowUpPlan maps outcomes', () => {
    expect(generateFollowUpPlan({ outcome: 'voicemail' })).toMatch(/Email/);
    expect(generateFollowUpPlan({ outcome: 'unknown' })).toMatch(/Standard/);
  });

  test('generateVoicemailFollowUpEmail uses decision maker name when present', () => {
    const email = generateVoicemailFollowUpEmail({
      decisionMaker: { name: 'Sam' },
      businessName: 'Acme'
    });
    expect(email.subject).toContain('Sam');
    expect(email.body).toContain('Acme');
  });

  test('generatePersonalizedScript returns structured opener', () => {
    const script = generatePersonalizedScript(
      { name: 'Test Clinic', address: 'Leeds' },
      'healthcare',
      'UK'
    );
    expect(script.firstMessage.length).toBeGreaterThan(50);
    expect(script.firstMessage).toMatch(/Test Clinic/i);
  });

  test('getIndustryContext returns hints for known industries', () => {
    expect(getIndustryContext('healthcare').metric.length).toBeGreaterThan(3);
    expect(getIndustryContext('unknown_vertical_xyz').insights.length).toBeGreaterThan(10);
  });

  test('getRegionalContext handles known cities and default', () => {
    expect(getRegionalContext('Manchester, UK').city).toBe('Manchester');
    expect(getRegionalContext('Austin, TX').city).toBe('your area');
    expect(getRegionalContext('').city).toBe('your area');
  });
});
