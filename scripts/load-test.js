// Load Testing Script for AI Booking System
// Tests system performance under load

import fetch from 'node-fetch';

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://ai-booking-mvp.onrender.com';
const API_KEY = process.env.API_KEY || 'test-key';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS) || 10;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS) || 100;
const CLIENT_KEY = process.env.CLIENT_KEY || 'stay-focused-fitness-chris';

// Test endpoints
const ENDPOINTS = [
  { path: '/health/lb', method: 'GET', requiresAuth: false },
  { path: '/api/health/detailed', method: 'GET', requiresAuth: true },
  { path: '/api/stats?clientKey=' + CLIENT_KEY, method: 'GET', requiresAuth: true },
  { path: '/api/performance/queries/stats', method: 'GET', requiresAuth: true },
];

// Results tracking
const results = {
  total: 0,
  success: 0,
  failed: 0,
  errors: [],
  responseTimes: [],
  statusCodes: {}
};

/**
 * Make a single request
 */
async function makeRequest(endpoint) {
  const startTime = Date.now();
  const url = `${BASE_URL}${endpoint.path}`;
  const options = {
    method: endpoint.method,
    headers: endpoint.requiresAuth ? { 'X-API-Key': API_KEY } : {}
  };

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    
    results.total++;
    results.responseTimes.push(duration);
    
    if (response.ok) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({
        endpoint: endpoint.path,
        status: response.status,
        duration
      });
    }
    
    const statusCode = response.status;
    results.statusCodes[statusCode] = (results.statusCodes[statusCode] || 0) + 1;
    
    return { success: response.ok, duration, status: response.status };
  } catch (error) {
    const duration = Date.now() - startTime;
    results.total++;
    results.failed++;
    results.errors.push({
      endpoint: endpoint.path,
      error: error.message,
      duration
    });
    return { success: false, duration, error: error.message };
  }
}

/**
 * Run concurrent requests
 */
async function runConcurrentRequests(endpoint, count) {
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(makeRequest(endpoint));
  }
  return Promise.all(promises);
}

/**
 * Calculate statistics
 */
function calculateStats(times) {
  if (times.length === 0) return null;
  
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / times.length),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

/**
 * Run load test
 */
async function runLoadTest() {
  console.log('🚀 Starting Load Test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Total Requests: ${TOTAL_REQUESTS}`);
  console.log(`Endpoints: ${ENDPOINTS.length}`);
  console.log('');

  const startTime = Date.now();
  const requestsPerEndpoint = Math.ceil(TOTAL_REQUESTS / ENDPOINTS.length);
  
  // Run tests for each endpoint
  for (const endpoint of ENDPOINTS) {
    console.log(`Testing: ${endpoint.method} ${endpoint.path}`);
    
    const batches = Math.ceil(requestsPerEndpoint / CONCURRENT_REQUESTS);
    for (let batch = 0; batch < batches; batch++) {
      const remaining = requestsPerEndpoint - (batch * CONCURRENT_REQUESTS);
      const batchSize = Math.min(CONCURRENT_REQUESTS, remaining);
      
      await runConcurrentRequests(endpoint, batchSize);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Calculate statistics
  const stats = calculateStats(results.responseTimes);
  const successRate = (results.success / results.total * 100).toFixed(2);
  const requestsPerSecond = (results.total / (totalDuration / 1000)).toFixed(2);
  
  // Print results
  console.log('\n📊 Load Test Results');
  console.log('='.repeat(50));
  console.log(`Total Requests: ${results.total}`);
  console.log(`Successful: ${results.success} (${successRate}%)`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Requests/Second: ${requestsPerSecond}`);
  console.log('');
  
  if (stats) {
    console.log('⏱️  Response Time Statistics (ms)');
    console.log(`  Min: ${stats.min}ms`);
    console.log(`  Max: ${stats.max}ms`);
    console.log(`  Avg: ${stats.avg}ms`);
    console.log(`  Median: ${stats.median}ms`);
    console.log(`  P95: ${stats.p95}ms`);
    console.log(`  P99: ${stats.p99}ms`);
    console.log('');
  }
  
  console.log('📈 Status Code Distribution');
  for (const [code, count] of Object.entries(results.statusCodes)) {
    const percentage = (count / results.total * 100).toFixed(1);
    console.log(`  ${code}: ${count} (${percentage}%)`);
  }
  console.log('');
  
  if (results.errors.length > 0) {
    console.log('❌ Errors (first 10):');
    results.errors.slice(0, 10).forEach((error, i) => {
      console.log(`  ${i + 1}. ${error.endpoint}: ${error.error || error.status}`);
    });
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more errors`);
    }
    console.log('');
  }
  
  // Performance assessment
  console.log('✅ Performance Assessment');
  if (successRate >= 99) {
    console.log('  ✅ Excellent: Success rate >= 99%');
  } else if (successRate >= 95) {
    console.log('  ⚠️  Good: Success rate >= 95%');
  } else {
    console.log('  ❌ Poor: Success rate < 95%');
  }
  
  if (stats && stats.p95 < 500) {
    console.log('  ✅ Excellent: P95 response time < 500ms');
  } else if (stats && stats.p95 < 1000) {
    console.log('  ⚠️  Good: P95 response time < 1000ms');
  } else {
    console.log('  ❌ Poor: P95 response time >= 1000ms');
  }
  
  if (parseFloat(requestsPerSecond) >= 50) {
    console.log('  ✅ Excellent: Throughput >= 50 req/s');
  } else if (parseFloat(requestsPerSecond) >= 20) {
    console.log('  ⚠️  Good: Throughput >= 20 req/s');
  } else {
    console.log('  ❌ Poor: Throughput < 20 req/s');
  }
  
  console.log('');
  console.log('✨ Load test complete!');
}

// Run the test
runLoadTest().catch(error => {
  console.error('❌ Load test failed:', error);
  process.exit(1);
});

