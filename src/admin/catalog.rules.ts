/**
 * Admin katalog qoidalari (sof funksiyalar). Daraja va mavzuning `ord` qiymati o'quvchi holatining kaliti:
 * `UserDirection.currentLevelOrd`, `topicFrontier {levelOrd: topicOrd}` va placement natijalari shunga bog'langan.
 * Shuning uchun tartibni o'zgartirish va o'chirish faqat o'quvchi izi yo'qligi isbotlansa ruxsat etiladi.
 */

/** 6 daraja: `StartPlacementDto @Max(6)` va "6 × 5 = 30" savol cheklovi (placement.engine.ts). Keyingi bosqich: 6 dan ortiq. */
export const MAX_LEVELS = 6;

export interface LearnerState {
  currentLevelOrd: number | null;
  /** `topicFrontier`: { "<levelOrd>": <topicOrd> } */
  frontier: Record<string, number>;
}

/** Shu darajada izi bor o'quvchilar: joriy daraja yoki ochilgan mavzu (frontier) yozuvi. */
export function learnersAtLevel(states: readonly LearnerState[], levelOrd: number): number {
  const key = String(levelOrd);
  return states.filter((s) => s.currentLevelOrd === levelOrd || s.frontier[key] !== undefined).length;
}

const plural = (n: number, one: string) => `${n} ta ${one}`;

export function directionDeleteBlockers(f: { levels: number; learners: number; placements: number; questions: number }): string[] {
  const r: string[] = [];
  if (f.levels > 0) r.push(`Yo'nalishda ${plural(f.levels, 'daraja')} bor. Avval darajalarni o'chiring.`);
  if (f.learners > 0) r.push(`Yo'nalishni ${plural(f.learners, "o'quvchi")} tanlagan.`);
  if (f.placements > 0) r.push(`Yo'nalish bo'yicha ${plural(f.placements, 'daraja aniqlash testi')} natijasi saqlangan.`);
  if (f.questions > 0) r.push(`Yo'nalishda ${plural(f.questions, 'test savoli')} bor.`);
  return r;
}

export function levelDeleteBlockers(f: { isLast: boolean; topics: number; questions: number; learnersAtLevel: number }): string[] {
  const r: string[] = [];
  if (!f.isLast) r.push("Faqat oxirgi darajani o'chirish mumkin: boshqa darajalarning tartib raqami o'quvchilar holatiga bog'langan.");
  if (f.topics > 0) r.push(`Darajada ${plural(f.topics, 'mavzu')} bor. Avval mavzularni o'chiring.`);
  if (f.questions > 0) r.push(`Darajada ${plural(f.questions, 'test savoli')} bor.`);
  if (f.learnersAtLevel > 0) r.push(`Bu darajada ${plural(f.learnersAtLevel, "o'quvchi")} bor yoki shu darajadagi mavzularni ochgan.`);
  return r;
}

export function topicDeleteBlockers(f: { lessons: number; questions: number; progress: number; learnersAtLevel: number }): string[] {
  const r: string[] = [];
  if (f.lessons > 0) r.push(`Mavzuda ${plural(f.lessons, 'dars')} bor. Darslar avtomatik o'chirilmaydi.`);
  if (f.questions > 0) r.push(`Mavzuda ${plural(f.questions, 'test savoli')} bor.`);
  if (f.progress > 0) r.push(`Mavzudagi darslar bo'yicha ${plural(f.progress, "o'quvchi progressi")} saqlangan.`);
  if (f.learnersAtLevel > 0) r.push(`Shu darajada ${plural(f.learnersAtLevel, "o'quvchi")} bor: mavzu tartibi ularning holatiga bog'langan.`);
  return r;
}

/** Darajalar tartibi: yo'nalishni birorta o'quvchi tanlagan yoki test natijasi bo'lsa bloklanadi. */
export function levelReorderBlocker(f: { levels: number; learners: number; placements: number }): string | null {
  if (f.levels < 2) return 'Tartiblash uchun kamida 2 ta daraja kerak.';
  if (f.learners > 0) {
    return `Yo'nalishni ${plural(f.learners, "o'quvchi")} tanlagan: darajalar tartibi ularning joriy darajasiga bog'langan, o'zgartirib bo'lmaydi.`;
  }
  if (f.placements > 0) return `Daraja aniqlash testi natijalari (${f.placements} ta) saqlangan: tartibni o'zgartirib bo'lmaydi.`;
  return null;
}

/** Mavzular tartibi: shu darajada o'quvchi izi (progress, joriy daraja, ochilgan mavzu) bo'lmasa ruxsat. */
export function topicReorderBlocker(f: { topics: number; progress: number; learnersAtLevel: number }): string | null {
  if (f.topics < 2) return 'Tartiblash uchun kamida 2 ta mavzu kerak.';
  if (f.progress > 0) return `Mavzudagi darslar bo'yicha ${plural(f.progress, "o'quvchi progressi")} bor: tartibni o'zgartirib bo'lmaydi.`;
  if (f.learnersAtLevel > 0) {
    return `Shu darajada ${plural(f.learnersAtLevel, "o'quvchi")} bor yoki mavzu ochgan: tartib ularning holatiga bog'langan.`;
  }
  return null;
}

/** Nomni solishtirish uchun: kichik harf, apostrof turlari va ortiqcha bo'shliqlar birxillashtiriladi. */
export function nameKey(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** URL uchun qisqa nom (yo'nalish slug'i). Bo'sh chiqsa `fallback`. */
export function slugify(s: string, fallback = 'yonalish'): string {
  const base = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻʼ‘’`´']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || fallback;
}

/** Berilgan tartib mavjud to'plam bilan aynan bir xil (takror ham, ortiqcha ham, yetishmagani ham yo'q). */
export function sameIdSet(ids: readonly string[], current: readonly string[]): boolean {
  if (ids.length !== current.length) return false;
  const a = new Set(ids);
  return a.size === ids.length && current.every((c) => a.has(c));
}
