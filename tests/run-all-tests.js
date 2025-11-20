// tests/run-all-tests.js
// Master test runner for all test suites

import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const category = args.find(arg => !arg.startsWith('--')) || 'all';
const skipIntegration = args.includes('--skip-integration');
const parallel = args.includes('--parallel');
const coverage = args.includes('--coverage');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
}

async function findTestFiles(category) {
  const testDirs = {
    unit: 'tests/unit',
    integration: 'tests/integration',
    admin: 'tests/admin',
    routes: 'tests/routes',
    cron: 'tests/cron',
    lib: 'tests/lib',
    middleware: 'tests/middleware',
    database: 'tests/database',
    frontend: 'tests/frontend',
    error: 'tests/error',
    security: 'tests/security',
    data: 'tests/data',
    performance: 'tests/performance',
    monitoring: 'tests/monitoring',
    business: 'tests/business',
    import: 'tests/import'
  };
  
  const dir = testDirs[category];
  if (!dir && category !== 'all') {
    colorLog(`Unknown category: ${category}`, 'red');
    return [];
  }
  
  if (category === 'all') {
    const allFiles = [];
    for (const [cat, dirPath] of Object.entries(testDirs)) {
      if (skipIntegration && (cat === 'integration' || cat === 'admin' || cat === 'routes')) {
        continue;
      }
      try {
        const dirPathClean = dirPath.replace(/^tests\//, '');
        const files = await readdir(join(__dirname, dirPathClean));
        const testFiles = files
          .filter(f => f.startsWith('test-') && f.endsWith('.js'))
          .map(f => join(dirPath, f));
        allFiles.push(...testFiles);
      } catch {
        // Directory doesn't exist yet
      }
    }
    return allFiles;
  }
  
  try {
    const dirClean = dir.replace(/^tests\//, '');
    const files = await readdir(join(__dirname, dirClean));
    return files
      .filter(f => f.startsWith('test-') && f.endsWith('.js'))
      .map(f => join(dir, f));
  } catch {
    return [];
  }
}

async function runTest(file) {
  return new Promise((resolve) => {
    const proc = spawn('node', [file], {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      resolve({ file, code, success: code === 0 });
    });
  });
}

async function runTestsParallel(files) {
  const results = await Promise.all(files.map(runTest));
  return results;
}

async function runTestsSequential(files) {
  const results = [];
  for (const file of files) {
    const result = await runTest(file);
    results.push(result);
  }
  return results;
}

async function main() {
  colorLog('\n' + '='.repeat(60), 'cyan');
  colorLog('Comprehensive Test Suite Runner', 'bright');
  colorLog('='.repeat(60), 'cyan');
  
  const testFiles = await findTestFiles(category);
  
  if (testFiles.length === 0) {
    colorLog(`No test files found for category: ${category}`, 'yellow');
    process.exit(0);
  }
  
  colorLog(`\nFound ${testFiles.length} test file(s)`, 'blue');
  if (skipIntegration) {
    colorLog('Skipping integration tests', 'yellow');
  }
  
  const startTime = Date.now();
  const results = parallel && category === 'unit'
    ? await runTestsParallel(testFiles)
    : await runTestsSequential(testFiles);
  
  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  colorLog('\n' + '='.repeat(60), 'cyan');
  colorLog('Test Summary', 'bright');
  colorLog('='.repeat(60), 'cyan');
  colorLog(`Total: ${results.length}`, 'blue');
  colorLog(`Passed: ${passed}`, 'green');
  colorLog(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  colorLog(`Duration: ${duration}ms`, 'blue');
  
  if (failed > 0) {
    colorLog('\nFailed Tests:', 'red');
    results.filter(r => !r.success).forEach(r => {
      colorLog(`  - ${r.file}`, 'red');
    });
  }
  
  if (coverage) {
    colorLog('\nCoverage Report:', 'cyan');
    colorLog(`  Unit Tests: ${testFiles.filter(f => f.includes('/unit/')).length} files`, 'blue');
    colorLog(`  Integration Tests: ${testFiles.filter(f => f.includes('/integration/')).length} files`, 'blue');
    colorLog(`  Admin Tests: ${testFiles.filter(f => f.includes('/admin/')).length} files`, 'blue');
    colorLog(`  Route Tests: ${testFiles.filter(f => f.includes('/routes/')).length} files`, 'blue');
    colorLog(`  Other Tests: ${testFiles.filter(f => !f.includes('/unit/') && !f.includes('/integration/') && !f.includes('/admin/') && !f.includes('/routes/')).length} files`, 'blue');
  }
  
  colorLog('='.repeat(60), 'cyan');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  colorLog(`\nTest runner error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

