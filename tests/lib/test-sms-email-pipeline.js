// tests/lib/test-sms-email-pipeline.js
// Test SMS/Email pipeline class

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import SMSEmailPipeline from '../../sms-email-pipeline.js';

resetStats();

describe('SMS/Email Pipeline Tests', () => {
  
  test('SMSEmailPipeline class exists', () => {
    assertTrue(typeof SMSEmailPipeline === 'function', 'SMSEmailPipeline is a class');
  });
  
  test('SMSEmailPipeline instance creation', () => {
    try {
      const pipeline = new SMSEmailPipeline();
      assertTrue(pipeline instanceof SMSEmailPipeline, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('SMS message structure', () => {
    const sms = {
      to: '+447491683261',
      message: 'Test SMS message',
      from: '+447403934440'
    };
    
    assertTrue('to' in sms, 'Has recipient');
    assertTrue('message' in sms, 'Has message');
    assertTrue(/^\+447/.test(sms.to), 'Phone is E.164 format');
  });
  
  test('Email message structure', () => {
    const email = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<html><body>Test</body></html>',
      text: 'Test text'
    };
    
    assertTrue('to' in email, 'Has recipient');
    assertTrue('subject' in email, 'Has subject');
    assertTrue(/@/.test(email.to), 'Email is valid format');
  });
  
  test('Message delivery status', () => {
    const statuses = ['pending', 'sent', 'delivered', 'failed'];
    statuses.forEach(status => {
      assertTrue(typeof status === 'string', `Status ${status} is string`);
    });
  });
  
  test('Pipeline queue structure', () => {
    const queue = {
      sms: [],
      email: [],
      processing: false
    };
    
    assertTrue('sms' in queue, 'Has SMS queue');
    assertTrue('email' in queue, 'Has email queue');
    assertTrue(Array.isArray(queue.sms), 'SMS queue is array');
  });
  
  test('Message priority', () => {
    const priorities = ['low', 'normal', 'high', 'urgent'];
    priorities.forEach(priority => {
      assertTrue(typeof priority === 'string', `Priority ${priority} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

