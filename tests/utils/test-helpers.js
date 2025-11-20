// tests/utils/test-helpers.js
// Comprehensive test utilities for automated testing

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Test statistics
let testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  startTime: null
};

// Reset test statistics
export function resetStats() {
  testStats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    startTime: Date.now()
  };
}

// Get test statistics
export function getStats() {
  const duration = testStats.startTime ? Date.now() - testStats.startTime : 0;
  return {
    ...testStats,
    duration,
    successRate: testStats.total > 0 ? ((testStats.passed / testStats.total) * 100).toFixed(1) : 0
  };
}

// Colored console output
export function colorLog(message, color = 'reset') {
  const colorCode = colors[color] || colors.reset;
  console.log(`${colorCode}${message}${colors.reset}`);
}

// Assertion: Equal
export function assertEqual(actual, expected, message = '') {
  testStats.total++;
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  
  if (passed) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Assertion passed'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Assertion failed'}`, 'red');
    colorLog(`    Expected: ${JSON.stringify(expected)}`, 'yellow');
    colorLog(`    Actual: ${JSON.stringify(actual)}`, 'yellow');
    return false;
  }
}

// Assertion: True
export function assertTrue(condition, message = '') {
  testStats.total++;
  if (condition) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Assertion passed'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Assertion failed'}`, 'red');
    colorLog(`    Expected: true, Got: ${condition}`, 'yellow');
    return false;
  }
}

// Assertion: False
export function assertFalse(condition, message = '') {
  return assertTrue(!condition, message);
}

// Assertion: Contains
export function assertContains(array, item, message = '') {
  testStats.total++;
  const contains = Array.isArray(array) && array.includes(item);
  
  if (contains) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Array contains item'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Array does not contain item'}`, 'red');
    colorLog(`    Array: ${JSON.stringify(array)}`, 'yellow');
    colorLog(`    Item: ${JSON.stringify(item)}`, 'yellow');
    return false;
  }
}

// Assertion: Type
export function assertType(value, type, message = '') {
  testStats.total++;
  const actualType = typeof value;
  const passed = actualType === type;
  
  if (passed) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Type assertion passed'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Type assertion failed'}`, 'red');
    colorLog(`    Expected type: ${type}`, 'yellow');
    colorLog(`    Actual type: ${actualType}`, 'yellow');
    return false;
  }
}

// Assertion: Throws
export async function assertThrows(fn, errorType = null, message = '') {
  testStats.total++;
  try {
    await fn();
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Expected function to throw'}`, 'red');
    return false;
  } catch (error) {
    if (errorType && !(error instanceof errorType)) {
      testStats.failed++;
      colorLog(`  ✗ ${message || 'Wrong error type'}`, 'red');
      colorLog(`    Expected: ${errorType.name}`, 'yellow');
      colorLog(`    Got: ${error.constructor.name}`, 'yellow');
      return false;
    }
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Function threw as expected'}`, 'green');
    return true;
  }
}

// Assertion: Not null/undefined
export function assertNotNull(value, message = '') {
  testStats.total++;
  const passed = value !== null && value !== undefined;
  
  if (passed) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Value is not null/undefined'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Value is null/undefined'}`, 'red');
    return false;
  }
}

// Assertion: Null/undefined
export function assertNull(value, message = '') {
  testStats.total++;
  const passed = value === null || value === undefined;
  
  if (passed) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Value is null/undefined'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Value is not null/undefined'}`, 'red');
    colorLog(`    Value: ${JSON.stringify(value)}`, 'yellow');
    return false;
  }
}

// Assertion: Greater than
export function assertGreaterThan(actual, expected, message = '') {
  testStats.total++;
  const passed = actual > expected;
  
  if (passed) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Value is greater than expected'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Value is not greater than expected'}`, 'red');
    colorLog(`    Expected: > ${expected}`, 'yellow');
    colorLog(`    Actual: ${actual}`, 'yellow');
    return false;
  }
}

// Assertion: Less than
export function assertLessThan(actual, expected, message = '') {
  testStats.total++;
  const passed = actual < expected;
  
  if (passed) {
    testStats.passed++;
    colorLog(`  ✓ ${message || 'Value is less than expected'}`, 'green');
    return true;
  } else {
    testStats.failed++;
    colorLog(`  ✗ ${message || 'Value is not less than expected'}`, 'red');
    colorLog(`    Expected: < ${expected}`, 'yellow');
    colorLog(`    Actual: ${actual}`, 'yellow');
    return false;
  }
}

// Test timer
export function testTimer(name) {
  const start = Date.now();
  return {
    end: () => {
      const duration = Date.now() - start;
      return { name, duration, formatted: `${duration}ms` };
    },
    getDuration: () => Date.now() - start
  };
}

// Skip test if condition is true
export function skipIf(condition, reason = '') {
  if (condition) {
    testStats.skipped++;
    colorLog(`  ⊘ Skipped: ${reason}`, 'yellow');
    return true;
  }
  return false;
}

// Test suite wrapper
export function describe(name, fn) {
  colorLog(`\n${name}`, 'cyan');
  colorLog('─'.repeat(name.length), 'gray');
  try {
    fn();
  } catch (error) {
    colorLog(`  ✗ Suite error: ${error.message}`, 'red');
    console.error(error);
  }
}

// Test case wrapper
export function test(name, fn) {
  try {
    fn();
  } catch (error) {
    testStats.failed++;
    colorLog(`  ✗ ${name}: ${error.message}`, 'red');
    console.error(error);
  }
}

// Print test summary
export function printSummary() {
  const stats = getStats();
  colorLog('\n' + '='.repeat(60), 'cyan');
  colorLog('Test Summary', 'bright');
  colorLog('='.repeat(60), 'cyan');
  colorLog(`Total: ${stats.total}`, 'blue');
  colorLog(`Passed: ${stats.passed}`, 'green');
  colorLog(`Failed: ${stats.failed}`, stats.failed > 0 ? 'red' : 'green');
  colorLog(`Skipped: ${stats.skipped}`, stats.skipped > 0 ? 'yellow' : 'blue');
  colorLog(`Success Rate: ${stats.successRate}%`, stats.successRate >= 90 ? 'green' : stats.successRate >= 70 ? 'yellow' : 'red');
  colorLog(`Duration: ${stats.duration}ms`, 'blue');
  colorLog('='.repeat(60), 'cyan');
  
  return stats.failed === 0 ? 0 : 1;
}

// Mock webhook payload generator
export function mockWebhookPayload(scenario = 'default') {
  const basePayload = {
    call: {
      id: `test_call_${Date.now()}`,
      status: 'completed',
      outcome: 'completed',
      duration: 180,
      cost: 0.15,
      transcript: '',
      recordingUrl: 'https://api.vapi.ai/recordings/test123.mp3',
      metrics: {
        talk_time_ratio: 0.65,
        interruptions: 2,
        response_time_avg: 1.2,
        completion_rate: 1.0
      }
    },
    status: 'completed',
    metadata: {
      tenantKey: 'test_client',
      leadPhone: '+447491683261',
      businessName: 'Test Business Ltd'
    }
  };
  
  const scenarios = {
    default: basePayload,
    withTranscript: {
      ...basePayload,
      call: {
        ...basePayload.call,
        transcript: 'Hi, this is a test call transcript with logistics data. We ship with DHL and FedEx.'
      }
    },
    withStructuredOutput: {
      ...basePayload,
      call: {
        ...basePayload.call,
        structuredOutput: {
          businessName: 'Test Business',
          email: 'test@example.com',
          internationalYN: 'Y',
          courier1: 'DHL',
          courier2: 'FedEx'
        }
      }
    },
    withToolCalls: {
      ...basePayload,
      toolCalls: [{
        function: {
          name: 'access_google_sheet',
          arguments: JSON.stringify({
            action: 'append',
            data: { businessName: 'Test Business', phone: '+447491683261' }
          })
        }
      }]
    },
    noAnswer: {
      ...basePayload,
      call: {
        ...basePayload.call,
        status: 'ended',
        outcome: 'no-answer',
        duration: 5
      }
    },
    voicemail: {
      ...basePayload,
      call: {
        ...basePayload.call,
        status: 'ended',
        outcome: 'voicemail',
        duration: 30
      }
    }
  };
  
  return scenarios[scenario] || basePayload;
}

// Mock structured output generator
export function mockStructuredOutput(scenario = 'full') {
  const scenarios = {
    full: {
      businessName: 'ABC Logistics Ltd',
      decisionMaker: 'Jane Doe',
      email: 'jane@abclogistics.com',
      internationalYN: 'Y',
      courier1: 'DHL',
      courier2: 'FedEx',
      courier3: 'UPS',
      frequency: '50 per week',
      country1: 'USA',
      country2: 'Germany',
      country3: 'France',
      exampleShipment: '5kg, 30x20x15cm',
      exampleShipmentCost: '£7',
      domesticFrequency: '20 per day',
      ukCourier: 'Royal Mail',
      standardRateUpToKg: '2kg',
      exclFuelVAT: 'Y',
      singleVsMultiParcel: 'Single',
      receptionistName: 'Sarah',
      callbackNeeded: 'N'
    },
    partial: {
      businessName: 'Test Business',
      email: 'test@example.com',
      internationalYN: 'Y'
    },
    minimal: {
      businessName: 'Minimal Business'
    }
  };
  
  return scenarios[scenario] || scenarios.full;
}

// Mock transcript generator
export function mockTranscript(scenario = 'full') {
  const scenarios = {
    full: `Hi, this is Sarah calling from ABC Logistics. I'm speaking with John Smith at Test Business Ltd. 
    
We ship internationally using DHL and FedEx, about 50 packages per week to USA, Germany, and France. 
Our typical shipment is 5kg, dimensions are 30x20x15cm, costs about £7 per package. 
We use Royal Mail for UK domestic shipping, about 20 packages per day. 
Our standard rates are up to 2kg, excluding fuel and VAT. 
We primarily do single parcel shipments. 
You can reach me at john@testbusiness.com.`,
    
    partial: `We use DHL for shipping, about 10 packages per week. Email me at contact@business.co.uk`,
    
    minimal: `We ship packages. Contact us at info@test.com`,
    
    withReceptionist: `Hi, this is Sarah speaking. I'm the receptionist here. The decision maker is John Smith, but he's not available right now. Can you call back later?`,
    
    callbackNeeded: `The decision maker is not in right now. Can you call back tomorrow?`,
    
    international: `Yes, we export outside the UK. We ship to Canada and Australia using UPS. About 30 packages per month.`
  };
  
  return scenarios[scenario] || scenarios.full;
}

// HTTP request helper for integration tests
export async function httpRequest(url, options = {}) {
  const fetch = (await import('node-fetch')).default;
  const { method = 'GET', headers = {}, body = null } = options;
  
  const requestOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  if (body) {
    requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, requestOptions);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: response.headers
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error.message,
      data: null,
      error
    };
  }
}

// Check if server is available
export async function checkServerAvailable(baseUrl = process.env.TEST_BASE_URL || 'http://localhost:10000') {
  try {
    const result = await httpRequest(`${baseUrl}/health`);
    return result.ok || result.status === 200;
  } catch {
    return false;
  }
}

// Wait helper
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Deep equal comparison
export function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

// Extract error message
export function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

