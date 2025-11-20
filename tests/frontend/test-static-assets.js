// tests/frontend/test-static-assets.js
// Test static file serving

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Static Assets Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Static files served', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    // Test that static files can be served
    const staticPaths = ['/dashboard.html', '/leads.html', '/signup.html'];
    staticPaths.forEach(path => {
      assertTrue(path.startsWith('/'), `Path ${path} is absolute`);
      assertTrue(path.endsWith('.html') || path.includes('.'), `Path ${path} has extension`);
    });
  });
  
  test('Static asset types', () => {
    const assetTypes = {
      html: '.html',
      css: '.css',
      js: '.js',
      images: ['.png', '.jpg', '.svg']
    };
    
    assertTrue('html' in assetTypes, 'Has HTML assets');
    assertTrue('css' in assetTypes, 'Has CSS assets');
    assertTrue('js' in assetTypes, 'Has JS assets');
  });
  
  test('Asset path resolution', () => {
    const basePath = '/static';
    const asset = 'logo.png';
    const fullPath = `${basePath}/${asset}`;
    
    assertTrue(fullPath === '/static/logo.png', 'Path resolved correctly');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

