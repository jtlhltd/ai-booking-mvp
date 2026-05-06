import fs from 'node:fs';

const path = 'server.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const out = [];
for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (n >= 946 && n <= 1409) continue;
  out.push(lines[i]);
}
fs.writeFileSync(path, out.join('\n'));
console.log('removed server.js lines 920-1382');
