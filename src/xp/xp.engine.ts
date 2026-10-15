import { ACTIVE_XP_POLICY, type XpPolicy } from './xp.policy';

/** Sana kaliti (YYYY-MM-DD) siyosat vaqt zonasi bo'yicha. */
export function dayKey(at: Date, policy: XpPolicy = ACTIVE_XP_POLICY): string {
  // en-CA: YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: policy.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Mavzuning kundagi tartibiga (1,2,3...) mos koeffitsiyent (bazis punkt). */
export function multiplierBp(ord: number, policy: XpPolicy = ACTIVE_XP_POLICY): number {
  const t = policy.topicDayMultiplierBp;
  return t[Math.min(Math.max(ord, 1), t.length) - 1];
}

/**
 * Yaxlitlash: mavzu/kun kesimidagi YIG'MA bazaviy XP ustida floor(cum * bp / 10000); hodisaga tegishli qism —
 * yig'ma natijalarning ayirmasi. Shu tufayli kichik bonuslarni bo'laklab yaxlitlashdan foyda olib bo'lmaydi
 * (yig'indi hech qachon floor(umumiy * koeffitsiyent) dan oshmaydi) va natija hodisalar tartibiga bog'liq emas.
 */
export function grantedFor(cumBaseBefore: number, base: number, bp: number): number {
  const after = Math.floor(((cumBaseBefore + base) * bp) / 10_000);
  const before = Math.floor((cumBaseBefore * bp) / 10_000);
  return after - before;
}

/** Test natijasi: qaysi bo'sag'alar bajarilgan (butun son solishtirish, yaxlitlashsiz). */
export function quizTiersReached(correct: number, total: number, policy: XpPolicy = ACTIVE_XP_POLICY): number[] {
  if (total <= 0) return [];
  return policy.quizTiers.filter((t) => correct * 100 >= t.minPct * total).map((t) => t.minPct);
}

export const scorePct = (correct: number, total: number): number => (total > 0 ? Math.floor((correct * 100) / total) : 0);

export interface LevelInfo {
  level: number;
  title: string;
  minTotalXp: number;
  nextLevel: number | null;
  nextTitle: string | null;
  nextMinTotalXp: number | null;
  /** Joriy daraja ichidagi progress (0..100); oxirgi darajada 100 */
  progressPct: number;
  xpToNext: number;
  isMax: boolean;
}

/** Daraja jami XP (kamaymaydigan `totalXpEarned`) bo'yicha hisoblanadi. */
export function levelFor(totalXp: number, policy: XpPolicy = ACTIVE_XP_POLICY): LevelInfo {
  const total = Math.max(0, Math.floor(totalXp));
  const ls = policy.levels;
  let idx = 0;
  for (let i = 0; i < ls.length; i++) if (total >= ls[i].minTotalXp) idx = i;
  const cur = ls[idx];
  const next = ls[idx + 1] ?? null;
  const span = next ? next.minTotalXp - cur.minTotalXp : 0;
  return {
    level: idx + 1,
    title: cur.title,
    minTotalXp: cur.minTotalXp,
    nextLevel: next ? idx + 2 : null,
    nextTitle: next?.title ?? null,
    nextMinTotalXp: next?.minTotalXp ?? null,
    progressPct: next ? Math.min(100, Math.floor(((total - cur.minTotalXp) * 100) / span)) : 100,
    xpToNext: next ? next.minTotalXp - total : 0,
    isMax: !next,
  };
}
