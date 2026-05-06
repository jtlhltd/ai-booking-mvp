import fs from 'node:fs';

let s = fs.readFileSync('lib/_queue_extract.js', 'utf8');
s = s.replaceAll("from './db.js'", "from '../db.js'");
s = s.replaceAll('from "./db.js"', 'from "../db.js"');
s = s.replace(/import\(['"]\.\/db\.js['"]\)/g, "import('../db.js')");
s = s.replace(/import\(['"]\.\/lib\//g, "import('./");
s = s.replace('async function processRetryQueue', 'export async function processRetryQueue');
s = s.replace('async function processCallQueue', 'export async function processCallQueue');
s = s.replace('async function processVapiCallFromQueue', 'export async function processVapiCallFromQueue');
s = s.replace('async function queueNewLeadsForCalling', 'export async function queueNewLeadsForCalling');
fs.writeFileSync('lib/_queue_body_exports.js', s);
