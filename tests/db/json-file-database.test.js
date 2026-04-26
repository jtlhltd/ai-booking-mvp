import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'node:path';

import { JsonFileDatabase } from '../../db/json-file-database.js';

describe('db/json-file-database', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jfdb-'));
  });
  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('loadData returns defaults when file missing', () => {
    const db = new JsonFileDatabase(dir);
    expect(db.data.tenants).toEqual([]);
    expect(db.data.leads).toEqual([]);
  });

  test('prepare().all reads table from SELECT', () => {
    const db = new JsonFileDatabase(dir);
    db.data.leads = [{ id: 1, name: 'a' }];
    const stmt = db.prepare('SELECT * FROM leads');
    expect(stmt.all()).toEqual([{ id: 1, name: 'a' }]);
  });

  test('extractTableName parses FROM / INTO / UPDATE', () => {
    const db = new JsonFileDatabase(dir);
    expect(db.extractTableName('SELECT * FROM tenants')).toBe('tenants');
    expect(db.extractTableName('INSERT INTO api_keys (x) VALUES (1)')).toBe('api_keys');
    expect(db.extractTableName('UPDATE bookings SET x=1')).toBe('bookings');
    expect(db.extractTableName('SELECT 1')).toBe('leads');
  });

  test('prepare().run INSERT pushes row and saveData writes file', () => {
    const db = new JsonFileDatabase(dir);
    db.data.leads = [];
    const stmt = db.prepare('INSERT INTO leads');
    const out = stmt.run({ name: 'n1' });
    expect(out.changes).toBe(1);
    expect(db.data.leads.length).toBe(1);
    expect(fs.existsSync(db.dataFile)).toBe(true);
    const disk = JSON.parse(fs.readFileSync(db.dataFile, 'utf8'));
    expect(disk.leads[0].name).toBe('n1');
  });

  test('exec does not throw', () => {
    const db = new JsonFileDatabase(dir);
    expect(() => db.exec('SELECT 1')).not.toThrow();
  });
});
