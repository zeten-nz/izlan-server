/**
 * Mavzu progressi va ochilishi (sof funksiyalar, DB'siz).
 *
 * Qoidalar:
 * - Mavzu tugagan: nashr qilingan darslari bor VA hammasi tugatilgan. Darsi yo'q mavzu tugagan emas.
 * - Ochilish "frontier" bilan: har daraja uchun ochilgan eng yuqori mavzu tartibi. U faqat OSHADI.
 *   Shuning uchun darsni nashrdan olish yoki mavzuga yangi dars qo'shish oldin ochilgan mavzuni qayta qulflamaydi.
 * - "N/M dars tugatildi" — o'zlashtirish foizi EMAS.
 */

export type TopicState = 'open' | 'current' | 'upcoming' | 'locked';
export type LevelAccess = 'SEQUENTIAL' | 'OPEN';

export interface TopicCounts {
  /** Nashr qilingan darslar soni */
  total: number;
  /** Shulardan o'quvchi tugatganlari (istalgan versiyada) */
  completed: number;
}

export const isTopicCompleted = (c: TopicCounts): boolean => c.total > 0 && c.completed >= c.total;

/** Kontent hali yo'q: o'quvchiga "Kontent tayyorlanmoqda" ko'rsatiladi, mavzu tugagan hisoblanmaydi. */
export const isContentPreparing = (c: TopicCounts): boolean => c.total === 0;

/** `UserDirection.topicFrontier` (Json) ni xavfsiz o'qiydi. */
export function parseFrontier(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) out[k] = v;
  }
  return out;
}

/**
 * Hosila frontier: 1-mavzudan boshlab, tugagan mavzuning keyingisini ochadi.
 * `topics` — shu darajaning mavzulari (ord bo'yicha tartiblangan).
 */
export function deriveFrontier(topics: ReadonlyArray<{ ord: number; counts: TopicCounts }>): number {
  if (topics.length === 0) return 1;
  const sorted = [...topics].sort((a, b) => a.ord - b.ord);
  const maxOrd = sorted[sorted.length - 1].ord;
  let frontier = sorted[0].ord;
  for (const t of sorted) {
    if (t.ord !== frontier) break;
    if (!isTopicCompleted(t.counts) || frontier >= maxOrd) break;
    frontier = nextOrd(sorted, frontier);
  }
  return frontier;
}

function nextOrd(sorted: ReadonlyArray<{ ord: number }>, ord: number): number {
  const next = sorted.find((t) => t.ord > ord);
  return next ? next.ord : ord;
}

/** Frontier faqat oshadi. */
export const mergeFrontier = (stored: number | undefined, derived: number): number => Math.max(stored ?? 1, derived);

/**
 * Mavzu holati. `frontier` yo'q (1) bo'lsa — avvalgi xulq bilan aynan bir xil.
 * Daraja holati (locked/done/current) placement bilan belgilanadi va o'zgarmaydi.
 */
export function topicStateOf(
  currentLevelOrd: number | null,
  access: LevelAccess,
  levelOrd: number,
  topicOrd: number,
  frontier: number,
): TopicState {
  if (currentLevelOrd === null || levelOrd > currentLevelOrd) return 'locked';
  if (levelOrd < currentLevelOrd) return 'open';
  if (topicOrd === frontier) return 'current';
  if (access === 'OPEN') return 'open';
  return topicOrd < frontier ? 'open' : 'upcoming';
}

// ───────────── Faollik (haqiqiy vaqt belgilaridan) ─────────────

/** Toshkent vaqti (UTC+5, yozgi vaqt yo'q): "faol kun" shu kalendar kuni bo'yicha. */
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
export const dayKey = (d: Date): string => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);

export interface ActivityDay {
  date: string;
  /** Shu kuni darsga oid hodisalar soni (javob, boshlash, tugatish) */
  events: number;
}

/**
 * Oxirgi `days` kunlik faollik va ketma-ket faol kunlar (streak: bugun yoki kecha tugaydigan zanjir).
 * Faqat berilgan vaqt belgilari sanaladi; boshqa taxmin yo'q.
 */
export function summarizeActivity(events: readonly Date[], now: Date, days = 28) {
  const perDay = new Map<string, number>();
  for (const e of events) perDay.set(dayKey(e), (perDay.get(dayKey(e)) ?? 0) + 1);
  const list: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(now.getTime() - i * 86_400_000));
    list.push({ date, events: perDay.get(date) ?? 0 });
  }
  let streak = 0;
  let cursor = new Date(now.getTime());
  if (!perDay.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - 86_400_000);
  while (perDay.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return {
    days: list,
    activeDays7: list.slice(-7).filter((d) => d.events > 0).length,
    activeDays28: list.filter((d) => d.events > 0).length,
    streak,
  };
}
