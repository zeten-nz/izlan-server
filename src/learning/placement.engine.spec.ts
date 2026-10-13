import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeClaimed, nextUnknownStep, pickDiverse, type Answer } from "./placement.engine";

test("CLAIMED natija chegaralari", () => {
  assert.deepEqual(judgeClaimed(0, 4, 6), { outcome: "RETEST_LOWER", resultOrd: 3 });
  assert.deepEqual(judgeClaimed(44, 4, 6), { outcome: "RETEST_LOWER", resultOrd: 3 });
  assert.deepEqual(judgeClaimed(45, 4, 6), { outcome: "START_ZERO", resultOrd: 4 });
  assert.deepEqual(judgeClaimed(74, 4, 6), { outcome: "START_ZERO", resultOrd: 4 });
  assert.deepEqual(judgeClaimed(75, 4, 6), { outcome: "REPEAT_OPEN", resultOrd: 4 });
  assert.deepEqual(judgeClaimed(89, 4, 6), { outcome: "REPEAT_OPEN", resultOrd: 4 });
  assert.deepEqual(judgeClaimed(90, 4, 6), { outcome: "ADVANCE", resultOrd: 5 });
  assert.deepEqual(judgeClaimed(100, 6, 6), { outcome: "MASTERED", resultOrd: 6 });
});

test("A1 da <45% pastga tushmaydi: A1 ni noldan boshlaydi", () => {
  assert.deepEqual(judgeClaimed(10, 1, 6), { outcome: "START_ZERO", resultOrd: 1 });
});

const ans = (levelOrd: number, correct: boolean): Answer => ({ questionId: `${levelOrd}-${Math.random()}`, choice: 0, correct, levelOrd });
const all = () => true;

test("UNKNOWN: A1 dan boshlanadi", () => {
  assert.deepEqual(nextUnknownStep([], 6, all), { type: "ask", levelOrd: 1 });
});

test("UNKNOWN: A1 da yiqilsa, jami 10 tagacha savol beriladi, so'ng A1", () => {
  let answers = Array.from({ length: 5 }, (_, i) => ans(1, i < 2)); // 40%
  assert.deepEqual(nextUnknownStep(answers, 6, all), { type: "ask", levelOrd: 1 });
  answers = [...answers, ...Array.from({ length: 5 }, () => ans(1, false))];
  assert.deepEqual(nextUnknownStep(answers, 6, all), { type: "done", resultOrd: 1 });
});

test("UNKNOWN: A1 a'lo, A2 yiqildi → A2", () => {
  const answers = [...Array.from({ length: 5 }, () => ans(1, true)), ...Array.from({ length: 5 }, (_, i) => ans(2, i === 0))];
  assert.deepEqual(nextUnknownStep(answers, 6, all), { type: "done", resultOrd: 2 });
});

test("UNKNOWN: hammasi to'g'ri → eng yuqori daraja, jami 30 tadan oshmaydi", () => {
  const answers = Array.from({ length: 6 }, (_, l) => Array.from({ length: 5 }, () => ans(l + 1, true))).flat();
  assert.equal(answers.length, 30);
  assert.deepEqual(nextUnknownStep(answers, 6, all), { type: "done", resultOrd: 6 });
});

test("UNKNOWN: 4/5 = 80% o'tadi, 3/5 = 60% yiqiladi", () => {
  const pass = [...Array.from({ length: 5 }, (_, i) => ans(1, i < 4)), ...Array.from({ length: 5 }, () => ans(2, false))];
  assert.deepEqual(nextUnknownStep(pass, 6, all), { type: "done", resultOrd: 2 });
  const fail = [...Array.from({ length: 5 }, (_, i) => ans(1, i < 3)), ...Array.from({ length: 5 }, () => ans(1, false))];
  assert.deepEqual(nextUnknownStep(fail, 6, all), { type: "done", resultOrd: 1 });
});

test("pickDiverse: qoidalar bo'yicha xilma-xil", () => {
  const pool = ["a", "a", "a", "b", "b", "b", "c", "c", "c"].map((ruleId, i) => ({ ruleId, i }));
  const picked = pickDiverse(pool, 6);
  assert.equal(picked.length, 6);
  for (const r of ["a", "b", "c"]) assert.equal(picked.filter((p) => p.ruleId === r).length, 2);
});
