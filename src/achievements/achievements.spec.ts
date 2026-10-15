import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENT_RULES_V1, SHOWCASE_MAX, evaluateRules, type Metrics } from './achievement.rules';

const m = (p: Partial<Metrics>): Metrics => ({ completedLessons: 0, completedTopics: 0, quiz90Topics: 0, activeDays: 0, ...p });
const earned = (metrics: Metrics) => evaluateRules(metrics).filter((r) => r.earned).map((r) => r.slug);

test('hech narsa yo‘q: hech qanday badge yo‘q', () => {
  assert.deepEqual(earned(m({})), []);
});

test('birinchi qadam: 1 ta dars', () => {
  assert.deepEqual(earned(m({ completedLessons: 1 })), ['birinchi-qadam']);
});

test('bilim yo‘lida: 9 ta yetmaydi, 10 ta yetadi; ilm fidoyisi: 99 yetmaydi, 100 yetadi', () => {
  assert.equal(earned(m({ completedTopics: 9 })).includes('bilim-yolida'), false);
  assert.equal(earned(m({ completedTopics: 10 })).includes('bilim-yolida'), true);
  assert.equal(earned(m({ completedTopics: 99 })).includes('ilm-fidoyisi'), false);
  assert.deepEqual(earned(m({ completedTopics: 100 })).sort(), ['bilim-yolida', 'ilm-fidoyisi']);
});

test('sinov ustasi: 10 ta turli mavzuda >= 90%', () => {
  assert.equal(earned(m({ quiz90Topics: 9 })).includes('sinov-ustasi'), false);
  assert.equal(earned(m({ quiz90Topics: 10 })).includes('sinov-ustasi'), true);
});

test('intizomli: 7 xil kun (ketma-ketlik emas)', () => {
  assert.equal(earned(m({ activeDays: 6 })).includes('intizomli'), false);
  assert.equal(earned(m({ activeDays: 7 })).includes('intizomli'), true);
});

test('progress: qiymat maqsaddan oshmaydi, foiz 0..100', () => {
  const p = evaluateRules(m({ completedTopics: 250, completedLessons: 0 }));
  const bilim = p.find((x) => x.slug === 'bilim-yolida');
  assert.equal(bilim?.value, 10);
  assert.equal(bilim?.pct, 100);
  const first = p.find((x) => x.slug === 'birinchi-qadam');
  assert.equal(first?.pct, 0);
});

test('qoidalar: 5 ta, slug noyob, XP/bezak maydoni yo‘q', () => {
  assert.equal(ACHIEVEMENT_RULES_V1.length, 5);
  assert.equal(new Set(ACHIEVEMENT_RULES_V1.map((r) => r.slug)).size, 5);
  for (const r of ACHIEVEMENT_RULES_V1) assert.deepEqual(Object.keys(r).sort(), ['metric', 'requirement', 'slug', 'target']);
  assert.equal(SHOWCASE_MAX, 3);
});
