/**
 * Kurs (yo'nalish) narxi va kirish qoidalari — sof funksiyalar (testlanadi).
 *
 * - Yo'nalish narxi null yoki 0 bo'lsa — kurs bepul, hech qaysi mavzu yopilmaydi.
 * - Narx > 0 bo'lsa: har darajaning 1-mavzusi bepul (sinab ko'rish), qolganlari faqat faol obuna bilan.
 * - Xarid 30 kun qo'shadi: hali tugamagan muddat ustiga, tugagan bo'lsa hozirdan.
 */
export const ACCESS_DAYS = 30;
const DAY_MS = 86_400_000;

export function isPaidCourse(price: number | null | undefined): boolean {
  return typeof price === 'number' && price > 0;
}

/** Mavzu pullikmi (obunasiz yopiqmi)? Har darajaning 1-mavzusi har doim bepul. */
export function isPaywalledTopic(price: number | null | undefined, topicOrd: number): boolean {
  return isPaidCourse(price) && topicOrd > 1;
}

export function hasActiveAccess(endsAt: Date | null | undefined, now: Date): boolean {
  return !!endsAt && endsAt.getTime() > now.getTime();
}

/** Yangi tugash sanasi: faol bo'lsa endsAt + 30 kun, aks holda now + 30 kun. */
export function extendAccess(endsAt: Date | null | undefined, now: Date, days = ACCESS_DAYS): Date {
  const base = hasActiveAccess(endsAt, now) ? endsAt!.getTime() : now.getTime();
  return new Date(base + days * DAY_MS);
}

// ───────────── Saytdan to'ldirish: noyob summa (pay-bot allocator/matcher'dan ko'chirilgan) ─────────────

/** Bir martada to'ldirish chegaralari (so'm). Asosiy summa 1 000 ga karrali. */
export const TOPUP_MIN = 5_000;
export const TOPUP_MAX = 5_000_000;
export const BASE_STEP = 1_000;
/** Noyob qo'shimcha: 1..SUFFIX_MAX so'm (50 000 → 50 001 … 50 099). */
export const SUFFIX_MAX = 99;
export const TOPUP_RESERVE_MINUTES = 20;
/** Muddati o'tgandan keyin kelgan to'lov shu muddatgacha egasiga yoziladi (summa qayta berilmagan bo'lsa). */
export const TOPUP_LATE_GRACE_MS = 24 * 3_600_000;
/** Bildirishnoma soati va server soati orasidagi farqqa ruxsat. */
export const CLOCK_SKEW_MS = 2 * 60_000;

export type BaseCheck = { ok: true } | { ok: false; reason: 'NOT_INTEGER' | 'TOO_SMALL' | 'TOO_LARGE' | 'NOT_MULTIPLE' };

export function validateTopupBase(base: number): BaseCheck {
  if (!Number.isSafeInteger(base)) return { ok: false, reason: 'NOT_INTEGER' };
  if (base < TOPUP_MIN) return { ok: false, reason: 'TOO_SMALL' };
  if (base > TOPUP_MAX) return { ok: false, reason: 'TOO_LARGE' };
  if (base % BASE_STEP !== 0) return { ok: false, reason: 'NOT_MULTIPLE' };
  return { ok: true };
}

/**
 * Keyingi qo'shimchani tanlaydi: cursor+1 dan boshlab aylanma (… 98, 99, 1, 2 …).
 *  - busy: shu asosiy summada hozir PENDING — hech qachon berilmaydi;
 *  - quarantined: yaqinda muddati o'tgan/bekor qilingan, to'lanmagan — kechikkan to'lov egasini
 *    aniq topish uchun iloji boricha qayta berilmaydi (boshqa joy qolmasagina).
 * Hammasi band bo'lsa null.
 */
export function pickSuffix(cursor: number, busy: ReadonlySet<number>, quarantined: ReadonlySet<number>, max = SUFFIX_MAX): number | null {
  let fallback: number | null = null;
  const start = ((cursor % max) + max) % max;
  for (let i = 0; i < max; i++) {
    const s = ((start + i) % max) + 1;
    if (busy.has(s)) continue;
    if (!quarantined.has(s)) return s;
    if (fallback === null) fallback = s;
  }
  return fallback;
}

/** Kartaga tushgan summadan asosiy summa: oxirgi 1..99 olib tashlanadi; mos kelmasa to'liq summa. */
export function defaultCreditFor(amount: number, max = SUFFIX_MAX): number {
  const r = amount % BASE_STEP;
  return r >= 1 && r <= max ? amount - r : amount;
}

export type TopupStatusT = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
export interface TopupCandidate {
  id: string;
  userId: string;
  amount: number;
  baseAmount: number;
  status: TopupStatusT;
  createdAt: Date;
  expiresAt: Date;
}
export type ReviewReason = 'FRACTION' | 'NO_REQUEST' | 'ALREADY_PAID' | 'TOO_LATE' | 'CANCELLED';
export type MatchDecision =
  | { type: 'MATCH' | 'LATE_MATCH'; requestId: string; userId: string; credit: number }
  | { type: 'REVIEW'; reason: ReviewReason };

export const REVIEW_REASON_UZ: Record<ReviewReason, string> = {
  FRACTION: 'tiyinli summa (sayt butun summa beradi)',
  NO_REQUEST: "bu summaga so'rov yo'q — noto'g'ri summa o'tkazilgan bo'lishi mumkin",
  ALREADY_PAID: "bu so'rov allaqachon to'langan — takroriy o'tkazma",
  TOO_LATE: "muddat va kechikish muhlati o'tib ketgan",
  CANCELLED: "foydalanuvchi bu so'rovni bekor qilgan",
};

/**
 * Kirimni so'rovga moslash. Pul tushgan paytgacha shu summaga yaratilgan ENG OXIRGI so'rov hal qiladi:
 * summa muddat o'tgach boshqaga qayta berilgan bo'lsa — yangi egasiniki, eski egasining kechikkan to'loviga yo'l yo'q.
 */
export function decideMatch(income: { amount: number; hasFraction: boolean; receivedAt: Date }, candidates: TopupCandidate[], graceMs = TOPUP_LATE_GRACE_MS): MatchDecision {
  if (income.hasFraction) return { type: 'REVIEW', reason: 'FRACTION' };
  const t = income.receivedAt.getTime();
  const same = candidates
    .filter((c) => c.amount === income.amount && c.createdAt.getTime() <= t + CLOCK_SKEW_MS)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (same.length === 0) return { type: 'REVIEW', reason: 'NO_REQUEST' };
  const latest = same[0];
  const exp = latest.expiresAt.getTime();
  switch (latest.status) {
    case 'PENDING':
    case 'EXPIRED':
      if (latest.status === 'PENDING' && t <= exp + CLOCK_SKEW_MS) return { type: 'MATCH', requestId: latest.id, userId: latest.userId, credit: latest.baseAmount };
      if (t <= exp + graceMs) return { type: 'LATE_MATCH', requestId: latest.id, userId: latest.userId, credit: latest.baseAmount };
      return { type: 'REVIEW', reason: 'TOO_LATE' };
    case 'PAID':
      return { type: 'REVIEW', reason: 'ALREADY_PAID' };
    case 'CANCELLED':
      return { type: 'REVIEW', reason: 'CANCELLED' };
  }
}
