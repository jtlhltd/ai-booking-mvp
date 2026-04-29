import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function extractFnSource(html, fnStartRegex, fnEndRegex) {
  const start = html.match(fnStartRegex)?.index;
  if (start == null) throw new Error('Could not locate function start');
  const tail = html.slice(start);
  const end = tail.match(fnEndRegex)?.index;
  if (end == null) throw new Error('Could not locate function end');
  return tail.slice(0, end).trimEnd();
}

describe('follow-up queue helpers: payload + rollback', () => {
  test('build batchPatch payload filters by selection keys + numeric _row', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public', 'client-dashboard.html'), 'utf8');

    const payloadSrc = extractFnSource(
      html,
      /function\s+followUpBuildBatchPatchPayload\s*\(/,
      /\n\s*function\s+followUpRestoreByKeySnapshots\s*\(/
    );

    const sandbox = {};
    vm.runInNewContext(`${payloadSrc}`, sandbox, { timeout: 1000 });
    const { followUpBuildBatchPatchPayload } = sandbox;

    const keyForRow = (r) => `sheetRow:${r._row}`;
    const keySet = new Set(['sheetRow:2', 'sheetRow:4']);
    const patch = { Status: 'Called' };

    const rawRows = [
      { _row: 2, Status: 'To Call' },
      { _row: 3, Status: 'To Call' },
      { _row: 'x', Status: 'To Call' },
      { _row: 4, Status: 'To Call' }
    ];

    const out = followUpBuildBatchPatchPayload(rawRows, keySet, patch, keyForRow);
    expect(out).toEqual({
      patches: [
        { row: 2, patch },
        { row: 4, patch }
      ]
    });
  });

  test('restoreFailedRows restores only failed rows by _row number', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public', 'client-dashboard.html'), 'utf8');

    const src = extractFnSource(
      html,
      /function\s+followUpRestoreFailedRows\s*\(/,
      /\n\s*function\s+followUpUpdateSelectionUi\s*\(/
    );

    const sandbox = {};
    vm.runInNewContext(`${src}`, sandbox, { timeout: 1000 });
    const { followUpRestoreFailedRows } = sandbox;

    const originalsByRowNumber = new Map([
      [2, { _row: 2, Status: 'Original-2' }],
      [3, { _row: 3, Status: 'Original-3' }]
    ]);

    const rawRows = [
      { _row: 2, Status: 'Mutated-2' },
      { _row: 3, Status: 'Mutated-3' },
      { _row: 'x', Status: 'Mutated-x' }
    ];

    const out = followUpRestoreFailedRows(rawRows, originalsByRowNumber, [3]);
    expect(out).toEqual([
      rawRows[0], // untouched
      { _row: 3, Status: 'Original-3' }, // restored
      rawRows[2] // unchanged because _row not numeric
    ]);
  });

  test('restoreByKeySnapshots restores only rows whose key exists in originalsByKey', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public', 'client-dashboard.html'), 'utf8');

    const src = extractFnSource(
      html,
      /function\s+followUpRestoreByKeySnapshots\s*\(/,
      /\n\s*function\s+followUpRestoreFailedRows\s*\(/
    );

    const sandbox = {};
    vm.runInNewContext(`${src}`, sandbox, { timeout: 1000 });
    const { followUpRestoreByKeySnapshots } = sandbox;

    const keyForRow = (r) => `sheetRow:${r._row}`;
    const originalsByKey = new Map([
      ['sheetRow:2', { _row: 2, Status: 'Original-2' }]
    ]);

    const rawRows = [
      { _row: 2, Status: 'Mutated-2' },
      { _row: 3, Status: 'Mutated-3' }
    ];

    const out = followUpRestoreByKeySnapshots(rawRows, originalsByKey, keyForRow);
    expect(out).toEqual([
      { _row: 2, Status: 'Original-2' },
      rawRows[1]
    ]);
  });
});

