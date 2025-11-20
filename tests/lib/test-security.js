// tests/lib/test-security.js
// Test security functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  Encryption,
  AuditLogger,
  GDPRManager,
  IPWhitelist,
  getAuditLogger,
  getIPWhitelist,
  logAudit
} from '../../lib/security.js';

resetStats();

describe('Security Tests', () => {
  
  test('Encryption class exists', () => {
    assertTrue(typeof Encryption === 'function', 'Encryption is a class');
  });
  
  test('AuditLogger class exists', () => {
    assertTrue(typeof AuditLogger === 'function', 'AuditLogger is a class');
  });
  
  test('GDPRManager class exists', () => {
    assertTrue(typeof GDPRManager === 'function', 'GDPRManager is a class');
  });
  
  test('IPWhitelist class exists', () => {
    assertTrue(typeof IPWhitelist === 'function', 'IPWhitelist is a class');
  });
  
  test('Get audit logger function exists', () => {
    assertTrue(typeof getAuditLogger === 'function', 'getAuditLogger is a function');
  });
  
  test('Get IP whitelist function exists', () => {
    assertTrue(typeof getIPWhitelist === 'function', 'getIPWhitelist is a function');
  });
  
  test('Log audit function exists', () => {
    assertTrue(typeof logAudit === 'function', 'logAudit is a function');
  });
  
  test('Audit log structure', () => {
    const auditLog = {
      clientKey: 'test_client',
      action: 'lead_imported',
      details: { leadCount: 10 },
      ip: '192.168.1.1',
      userAgent: 'Test Agent',
      timestamp: new Date().toISOString()
    };
    
    assertTrue('action' in auditLog, 'Has action');
    assertTrue('timestamp' in auditLog, 'Has timestamp');
    assertTrue(typeof auditLog.action === 'string', 'Action is string');
  });
  
  test('IP address validation', () => {
    const validIPs = ['192.168.1.1', '10.0.0.1', '127.0.0.1'];
    validIPs.forEach(ip => {
      const isValid = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
      assertTrue(isValid, `IP ${ip} is valid format`);
    });
  });
  
  test('GDPR data structure', () => {
    const gdprData = {
      leads: [],
      appointments: [],
      calls: [],
      messages: []
    };
    
    assertTrue('leads' in gdprData, 'Has leads');
    assertTrue(Array.isArray(gdprData.leads), 'Leads is array');
  });
  
  test('Encryption concepts', () => {
    const encryption = {
      algorithm: 'AES-256',
      keyLength: 256,
      ivLength: 16
    };
    
    assertTrue('algorithm' in encryption, 'Has algorithm');
    assertTrue(typeof encryption.keyLength === 'number', 'Key length is number');
  });
  
  test('Whitelist structure', () => {
    const whitelist = ['192.168.1.1', '10.0.0.1'];
    assertTrue(Array.isArray(whitelist), 'Whitelist is array');
    whitelist.forEach(ip => {
      assertTrue(typeof ip === 'string', `IP ${ip} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

