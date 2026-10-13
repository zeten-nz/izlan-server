import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDoc, type Block } from '../lessons/doc.schema';
import { normKey, plainQuestion, projectLessonMistake, sentenceAround, tidy, tidyBlock } from './notebook.util';

const frame = { x: 10, y: 10, w: 400, h: 120, z: 0 };

function blocks(): { choice: Block; fill: Block } {
  const r = parseDoc({
    schemaVersion: 1,
    pages: [
      {
        id: 'p1',
        gate: 'correct',
        blocks: [
          {
            id: 'q1', type: 'choice', question: 'She ___ tea', multiple: false, explanation: 'He/she/it + s',
            options: [{ id: 'a', text: 'drink' }, { id: 'b', text: 'drinks' }], correctIds: ['b'], ...frame,
          },
          {
            id: 'f1', type: 'fillblank', template: 'I [[1]] a student and she [[2]] tea', explanation: 'to be',
            blanks: [
              { id: '1', answers: ['am'], caseSensitive: false },
              { id: '2', answers: ['drinks'], caseSensitive: false },
            ],
            ...frame,
          },
        ],
      },
    ],
  });
  assert.ok(r.ok);
  return { choice: r.doc.pages[0].blocks[0], fill: r.doc.pages[0].blocks[1] };
}

test('normKey: registr, apostrof va bo‘shliqlar birxillashtiriladi', () => {
  assert.equal(normKey('  Already '), 'already');
  assert.equal(normKey("O‘zbek   TILI"), "o'zbek tili");
  assert.equal(normKey("o`zbek"), normKey("oʻzbek"));
  assert.equal(tidy('  a   b \n c '), 'a b c');
  assert.equal(tidyBlock('  x\r\ny  '), 'x\ny');
});

test('sentenceAround: so‘z joylashgan gapni topadi, topilmasa bo‘sh', () => {
  const text = 'We study. I have already finished my homework. Then I sleep.';
  assert.equal(sentenceAround(text, 'already'), 'I have already finished my homework.');
  assert.equal(sentenceAround(text, 'missing'), '');
  assert.equal(sentenceAround('x '.repeat(400), 'x', 50), '');
});

test('projectLessonMistake: hal bo‘lmagan xatoda to‘g‘ri javob oshkor bo‘lmaydi', () => {
  const { choice, fill } = blocks();
  const c = projectLessonMistake(choice, { selected: ['a'] }, false)!;
  assert.equal(c.kind, 'choice');
  assert.ok(c.options!.every((o) => !('correct' in o)), "unresolved'da correct belgisi bo‘lmasligi kerak");
  assert.equal(c.options!.find((o) => o.id === 'a')!.chosen, true);

  const f = projectLessonMistake(fill, { values: { '1': 'is', '2': 'drinks' } }, false)!;
  assert.ok(f.blanks!.every((b) => !('answers' in b)), "unresolved'da bo‘sh joy javoblari bo‘lmasligi kerak");
  assert.equal(f.blanks!.find((b) => b.id === '1')!.ok, false);
  assert.equal(f.blanks!.find((b) => b.id === '2')!.ok, true);
  assert.ok(!JSON.stringify(f).includes('"am"'));
});

test('projectLessonMistake: keyin to‘g‘ri bajarilgan blokda javob ochiladi', () => {
  const { choice, fill } = blocks();
  const c = projectLessonMistake(choice, { selected: ['b'] }, true)!;
  assert.equal(c.options!.find((o) => o.id === 'b')!.correct, true);
  assert.equal(c.options!.find((o) => o.id === 'a')!.correct, false);
  const f = projectLessonMistake(fill, { values: { '1': 'am', '2': 'drinks' } }, true)!;
  assert.deepEqual(f.blanks!.find((b) => b.id === '1')!.answers, ['am']);
  assert.equal(plainQuestion(f), 'I _____ a student and she _____ tea');
});

test('projectLessonMistake: buzuq javob (response) xavfsiz ishlanadi', () => {
  const { choice, fill } = blocks();
  assert.doesNotThrow(() => projectLessonMistake(choice, null, false));
  assert.doesNotThrow(() => projectLessonMistake(fill, { values: 5 }, false));
  assert.equal(projectLessonMistake(choice, { selected: 'a' }, false)!.options!.every((o) => !o.chosen), true);
});
