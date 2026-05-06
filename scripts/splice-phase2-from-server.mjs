import fs from 'node:fs';

const path = 'server.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const startMarker = '// Helper function to run logistics outreach';
const endMarker = '// moved: outbound A/B + review endpoints → routes/client-ops-mount.js';
const si = lines.findIndex((l) => l.includes(startMarker));
const ei = lines.findIndex((l) => l.trim() === endMarker);
if (si < 0 || ei < 0 || ei <= si) {
  console.error({ si, ei });
  throw new Error('phase2 splice markers not found');
}
const out = [...lines.slice(0, si), ...lines.slice(ei)];
fs.writeFileSync(path, out.join('\n'));
console.log(`removed server.js lines ${si + 1}-${ei} (${ei - si} lines)`);
