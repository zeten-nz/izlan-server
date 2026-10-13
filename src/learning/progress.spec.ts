import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveFrontier, isContentPreparing, isTopicCompleted, mergeFrontier, parseFrontier, topicStateOf } from './progress';

const t = (ord: number, total: number, completed: number) => ({ ord, counts: { total, completed } });

test('mavzu tugagan: darsi bor va hammasi tugatilgan; darsi yo‘q mavzu tugagan emas', () => {
  assert.equal(isTopicCompleted({ total: 3, completed: 3 }), true);
  assert.equal(isTopicCompleted({ total: 3, completed: 2 }), false);
  assert.equal(isTopicCompleted({ total: 0, completed: 0 }), false);
  assert.equal(isContentPreparing({ total: 0, completed: 0 }), true);
  assert.equal(isContentPreparing({ total: 1, completed: 0 }), false);
});

test('deriveFrontier: tugagan mavzu keyingisini ochadi, tugamagan to‘xtatadi', () => {
  assert.equal(deriveFrontier([t(1, 2, 2), t(2, 1, 0), t(3, 1, 1)]), 2);
  assert.equal(deriveFrontier([t(1, 2, 2), t(2, 1, 1), t(3, 1, 0)]), 3);
  assert.equal(deriveFrontier([t(1, 2, 1), t(2, 1, 1)]), 1);
});

test('deriveFrontier: darsi yo‘q mavzu o‘tkazib yuborilmaydi va keyingisini ochmaydi', () => {
  assert.equal(deriveFrontier([t(1, 0, 0), t(2, 1, 1)]), 1);
  assert.equal(deriveFrontier([t(1, 1, 1), t(2, 0, 0), t(3, 1, 1)]), 2);
});

test('deriveFrontier: oxirgi mavzu tugasa frontier undan oshmaydi; bo‘sh daraja = 1', () => {
  assert.equal(deriveFrontier([t(1, 1, 1), t(2, 1, 1)]), 2);
  assert.equal(deriveFrontier([]), 1);
});

test('mergeFrontier faqat oshadi: unpublish/yangi dars oldin ochilganni qaytarmaydi', () => {
  // saqlangan 3; ustoz tugatilgan darsni nashrdan oldi → hosila 1 ga tushdi
  assert.equal(mergeFrontier(3, 1), 3);
  // yangi dars qo‘shildi: 1-mavzu endi "tugamagan", lekin ochilish saqlanadi
  assert.equal(mergeFrontier(2, deriveFrontier([t(1, 3, 2), t(2, 1, 0)])), 2);
  assert.equal(mergeFrontier(undefined, 1), 1);
  assert.equal(mergeFrontier(2, 4), 4);
});

test('parseFrontier: noto‘g‘ri qiymatlar tashlanadi', () => {
  assert.deepEqual(parseFrontier({ '1': 3, '2': 'x', '3': -1, '4': 2.5 }), { '1': 3 });
  assert.deepEqual(parseFrontier(null), {});
  assert.deepEqual(parseFrontier([1, 2]), {});
});

test('topicStateOf: SEQUENTIAL — frontier bo‘yicha; frontier=1 avvalgi xulq bilan bir xil', () => {
  const s = (ord: number, frontier: number) => topicStateOf(2, 'SEQUENTIAL', 2, ord, frontier);
  assert.deepEqual([1, 2, 3].map((o) => s(o, 1)), ['current', 'upcoming', 'upcoming']);
  assert.deepEqual([1, 2, 3].map((o) => s(o, 2)), ['open', 'current', 'upcoming']);
  assert.deepEqual([1, 2, 3].map((o) => s(o, 3)), ['open', 'open', 'current']);
});

test('topicStateOf: OPEN — hammasi ochiq, frontier "joriy" belgisini siljitadi', () => {
  const s = (ord: number, frontier: number) => topicStateOf(2, 'OPEN', 2, ord, frontier);
  assert.deepEqual([1, 2, 3].map((o) => s(o, 1)), ['current', 'open', 'open']);
  assert.deepEqual([1, 2, 3].map((o) => s(o, 2)), ['open', 'current', 'open']);
});

test('topicStateOf: daraja holati placement bilan belgilanadi (frontier ta’sir qilmaydi)', () => {
  assert.equal(topicStateOf(null, 'SEQUENTIAL', 1, 1, 5), 'locked');
  assert.equal(topicStateOf(2, 'SEQUENTIAL', 3, 1, 5), 'locked');
  assert.equal(topicStateOf(3, 'SEQUENTIAL', 2, 4, 1), 'open');
});

test('summarizeActivity: faol kunlar va ketma-ketlik (Toshkent kuni bo‘yicha)', async () => {
  const { summarizeActivity, dayKey } = await import('./progress');
  const now = new Date('2026-10-12T10:00:00Z');
  const day = (back: number, hourUtc = 8) => new Date(Date.UTC(2026, 9, 12 - back, hourUtc));
  const r = summarizeActivity([day(0), day(0, 9), day(1), day(2), day(5)], now, 28);
  assert.equal(r.streak, 3);
  assert.equal(r.activeDays7, 4);
  assert.equal(r.days.length, 28);
  assert.equal(r.days[27].events, 2);
  // bugun faollik yo'q, kecha bor: zanjir uzilmaydi
  assert.equal(summarizeActivity([day(1), day(2)], now).streak, 2);
  // 2 kun oldin bo'lsa zanjir uzilgan
  assert.equal(summarizeActivity([day(2)], now).streak, 0);
  // UTC 20:00 = Toshkent ertasi kuni 01:00
  assert.equal(dayKey(new Date('2026-10-11T20:00:00Z')), '2026-10-12');
});
