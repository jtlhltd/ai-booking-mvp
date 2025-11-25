import 'dotenv/config';
import { init, query } from '../db.js';

await init();

const result = await query('SELECT vapi_json FROM tenants WHERE client_key = $1', ['d2d-xpress-tom']);

if (result.rows.length === 0) {
  console.log('❌ Client not found');
  process.exit(1);
}

const row = result.rows[0];
console.log('\n📋 VAPI Configuration for d2d-xpress-tom:\n');
console.log('vapi_json:', JSON.stringify(row.vapi_json, null, 2));
console.log('\nHas assistantId:', !!row.vapi_json?.assistantId);
console.log('assistantId value:', row.vapi_json?.assistantId || 'NOT SET');
console.log('\n');

process.exit(0);

