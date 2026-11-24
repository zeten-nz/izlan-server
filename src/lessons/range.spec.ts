import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRange } from './range';

test("range: sarlavha yo'q, boshqa birlik, ko'p oraliq yoki buzuq — to'liq fayl (200)", () => {
  for (const h of [undefined, '', 'items=0-1', 'bytes=0-1,5-9', 'bytes=-', 'bytes=abc', 'bytes=5-3']) {
    assert.deepEqual(parseRange(h, 100), { type: 'full' }, String(h));
  }
});

test('range: oddiy, ochiq oxirli va oxirgi N bayt (206)', () => {
  assert.deepEqual(parseRange('bytes=0-1', 100), { type: 'partial', start: 0, end: 1 });
  assert.deepEqual(parseRange('bytes=10-', 100), { type: 'partial', start: 10, end: 99 });
  assert.deepEqual(parseRange('bytes=-20', 100), { type: 'partial', start: 80, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { type: 'partial', start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=90-1000', 100), { type: 'partial', start: 90, end: 99 }, 'oxiri faylga qisqartiriladi');
});

test("range: fayldan tashqari — 416", () => {
  assert.deepEqual(parseRange('bytes=100-', 100), { type: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=-0', 100), { type: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=0-', 0), { type: 'unsatisfiable' });
});
