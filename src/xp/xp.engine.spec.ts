import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayKey, grantedFor, levelFor, multiplierBp, quizTiersReached, scorePct } from './xp.engine';
import { ACTIVE_XP_POLICY, XP_POLICY_V1 } from './xp.policy';

test('test bo‘sag‘alari: 59/60/79/80/89/90 chegaralari (kumulyativ)', () => {
  const t = (c: number, n: number) => quizTiersReached(c, n);
  assert.deepEqual(t(59, 100), []);
  assert.deepEqual(t(60, 100), [60]);
  assert.deepEqual(t(79, 100), [60]);
  assert.deepEqual(t(80, 100), [60, 80]);
  assert.deepEqual(t(89, 100), [60, 80]);
  assert.deepEqual(t(90, 100), [60, 80, 90]);
  assert.deepEqual(t(5, 10), []); // 50%
  assert.deepEqual(t(3, 5), [60]); // 60% aniq
  assert.deepEqual(t(0, 0), []);
  // butun son solishtirish: 2/3 = 66.6% -> 60 bo'sag'a, 80 emas
  assert.deepEqual(t(2, 3), [60]);
  assert.equal(scorePct(2, 3), 66);
});

test('koeffitsiyentlar: 1-mavzu 100%, 2-mavzu 50%, 3+ 10%', () => {
  assert.equal(multiplierBp(1), 10_000);
  assert.equal(multiplierBp(2), 5_000);
  assert.equal(multiplierBp(3), 1_000);
  assert.equal(multiplierBp(9), 1_000);
});

test('yig‘ma yaxlitlash: bo‘laklash foyda bermaydi va tartibga bog‘liq emas', () => {
  let cum = 0;
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    sum += grantedFor(cum, 1, 1_000);
    cum += 1;
  }
  assert.equal(sum, Math.floor((5 * 1_000) / 10_000));
  // 10 + 25 (3+ mavzu): jami floor(35*0.1)=3, tartibdan qat'i nazar
  assert.equal(grantedFor(0, 10, 1_000) + grantedFor(10, 25, 1_000), 3);
  assert.equal(grantedFor(0, 25, 1_000) + grantedFor(25, 10, 1_000), 3);
  // 50%: 10+25 jami floor(17.5)=17
  assert.equal(grantedFor(0, 10, 5_000) + grantedFor(10, 25, 5_000), 17);
  // 100%: o'zgarishsiz
  assert.equal(grantedFor(7, 25, 10_000), 25);
});

test('misollar: 50% -> 0, 65% -> 10, 85% -> 20, 95% -> 30 bazaviy', () => {
  const base = (pct: number) =>
    quizTiersReached(pct, 100).reduce((s, m) => s + (XP_POLICY_V1.quizTiers.find((x) => x.minPct === m)?.xp ?? 0), 0);
  assert.deepEqual([50, 65, 85, 95].map(base), [0, 10, 20, 30]);
});

test('daraja: chegaralar, progress va maksimal daraja', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(199).level, 1);
  assert.equal(levelFor(200).level, 2);
  assert.equal(levelFor(999).level, 3);
  assert.equal(levelFor(1000).level, 4);
  assert.equal(levelFor(14_999).level, 9);
  const l1 = levelFor(100);
  assert.equal(l1.progressPct, 50);
  assert.equal(l1.xpToNext, 100);
  const max = levelFor(15_000);
  assert.equal(max.level, 10);
  assert.equal(max.isMax, true);
  assert.equal(max.progressPct, 100);
  assert.equal(max.xpToNext, 0);
  assert.equal(max.nextLevel, null);
  assert.equal(levelFor(99_999).level, 10);
});

test('sana kaliti Asia/Tashkent (UTC+5) bo‘yicha almashadi', () => {
  assert.equal(dayKey(new Date('2026-10-14T18:59:59Z')), '2026-10-14'); // 23:59:59 Toshkent
  assert.equal(dayKey(new Date('2026-10-14T19:00:00Z')), '2026-10-15'); // 00:00 Toshkent
});

test('siyosat: konspekt XP o‘chirilgan, versiya belgilangan, test maksimal 30', () => {
  assert.equal(ACTIVE_XP_POLICY.events.NOTE_VERIFIED.enabled, false);
  assert.equal(ACTIVE_XP_POLICY.version, 'xp-v1');
  assert.equal(ACTIVE_XP_POLICY.quizTiers.reduce((s, t) => s + t.xp, 0), 30);
});
