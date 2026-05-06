import fs from 'node:fs';

const path = 'server.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const out = [];
for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (n >= 578 && n <= 1232) continue;
  if (n >= 1251 && n <= 1261) continue;
  out.push(lines[i]);
}
fs.writeFileSync(path, out.join('\n'));
console.log('spliced server.js, removed lines 546-1199 and 1218-1228');
