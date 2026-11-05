import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PRICE_XP, RECOMMENDED_PRICE_RANGE, checkPrice } from './price.policy';

test('narx: null (belgilanmagan) qabul qilinadi', () => {
  const r = checkPrice(null, 'RARE');
  assert.ok(r.ok);
  assert.equal(r.ok && r.price, null);
});

test('narx: nol, manfiy, kasr, matn va juda katta qiymat rad etiladi', () => {
  for (const bad of [0, -1, 1.5, NaN, '100', undefined, {}, MAX_PRICE_XP + 1]) {
    assert.equal(checkPrice(bad, 'COMMON').ok, false, String(bad));
  }
});

test('narx: tavsiya diapazoni ichida/tashqarisida (ogohlantirish, lekin ruxsat)', () => {
  const inside = checkPrice(200, 'COMMON');
  assert.ok(inside.ok && inside.inRange);
  const outside = checkPrice(50, 'COMMON');
  assert.ok(outside.ok && !outside.inRange, 'diapazondan tashqari narx ruxsat etiladi, ogohlantirish bilan');
  assert.deepEqual(outside.ok && outside.recommended, RECOMMENDED_PRICE_RANGE.COMMON);
  const top = checkPrice(10_000, 'LEGENDARY');
  assert.ok(top.ok && top.inRange);
  assert.ok(checkPrice(10_001, 'LEGENDARY').ok);
});

test('tavsiya diapazonlari spetsifikatsiyaga mos', () => {
  assert.deepEqual(RECOMMENDED_PRICE_RANGE, {
    COMMON: { min: 150, max: 300 },
    RARE: { min: 600, max: 1200 },
    EPIC: { min: 2000, max: 4000 },
    LEGENDARY: { min: 6000, max: 10000 },
  });
});
