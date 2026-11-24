/**
 * Daraja aniqlash mantiqi: faqat sof funksiyalar (bazaga tegmaydi), shuning uchun osongina test qilinadi.
 *
 * "Darajani kiritish" (CLAIMED): tanlangan daraja bo'yicha test; natija foiziga qarab:
 *   <45   → bir daraja pastdan qayta test (A1 bo'lsa: A1 ni noldan boshlash)
 *   45-74 → shu darajani noldan boshlash
 *   75-89 → shu darajani takrorlash (hamma darslar ochiq)
 *   >=90  → keyingi darajaga o'tish
 * "Darajamni bilmayman" (UNKNOWN): A1 dan boshlab pog'ona-pog'ona; pog'onada <75% bo'lsa shu daraja.
 *   Har pog'onada STEP_SIZE ta savol; natija chegaraga yaqin (CONFIRM_LOW..CONFIRM_HIGH) bo'lsa yana CONFIRM_EXTRA ta
 *   (tasodifiy xato/taxmin natijani buzmasligi uchun). Simulyatsiya (2026-11-24): 5 talik pog'ona + min 10 ga nisbatan
 *   aniq joylashuv 41–74% → 66–91%, yuqoriga adashish 11–31% → 6–17% (placement.engine.spec.ts).
 */

/** CLAIMED: daraja bankidan beriladigan savollar soni (bank kichik bo'lsa — borini) */
export const CLAIMED_SIZE = 20;
/** UNKNOWN: har pog'onaning dastlabki savollari */
export const STEP_SIZE = 8;
/** UNKNOWN: chegaraviy natijada qo'shimcha tasdiq savollari */
export const CONFIRM_EXTRA = 4;
export const CONFIRM_LOW = 50;
export const CONFIRM_HIGH = 87;
/** UNKNOWN: umumiy chegara — undan keyin tasdiq so'ralmaydi, mavjud javoblar bilan hukm qilinadi */
export const MAX_UNKNOWN_QUESTIONS = 60;
export const PASS_PCT = 75;

export type Answer = { questionId: string; choice: number; correct: boolean; levelOrd: number };

export type Outcome = "RETEST_LOWER" | "START_ZERO" | "REPEAT_OPEN" | "ADVANCE" | "MASTERED" | "PLACED";

export type Verdict = { outcome: Outcome; resultOrd: number };

export const pct = (correct: number, total: number) => (total === 0 ? 0 : Math.round((correct / total) * 100));

/** CLAIMED rejimi: savollar soni — CLAIMED_SIZE (bank kichik bo'lsa, borini beramiz). */
export function claimedTestSize(poolSize: number): number {
  return Math.min(CLAIMED_SIZE, poolSize);
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
 * Qoida: har daraja uchun STEP_SIZE ta savol; natija CONFIRM_LOW..CONFIRM_HIGH oralig'ida bo'lsa yana CONFIRM_EXTRA ta.
 * >= PASS_PCT — keyingi darajaga; aks holda — shu daraja foydalanuvchi darajasi.
 */
export function nextUnknownStep(answers: Answer[], maxOrd: number, available: (levelOrd: number) => boolean): UnknownStep {
  const capped = answers.length >= MAX_UNKNOWN_QUESTIONS;
  for (let ord = 1; ord <= maxOrd; ord++) {
    const inLevel = answers.filter((a) => a.levelOrd === ord);
    if (inLevel.length < STEP_SIZE && !capped) {
      if (available(ord)) return { type: "ask", levelOrd: ord };
      if (inLevel.length === 0) return { type: "done", resultOrd: Math.max(1, ord - 1) };
    }
    if (inLevel.length === 0) return { type: "done", resultOrd: Math.max(1, ord - 1) };
    const score = pct(inLevel.filter((a) => a.correct).length, inLevel.length);
    const borderline = score >= CONFIRM_LOW && score <= CONFIRM_HIGH;
    if (borderline && !capped && inLevel.length < STEP_SIZE + CONFIRM_EXTRA && available(ord)) return { type: "ask", levelOrd: ord };
    if (score >= PASS_PCT) continue;
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

/** UNKNOWN: pog'onada hali so'ralmagan qoidadan savol (bo'lmasa — eng kam so'ralgan qoidadan). */
export function pickNextDiverse<T extends { ruleId: string }>(pool: T[], askedRuleIds: string[], rand: () => number = Math.random): T | null {
  if (pool.length === 0) return null;
  const seen = new Map<string, number>();
  for (const r of askedRuleIds) seen.set(r, (seen.get(r) ?? 0) + 1);
  const min = Math.min(...pool.map((q) => seen.get(q.ruleId) ?? 0));
  const best = pool.filter((q) => (seen.get(q.ruleId) ?? 0) === min);
  return best[Math.floor(rand() * best.length)] ?? null;
}
