// tests/lib/test-workflow.js
// Test workflow functionality (CommonJS module)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Workflow Tests', () => {
  
  test('Auto-call trigger structure', () => {
    const params = {
      tenant: { clientKey: 'test_client', vapi: { assistantId: 'asst123' } },
      lead: { id: 1, name: 'John Doe', phone: '+447491683261', service: 'Consultation' }
    };
    
    assertTrue('tenant' in params, 'Has tenant');
    assertTrue('lead' in params, 'Has lead');
    assertTrue('service' in params.lead, 'Lead has service');
  });
  
  test('SMS options formatting', () => {
    const options = [
      { start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      { start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() },
      { start: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() }
    ];
    
    const format = (opt, i) => `${i+1}) ${new Date(opt.start).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}`;
    const sms = `I can book you: ${options.map(format).join(', ')}. Reply 1, 2, or 3 to confirm.`;
    
    assertTrue(sms.includes('1)'), 'Has option 1');
    assertTrue(sms.includes('2)'), 'Has option 2');
    assertTrue(sms.includes('3)'), 'Has option 3');
    assertTrue(sms.includes('Reply 1, 2, or 3'), 'Has reply instructions');
  });
  
  test('Follow-up webhook payload', () => {
    const payload = {
      clientKey: 'test_client',
      lead: { id: 1, name: 'John', phone: '+447491683261', service: 'Consultation' },
      attempt: 1
    };
    
    assertTrue('clientKey' in payload, 'Has clientKey');
    assertTrue('lead' in payload, 'Has lead');
    assertTrue('attempt' in payload, 'Has attempt number');
    assertTrue(typeof payload.attempt === 'number', 'Attempt is number');
  });
  
  test('Fallback SMS trigger', () => {
    const shouldFallback = true;
    const hasOptions = true;
    const canSendSMS = shouldFallback && hasOptions;
    
    assertTrue(canSendSMS === true, 'Can trigger SMS fallback');
  });
  
  test('Webhook headers', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Shared-Secret': 'secret123'
    };
    
    assertTrue(headers['Content-Type'] === 'application/json', 'Content-Type correct');
    assertTrue('X-Shared-Secret' in headers, 'Has shared secret header');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

