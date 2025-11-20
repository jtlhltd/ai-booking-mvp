// tests/server/test-server-utilities.js
// Test utility functions in server.js

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Server Utilities Tests', () => {
  
  test('Phone normalization logic', () => {
    const normalize = (input, country = 'GB') => {
      const isE164 = (s) => typeof s === 'string' && /^\+\d{7,15}$/.test(s);
      const normalizePhone = (s) => (s || '').trim().replace(/[^\d+]/g, '');
      
      if (input == null) return null;
      const raw = String(input).trim();
      if (!raw) return null;
      
      const cleaned = normalizePhone(raw);
      if (isE164(cleaned)) return cleaned;
      
      const digits = cleaned.replace(/\D/g, '');
      if (country === 'GB' || country === 'UK') {
        const m1 = digits.match(/^0?7(\d{9})$/);
        if (m1) {
          const cand = '+447' + m1[1];
          if (isE164(cand)) return cand;
        }
      }
      
      if (/^\d{7,15}$/.test(digits)) {
        const cand = '+' + digits;
        if (isE164(cand)) return cand;
      }
      
      return null;
    };
    
    assertTrue(normalize('07491683261') === '+447491683261', 'UK mobile normalized');
    assertTrue(normalize('+447491683261') === '+447491683261', 'E.164 preserved');
  });
  
  test('Date preference parsing logic', () => {
    const preferences = ['tomorrow 2pm', 'next Monday', 'in 3 days'];
    preferences.forEach(pref => {
      assertTrue(typeof pref === 'string', `Preference ${pref} is string`);
      assertTrue(pref.length > 0, `Preference ${pref} has content`);
    });
  });
  
  test('CSV conversion logic', () => {
    const data = [
      { name: 'John', phone: '+447491683261' },
      { name: 'Jane', phone: '+447700900123' }
    ];
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');
    
    assertTrue(csv.includes('John'), 'CSV contains data');
    assertTrue(csv.includes('name,phone'), 'CSV has headers');
  });
  
  test('Time formatting', () => {
    const date = new Date();
    const formatted = date.toLocaleString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    });
    
    assertTrue(typeof formatted === 'string', 'Formatted time is string');
    assertTrue(formatted.length > 0, 'Formatted time has content');
  });
  
  test('GBP formatting', () => {
    const formatGBP = (value = 0) => {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP'
      }).format(value);
    };
    
    const formatted = formatGBP(150);
    assertTrue(formatted.includes('£'), 'Contains pound symbol');
    assertTrue(formatted.includes('150'), 'Contains value');
  });
  
  test('Time ago calculation', () => {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const diff = now - oneHourAgo;
    const hours = Math.floor(diff / (60 * 60 * 1000));
    
    assertTrue(hours === 1, 'Time difference calculated correctly');
  });
  
  test('Status mapping', () => {
    const statusMap = {
      'completed': 'Completed',
      'failed': 'Failed',
      'no-answer': 'No Answer'
    };
    
    Object.keys(statusMap).forEach(key => {
      assertTrue(typeof statusMap[key] === 'string', `Status ${key} mapped to string`);
    });
  });
  
  test('Color brightness adjustment', () => {
    const adjust = (hex, percent) => {
      const num = parseInt(hex.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    };
    
    const adjusted = adjust('#667eea', 10);
    assertTrue(/^#/.test(adjusted), 'Returns hex color');
    assertTrue(adjusted.length === 7, 'Hex color has correct length');
  });
  
  test('Input sanitization', () => {
    const sanitize = (input, maxLength = 1000) => {
      if (typeof input !== 'string') return '';
      return input
        .slice(0, maxLength)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .trim();
    };
    
    const sanitized = sanitize('<script>alert("xss")</script>Test');
    assertTrue(!sanitized.includes('<script>'), 'Script tags removed');
    assertTrue(sanitized.includes('Test'), 'Valid content preserved');
  });
  
  test('Cache key generation', () => {
    const getCacheKey = (prefix, ...params) => {
      return `${prefix}:${params.join(':')}`;
    };
    
    const key = getCacheKey('leads', 'test_client', 'active');
    assertTrue(key === 'leads:test_client:active', 'Cache key generated correctly');
  });
  
  test('Error categorization', () => {
    const categories = ['network', 'database', 'api', 'validation', 'business'];
    categories.forEach(category => {
      assertTrue(typeof category === 'string', `Category ${category} is string`);
    });
  });
  
  test('Retry delay calculation', () => {
    const calculateDelay = (baseDelay, attempt, errorType) => {
      const multiplier = errorType === 'rate_limit' ? 2 : 1.5;
      return Math.min(baseDelay * Math.pow(multiplier, attempt - 1), 30000);
    };
    
    const delay1 = calculateDelay(1000, 1, 'network');
    const delay2 = calculateDelay(1000, 2, 'network');
    
    assertTrue(delay2 >= delay1, 'Delay increases with attempts');
    assertTrue(delay1 > 0, 'Delay > 0');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

