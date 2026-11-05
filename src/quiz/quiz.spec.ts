import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grade, parseQuestions, studentView } from './quiz.rules';

const q = (id: string, correct = 'a') => ({
  id,
  text: `Savol ${id}`,
  options: [
    { id: 'a', text: 'Bir' },
    { id: 'b', text: 'Ikki' },
    { id: 'c', text: 'Uch' },
  ],
  correctId: correct,
});
const three = [q('q1'), q('q2', 'b'), q('q3', 'c')];

test('parseQuestions: to‘g‘ri savollar qabul qilinadi, ortiqcha maydonlar tashlanadi', () => {
  const r = parseQuestions([{ ...q('q1'), hack: '<script>' }, q('q2'), q('q3')], { forPublish: true });
  assert.ok(r.ok);
  assert.equal('hack' in (r.ok ? r.questions[0] : {}), false);
});

test('parseQuestions: nashr uchun kamida 3 ta savol', () => {
  assert.equal(parseQuestions([q('q1')], { forPublish: true }).ok, false);
  assert.equal(parseQuestions([q('q1')]).ok, true); // qoralama uchun yetarli
});

test('parseQuestions: noto‘g‘ri tuzilmalar rad etiladi', () => {
  const bad = [
    'x',
    [{ ...q('q1'), correctId: 'zzz' }],
    [{ ...q('q1'), options: [{ id: 'a', text: 'Faqat bitta' }] }],
    [{ ...q('q1'), options: [{ id: 'a', text: 'Bir' }, { id: 'a', text: 'Ikki' }] }],
    [{ ...q('q1'), options: [{ id: 'a', text: 'Bir' }, { id: 'b', text: 'bir' }] }],
    [q('q1'), q('q1')],
    [{ ...q('q1'), text: '   ' }],
    [{ ...q('bad id!') }],
  ];
  for (const b of bad) assert.equal(parseQuestions(b).ok, false, JSON.stringify(b).slice(0, 60));
});

test('grade: backend hisoblaydi, noma‘lum savol/variant noto‘g‘ri hisoblanadi', () => {
  const qs = (parseQuestions(three) as { ok: true; questions: ReturnType<typeof q>[] }).questions;
  const g = grade(qs, { q1: 'a', q2: 'b', q3: 'a', zzz: 'a' });
  assert.equal(g.correct, 2);
  assert.equal(g.total, 3);
  assert.deepEqual(g.results.map((r) => r.correct), [true, true, false]);
  assert.equal('zzz' in g.answers, false);
  // bo'sh / noto'g'ri turdagi javoblar
  assert.equal(grade(qs, null).correct, 0);
  assert.equal(grade(qs, { q1: 1, q2: ['b'], q3: { a: 1 } }).correct, 0);
  assert.equal(grade(qs, { q1: 'nope' }).correct, 0);
});

test('studentView: to‘g‘ri javob oshkor bo‘lmaydi', () => {
  const v = JSON.stringify(studentView(three));
  assert.equal(v.includes('correctId'), false);
});
