import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDoc, publishIssues, type LessonDoc } from './doc.schema';
import { checkAnswer, projectPage, requiredProgress, unlockedCount, type AttemptState } from './player';

const frame = { x: 10, y: 10, w: 400, h: 120, z: 0 };

function sampleDoc(): LessonDoc {
  const r = parseDoc({
    schemaVersion: 1,
    pages: [
      { id: 'p1', gate: 'free', blocks: [{ id: 'h1', type: 'heading', text: 'Present Simple', ...frame }] },
      {
        id: 'p2',
        gate: 'correct',
        blocks: [
          {
            id: 'q1', type: 'choice', question: 'She ___ tea', multiple: false, explanation: 'He/she/it + s',
            options: [{ id: 'a', text: 'drink' }, { id: 'b', text: 'drinks' }], correctIds: ['b'], ...frame,
          },
          {
            id: 'f1', type: 'fillblank', template: 'I [[1]] a student', explanation: '',
            blanks: [{ id: '1', answers: ['am'], caseSensitive: false }], ...frame,
          },
        ],
      },
      { id: 'p3', gate: 'free', blocks: [{ id: 't1', type: 'text', text: 'Done', ...frame }] },
    ],
  });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.doc;
}

test('parseDoc: noto‘g‘ri tur va takroriy ID rad etiladi', () => {
  assert.equal(parseDoc({ schemaVersion: 1, pages: [] }).ok, false);
  assert.equal(parseDoc({ schemaVersion: 1, pages: [{ id: 'p1', blocks: [{ id: 'x', type: 'iframe', ...frame }] }] }).ok, false);
  const dup = parseDoc({
    schemaVersion: 1,
    pages: [{ id: 'p1', blocks: [{ id: 'a', type: 'text', text: 'x', ...frame }, { id: 'a', type: 'text', text: 'y', ...frame }] }],
  });
  assert.equal(dup.ok, false);
  const oob = parseDoc({ schemaVersion: 1, pages: [{ id: 'p1', blocks: [{ id: 'a', type: 'text', text: 'x', ...frame, x: 5000 }] }] });
  assert.equal(oob.ok, false);
});

test('publishIssues: to‘g‘ri hujjat toza, xatolar topiladi', () => {
  assert.deepEqual(publishIssues(sampleDoc()), []);
  const bad = sampleDoc();
  const q = bad.pages[1].blocks[0];
  if (q.type === 'choice') q.correctIds = ['zzz'];
  const f = bad.pages[1].blocks[1];
  if (f.type === 'fillblank') f.template = 'no blank here';
  bad.pages[0].blocks = [];
  assert.equal(publishIssues(bad).length, 3);
});

test('projectPage: to‘g‘ri javoblar va izohlar mijozga chiqmaydi', () => {
  const json = JSON.stringify(projectPage(sampleDoc().pages[1]));
  assert.ok(!json.includes('correctIds'));
  assert.ok(!json.includes('explanation'));
  assert.ok(!json.includes('"answers"'));
  assert.ok(json.includes('"blanks":[{"id":"1"}]'));
});

test('checkAnswer: choice va fillblank', () => {
  const [q, f] = sampleDoc().pages[1].blocks as [any, any];
  assert.equal(checkAnswer(q, { selected: ['b'] })?.correct, true);
  assert.equal(checkAnswer(q, { selected: ['a'] })?.correct, false);
  assert.equal(checkAnswer(q, { selected: ['a', 'b'] }), null); // bitta javobli savolda ko‘p tanlov
  assert.equal(checkAnswer(q, { selected: ['nope'] }), null);
  assert.equal(checkAnswer(f, { values: { '1': '  AM ' } })?.correct, true);
  assert.equal(checkAnswer(f, { values: { '1': 'is' } })?.correct, false);
  assert.equal(checkAnswer(f, { values: {} }), null);
});

test('unlockedCount: shart bajarilmaguncha keyingi sahifa ochilmaydi', () => {
  const doc = sampleDoc();
  const m = new Map<string, AttemptState>();
  assert.deepEqual(unlockedCount(doc, m), { count: 2, allDone: false });
  m.set('q1', { answered: true, everCorrect: false });
  m.set('f1', { answered: true, everCorrect: true });
  assert.deepEqual(unlockedCount(doc, m), { count: 2, allDone: false }); // gate=correct, q1 xato
  m.set('q1', { answered: true, everCorrect: true });
  assert.deepEqual(unlockedCount(doc, m), { count: 3, allDone: true });
});

test('reviewProgress: 8 dan 6 sahifa ko‘rilgan = 75%, bu tugatish emas; eski versiya id’lari sanalmaydi', async () => {
  const { reviewProgress, requiredProgress } = await import('./player');
  const pages = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, gate: 'free' as const, blocks: [{ id: `t${i + 1}`, type: 'text' as const, text: 'x', ...frame }] }));
  const r = parseDoc({ schemaVersion: 1, pages });
  assert.ok(r.ok);
  if (!r.ok) return;
  const seen = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'oldVersionPage'];
  assert.deepEqual(reviewProgress(r.doc, seen), { total: 8, seen: 6, pct: 75 });
  assert.equal(reviewProgress(r.doc, []).pct, 0);
  // Majburiy topshiriq yo‘q — ko‘rilgan sahifalar uning o‘rnini bosmaydi
  assert.deepEqual(requiredProgress(r.doc, new Map()), { total: 0, done: 0 });
});

test('requiredProgress: faqat sharti bor va interaktiv bloki bor sahifalar sanaladi', () => {
  const doc = sampleDoc();
  assert.deepEqual(requiredProgress(doc, new Map()), { total: 1, done: 0 });
  const attempts = new Map<string, AttemptState>([
    ['q1', { answered: true, everCorrect: true }],
    ['f1', { answered: true, everCorrect: true }],
  ]);
  assert.deepEqual(requiredProgress(doc, attempts), { total: 1, done: 1 });
});
