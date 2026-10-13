import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  directionDeleteBlockers,
  learnersAtLevel,
  levelDeleteBlockers,
  levelReorderBlocker,
  nameKey,
  sameIdSet,
  slugify,
  topicDeleteBlockers,
  topicReorderBlocker,
  type LearnerState,
} from './catalog.rules';

test('learnersAtLevel: joriy daraja yoki ochilgan mavzu izi bor o‘quvchilar', () => {
  const states: LearnerState[] = [
    { currentLevelOrd: 1, frontier: {} },
    { currentLevelOrd: 2, frontier: { '1': 3, '2': 1 } },
    { currentLevelOrd: null, frontier: {} },
  ];
  assert.equal(learnersAtLevel(states, 1), 2); // 1-o‘quvchi joriy, 2-o‘quvchi frontier'da
  assert.equal(learnersAtLevel(states, 2), 1);
  assert.equal(learnersAtLevel(states, 3), 0);
});

test('directionDeleteBlockers: bo‘sh yo‘nalish o‘chadi, bog‘liq ma’lumot bloklaydi', () => {
  assert.deepEqual(directionDeleteBlockers({ levels: 0, learners: 0, placements: 0, questions: 0 }), []);
  const r = directionDeleteBlockers({ levels: 2, learners: 1, placements: 0, questions: 5 });
  assert.equal(r.length, 3);
  assert.match(r[0], /2 ta daraja/);
});

test('levelDeleteBlockers: faqat oxirgi, bo‘sh, o‘quvchisiz daraja', () => {
  assert.deepEqual(levelDeleteBlockers({ isLast: true, topics: 0, questions: 0, learnersAtLevel: 0 }), []);
  assert.equal(levelDeleteBlockers({ isLast: false, topics: 0, questions: 0, learnersAtLevel: 0 }).length, 1);
  assert.equal(levelDeleteBlockers({ isLast: true, topics: 3, questions: 2, learnersAtLevel: 4 }).length, 3);
});

test('topicDeleteBlockers: darslar, savollar, progress va daraja holati', () => {
  assert.deepEqual(topicDeleteBlockers({ lessons: 0, questions: 0, progress: 0, learnersAtLevel: 0 }), []);
  const r = topicDeleteBlockers({ lessons: 2, questions: 0, progress: 0, learnersAtLevel: 0 });
  assert.match(r[0], /2 ta dars/);
});

test('levelReorderBlocker: o‘quvchi yoki test natijasi bo‘lsa bloklanadi', () => {
  assert.equal(levelReorderBlocker({ levels: 3, learners: 0, placements: 0 }), null);
  assert.match(levelReorderBlocker({ levels: 1, learners: 0, placements: 0 })!, /kamida 2/);
  assert.match(levelReorderBlocker({ levels: 3, learners: 2, placements: 0 })!, /2 ta o'quvchi/);
  assert.match(levelReorderBlocker({ levels: 3, learners: 0, placements: 4 })!, /4 ta/);
});

test('topicReorderBlocker: progress yoki daraja izi bo‘lsa bloklanadi', () => {
  assert.equal(topicReorderBlocker({ topics: 4, progress: 0, learnersAtLevel: 0 }), null);
  assert.match(topicReorderBlocker({ topics: 4, progress: 1, learnersAtLevel: 0 })!, /progress/);
  assert.match(topicReorderBlocker({ topics: 4, progress: 0, learnersAtLevel: 3 })!, /3 ta o'quvchi/);
});

test('nameKey/slugify/sameIdSet', () => {
  assert.equal(nameKey("  O‘zbek  TILI "), "o'zbek tili");
  assert.equal(slugify('Tarix Fani'), 'tarix-fani');
  assert.equal(slugify('Ingliz tili (IELTS)!'), 'ingliz-tili-ielts');
  assert.equal(slugify('###'), 'yonalish');
  assert.equal(sameIdSet(['a', 'b'], ['b', 'a']), true);
  assert.equal(sameIdSet(['a', 'a'], ['a', 'b']), false);
  assert.equal(sameIdSet(['a'], ['a', 'b']), false);
});
