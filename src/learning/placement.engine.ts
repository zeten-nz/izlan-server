/**
 * Daraja aniqlash mantiqi: faqat sof funksiyalar (bazaga tegmaydi), shuning uchun osongina test qilinadi.
 *
 * "Darajani kiritish" (CLAIMED): tanlangan daraja bo'yicha test; natija foiziga qarab:
 *   <45   → bir daraja pastdan qayta test (A1 bo'lsa: A1 ni noldan boshlash)
 *   45-74 → shu darajani noldan boshlash
 *   75-89 → shu darajani takrorlash (hamma darslar ochiq)
 *   >=90  → keyingi darajaga o'tish
 * "Darajamni bilmayman" (UNKNOWN): A1 dan boshlab pog'ona-pog'ona; pog'onada <75% bo'lsa shu daraja.
 */

export const MIN_QUESTIONS = 10;
export const MAX_QUESTIONS = 30;
/** UNKNOWN rejimida har bir daraja uchun dastlabki savollar soni (6 daraja × 5 = 30 = MAX) */
export const STEP_SIZE = 5;
export const PASS_PCT = 75;

export type Answer = { questionId: string; choice: number; correct: boolean; levelOrd: number };

export type Outcome = "RETEST_LOWER" | "START_ZERO" | "REPEAT_OPEN" | "ADVANCE" | "MASTERED" | "PLACED";

export type Verdict = { outcome: Outcome; resultOrd: number };

export const pct = (correct: number, total: number) => (total === 0 ? 0 : Math.round((correct / total) * 100));

/** CLAIMED rejimi: savollar soni — daraja bankiga qarab 10..30 (bank kichik bo'lsa, borini beramiz). */
export function claimedTestSize(poolSize: number): number {
  return Math.min(MAX_QUESTIONS, poolSize);
}

export function judgeClaimed(scorePct: number, claimedOrd: number, maxOrd: number): Verdict {
  if (scorePct < 45) {
    return claimedOrd > 1 ? { outcome: "RETEST_LOWER", resultOrd: claimedOrd - 1 } : { outcome: "START_ZERO", resultOrd: 1 };
  }
  if (scorePct < PASS_PCT) return { outcome: "START_ZERO", resultOrd: claimedOrd };
  if (scorePct < 90) return { outcome: "REPEAT_OPEN", resultOrd: claimedOrd };
  return claimedOrd < maxOrd ? { outcome: "ADVANCE", resultOrd: claimedOrd + 1 } : { outcome: "MASTERED", resultOrd: maxOrd };
}

export type UnknownStep = { type: "ask"; levelOrd: number } | { type: "done"; resultOrd: number };

/**
 * UNKNOWN rejimida keyingi harakat. `available(levelOrd)` — shu darajada hali berilmagan savollar bormi.
 * Qoida: har daraja uchun STEP_SIZE ta savol; pog'onada <75% bo'lsa va jami savol MIN dan kam bo'lsa,
 * shu darajadan yana beriladi (jami kamida 10 ta); yiqilgan pog'ona — foydalanuvchi darajasi.
 */
export function nextUnknownStep(answers: Answer[], maxOrd: number, available: (levelOrd: number) => boolean): UnknownStep {
  for (let ord = 1; ord <= maxOrd; ord++) {
    const inLevel = answers.filter((a) => a.levelOrd === ord);
    if (inLevel.length < STEP_SIZE) {
      if (available(ord)) return { type: "ask", levelOrd: ord };
      if (inLevel.length === 0) return { type: "done", resultOrd: Math.max(1, ord - 1) };
    }
    const score = pct(inLevel.filter((a) => a.correct).length, inLevel.length);
    if (score >= PASS_PCT) continue;
    if (answers.length < MIN_QUESTIONS && available(ord)) return { type: "ask", levelOrd: ord };
    return { type: "done", resultOrd: ord };
  }
  return { type: "done", resultOrd: maxOrd };
}

/** Savollar xilma-xil qoidalardan bo'lsin: qoida bo'yicha navbatma-navbat (round-robin) tanlash. */
export function pickDiverse<T extends { ruleId: string }>(pool: T[], count: number, rand: () => number = Math.random): T[] {
  const shuffled = [...pool].sort(() => rand() - 0.5);
  const byRule = new Map<string, T[]>();
  for (const q of shuffled) byRule.set(q.ruleId, [...(byRule.get(q.ruleId) ?? []), q]);
  const queues = [...byRule.values()].sort(() => rand() - 0.5);
  const out: T[] = [];
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      const item = q.shift();
      if (item && out.length < count) out.push(item);
    }
  }
  return out.sort(() => rand() - 0.5);
}
