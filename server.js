// ULTRA-AGGRESSIVE Node.js version check
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

console.log(`🚨 RENDER DEPLOYMENT CHECK 🚨`);
console.log(`🔍 Detected Node.js version: ${nodeVersion}`);
console.log(`🔍 Major version: ${majorVersion}`);

if (majorVersion !== 20) {
  console.error(`💥 CRITICAL ERROR: WRONG NODE.JS VERSION 💥`);
  console.error(`💥 Current: ${nodeVersion} | Required: v20.x 💥`);
  console.error(`💥 Render is ignoring our Node.js version settings 💥`);
  console.error(`💥 This will cause better-sqlite3 compilation to fail 💥`);
  console.error(`💥 DEPLOYMENT WILL FAIL - EXITING NOW 💥`);
  process.exit(1);
}

console.log(`✅ Node.js version check PASSED: ${nodeVersion}`);
console.log(`✅ Proceeding with application startup...`);

import './src/server.js';
