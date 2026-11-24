import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_UNKNOWN_QUESTIONS, STEP_SIZE, claimedTestSize, judgeClaimed, nextUnknownStep, pickDiverse, pickNextDiverse, type Answer } from "./placement.engine";

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

const many = (levelOrd: number, n: number, correctCount: number) => Array.from({ length: n }, (_, i) => ans(levelOrd, i < correctCount));

test("UNKNOWN: pog'onada STEP_SIZE (8) ta savol so'raladi", () => {
  assert.equal(STEP_SIZE, 8);
  assert.deepEqual(nextUnknownStep(many(1, 7, 7), 6, all), { type: "ask", levelOrd: 1 });
});

test("UNKNOWN: aniq yiqilish (<50%) — tasdiqsiz shu daraja", () => {
  assert.deepEqual(nextUnknownStep(many(1, 8, 3), 6, all), { type: "done", resultOrd: 1 });
});

test("UNKNOWN: aniq o'tish (>87%) — tasdiqsiz keyingi daraja", () => {
  assert.deepEqual(nextUnknownStep(many(1, 8, 8), 6, all), { type: "ask", levelOrd: 2 });
  assert.deepEqual(nextUnknownStep(many(1, 8, 7), 6, all), { type: "ask", levelOrd: 2 }, "7/8 = 88%");
});

test("UNKNOWN: chegaraviy natija (50..87%) — yana 4 ta tasdiq savoli, keyin 12 tasi bo'yicha hukm", () => {
  const six = many(1, 8, 6); // 75% — chegarada
  assert.deepEqual(nextUnknownStep(six, 6, all), { type: "ask", levelOrd: 1 });
  assert.deepEqual(nextUnknownStep([...six, ...many(1, 4, 3)], 6, all), { type: "ask", levelOrd: 2 }, "9/12 = 75% — o'tdi");
  assert.deepEqual(nextUnknownStep([...six, ...many(1, 4, 2)], 6, all), { type: "done", resultOrd: 1 }, "8/12 = 67% — yiqildi");
  const half = many(1, 8, 4); // 50% — chegarada, tasdiq
  assert.deepEqual(nextUnknownStep(half, 6, all), { type: "ask", levelOrd: 1 });
});

test("UNKNOWN: A1 a'lo, A2 yiqildi → A2", () => {
  assert.deepEqual(nextUnknownStep([...many(1, 8, 8), ...many(2, 8, 1)], 6, all), { type: "done", resultOrd: 2 });
});

test("UNKNOWN: hammasi to'g'ri → eng yuqori daraja (6 × 8 = 48 savol)", () => {
  const answers = Array.from({ length: 6 }, (_, l) => many(l + 1, 8, 8)).flat();
  assert.deepEqual(nextUnknownStep(answers, 6, all), { type: "done", resultOrd: 6 });
});

test("UNKNOWN: umumiy chegaradan keyin tasdiq so'ralmaydi", () => {
  // 5 ta pog'ona 12 tadan (60 ta) — keyingisida savol berilmaydi, mavjud javoblar bilan hukm
  const answers = Array.from({ length: 5 }, (_, l) => many(l + 1, 12, 10)).flat();
  assert.equal(answers.length, MAX_UNKNOWN_QUESTIONS);
  assert.deepEqual(nextUnknownStep(answers, 6, all), { type: "done", resultOrd: 5 });
});

test("UNKNOWN: bankda savol qolmasa — mavjud javoblar bilan hukm", () => {
  const none = (ord: number) => ord !== 2;
  assert.deepEqual(nextUnknownStep(many(1, 8, 8), 6, none), { type: "done", resultOrd: 1 });
});

test("CLAIMED: 20 ta savol (bank kichik bo'lsa — borini)", () => {
  assert.equal(claimedTestSize(30), 20);
  assert.equal(claimedTestSize(12), 12);
});

test("pickNextDiverse: pog'onada so'ralmagan qoida birinchi", () => {
  const pool = [{ ruleId: "a" }, { ruleId: "a" }, { ruleId: "b" }, { ruleId: "c" }];
  for (let i = 0; i < 50; i++) {
    assert.equal(pickNextDiverse(pool, ["a", "b"])?.ruleId, "c");
    assert.notEqual(pickNextDiverse(pool, ["a"])?.ruleId, "a");
  }
  assert.equal(pickNextDiverse([], ["a"]), null);
});

/** Simulyatsiya: haqiqiy darajasi ma'lum o'quvchi qayerga joylashadi (deterministik RNG). */
test("simulyatsiya: aniq joylashuv ≥ 65%, ±1 ichida ≥ 75%, yuqoriga adashish ≤ 20%", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const N = 3000;
  for (let mastered = 0; mastered <= 6; mastered++) {
    const expected = Math.min(6, mastered + 1);
    let exact = 0;
    let near = 0;
    let over = 0;
    for (let i = 0; i < N; i++) {
      const answers: Answer[] = [];
      let step = nextUnknownStep(answers, 6, all);
      while (step.type === "ask") {
        const ord = step.levelOrd;
        const p = ord <= mastered ? 0.85 : ord === mastered + 1 ? 0.5 : 0.3;
        answers.push(ans(ord, rand() < p));
        step = nextUnknownStep(answers, 6, all);
      }
      if (step.resultOrd === expected) exact++;
      if (Math.abs(step.resultOrd - expected) <= 1) near++;
      if (step.resultOrd > expected) over++;
    }
    assert.ok(exact / N >= 0.6, `mastered=${mastered}: aniq ${((100 * exact) / N).toFixed(0)}%`);
    assert.ok(near / N >= 0.7, `mastered=${mastered}: ±1 ${((100 * near) / N).toFixed(0)}%`);
    assert.ok(over / N <= 0.2, `mastered=${mastered}: yuqori ${((100 * over) / N).toFixed(0)}%`);
  }
});

test("pickDiverse: qoidalar bo'yicha xilma-xil", () => {
  const pool = ["a", "a", "a", "b", "b", "b", "c", "c", "c"].map((ruleId, i) => ({ ruleId, i }));
  const picked = pickDiverse(pool, 6);
  assert.equal(picked.length, 6);
  for (const r of ["a", "b", "c"]) assert.equal(picked.filter((p) => p.ruleId === r).length, 2);
});
