import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideMatch, summarizeIncomes, tashkentMonthOf, tashkentMonthRange, defaultCreditFor, extendAccess, hasActiveAccess, isPaidCourse, isPaywalledTopic, pickSuffix, validateTopupBase, type TopupCandidate } from './billing.rules';

const DAY = 86_400_000;

test('kurs: null va 0 — bepul, musbat — pullik', () => {
  assert.equal(isPaidCourse(null), false);
  assert.equal(isPaidCourse(undefined), false);
  assert.equal(isPaidCourse(0), false);
  assert.equal(isPaidCourse(29_000), true);
});

test('mavzu: har darajaning 1-mavzusi bepul, keyingilari pullik kursda yopiq', () => {
  assert.equal(isPaywalledTopic(29_000, 1), false);
  assert.equal(isPaywalledTopic(29_000, 2), true);
  assert.equal(isPaywalledTopic(null, 5), false);
  assert.equal(isPaywalledTopic(0, 5), false);
});

test('obuna: tugash sanasi o\'tgan bo\'lsa faol emas', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(hasActiveAccess(null, now), false);
  assert.equal(hasActiveAccess(new Date(now.getTime() - 1), now), false);
  assert.equal(hasActiveAccess(now, now), false);
  assert.equal(hasActiveAccess(new Date(now.getTime() + 1), now), true);
});

test('uzaytirish: faol obuna ustiga 30 kun, tugagan bo\'lsa hozirdan 30 kun', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(extendAccess(null, now).getTime(), now.getTime() + 30 * DAY);
  const active = new Date(now.getTime() + 10 * DAY);
  assert.equal(extendAccess(active, now).getTime(), active.getTime() + 30 * DAY);
  const expired = new Date(now.getTime() - 5 * DAY);
  assert.equal(extendAccess(expired, now).getTime(), now.getTime() + 30 * DAY);
});

test("to'ldirish: asosiy summa 5 000..5 000 000 va 1 000 ga karrali", () => {
  assert.deepEqual(validateTopupBase(50_000), { ok: true });
  assert.equal((validateTopupBase(4_000) as { reason: string }).reason, 'TOO_SMALL');
  assert.equal((validateTopupBase(5_001_000) as { reason: string }).reason, 'TOO_LARGE');
  assert.equal((validateTopupBase(50_500) as { reason: string }).reason, 'NOT_MULTIPLE');
  assert.equal((validateTopupBase(1.5) as { reason: string }).reason, 'NOT_INTEGER');
});

test("qo'shimcha: aylanma, band o'tkaziladi, karantin faqat oxirgi chora", () => {
  assert.equal(pickSuffix(0, new Set(), new Set()), 1);
  assert.equal(pickSuffix(5, new Set([6, 7]), new Set()), 8);
  assert.equal(pickSuffix(99, new Set(), new Set()), 1);
  assert.equal(pickSuffix(0, new Set(), new Set([1, 2])), 3);
  const all = new Set(Array.from({ length: 99 }, (_, i) => i + 1));
  assert.equal(pickSuffix(0, all, new Set()), null);
  const allButQ = new Set([...all].filter((x) => x !== 42));
  assert.equal(pickSuffix(0, allButQ, new Set([42])), 42);
});

test('asosiy summa: oxirgi 1..99 olib tashlanadi, aks holda to\'liq', () => {
  assert.equal(defaultCreditFor(50_012), 50_000);
  assert.equal(defaultCreditFor(50_000), 50_000);
  assert.equal(defaultCreditFor(50_150), 50_150);
});

test('moslash: muddat ichida MATCH, kechiksa LATE_MATCH, takror/bekor/noto\'g\'ri — REVIEW', () => {
  const t0 = new Date('2026-11-10T10:00:00Z');
  const req = (o: Partial<TopupCandidate> = {}): TopupCandidate => ({
    id: 'r1', userId: 'u1', amount: 50_012, baseAmount: 50_000, status: 'PENDING', createdAt: t0, expiresAt: new Date(t0.getTime() + 20 * 60_000), ...o,
  });
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  const inc = (min: number, amount = 50_012, hasFraction = false) => ({ amount, hasFraction, receivedAt: at(min) });

  assert.deepEqual(decideMatch(inc(5), [req()]), { type: 'MATCH', requestId: 'r1', userId: 'u1', credit: 50_000 });
  assert.equal(decideMatch(inc(60), [req({ status: 'EXPIRED' })]).type, 'LATE_MATCH');
  assert.deepEqual(decideMatch(inc(60 * 25), [req({ status: 'EXPIRED' })]), { type: 'REVIEW', reason: 'TOO_LATE' });
  assert.deepEqual(decideMatch(inc(5), [req({ status: 'PAID' })]), { type: 'REVIEW', reason: 'ALREADY_PAID' });
  assert.deepEqual(decideMatch(inc(5), [req({ status: 'CANCELLED' })]), { type: 'REVIEW', reason: 'CANCELLED' });
  assert.deepEqual(decideMatch(inc(5, 50_013), [req()]), { type: 'REVIEW', reason: 'NO_REQUEST' });
  assert.deepEqual(decideMatch(inc(5, 50_012, true), [req()]), { type: 'REVIEW', reason: 'FRACTION' });
  // So'rovdan OLDIN tushgan pul unga tegishli emas
  assert.deepEqual(decideMatch(inc(-10), [req()]), { type: 'REVIEW', reason: 'NO_REQUEST' });
  // Summa qayta berilgan: eng oxirgi so'rov egasi oladi
  const old = req({ id: 'old', userId: 'u0', status: 'EXPIRED', createdAt: at(-60), expiresAt: at(-40) });
  assert.deepEqual(decideMatch(inc(5), [old, req()]), { type: 'MATCH', requestId: 'r1', userId: 'u1', credit: 50_000 });
});

test('hisobot: oy chegaralari Toshkent (UTC+5) bo\'yicha, noto\'g\'ri format rad etiladi', () => {
  const r = tashkentMonthRange('2026-11')!;
  assert.equal(r.from.toISOString(), '2026-10-31T19:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-11-30T19:00:00.000Z');
  assert.equal(tashkentMonthRange('2026-12')!.to.toISOString(), '2026-12-31T19:00:00.000Z');
  for (const bad of ['2026-13', '2026-1', '26-11', '2026-11-01', '', '1999-01']) assert.equal(tashkentMonthRange(bad), null, bad);
  // 30-noyabr 19:30 UTC = 1-dekabr 00:30 Toshkent
  assert.equal(tashkentMonthOf(new Date('2026-11-30T19:30:00Z')), '2026-12');
  assert.equal(tashkentMonthOf(new Date('2026-11-30T18:59:00Z')), '2026-11');
});

test('hisobot: credited / review / ignored ajratiladi, kunlar Toshkent sanasi bo\'yicha', () => {
  const s = summarizeIncomes([
    { amount: 50_001, status: 'MATCHED', receivedAt: new Date('2026-11-01T10:00:00Z'), creditedAmount: 50_000 },
    { amount: 30_007, status: 'LATE_MATCHED', receivedAt: new Date('2026-11-01T19:30:00Z'), creditedAmount: 30_000 }, // Toshkent: 2-noyabr
    { amount: 10_000, status: 'ASSIGNED', receivedAt: new Date('2026-11-01T11:00:00Z'), creditedAmount: 10_000 },
    { amount: 12_345, status: 'REVIEW', receivedAt: new Date('2026-11-03T10:00:00Z'), creditedAmount: null },
    { amount: 200_000, status: 'IGNORED', receivedAt: new Date('2026-11-03T10:00:00Z'), creditedAmount: null },
  ]);
  assert.deepEqual(s.credited, { count: 3, sum: 90_008, creditedSum: 90_000 });
  assert.deepEqual(s.review, { count: 1, sum: 12_345 });
  assert.deepEqual(s.ignored, { count: 1, sum: 200_000 });
  assert.deepEqual(s.days, [
    { day: '2026-11-01', count: 2, sum: 60_001 },
    { day: '2026-11-02', count: 1, sum: 30_007 },
  ]);
  assert.deepEqual(summarizeIncomes([]), { credited: { count: 0, sum: 0, creditedSum: 0 }, review: { count: 0, sum: 0 }, ignored: { count: 0, sum: 0 }, days: [] });
});
