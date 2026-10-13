import { isInteractive, type Block, type InteractiveBlock, type LessonDoc, type Page } from './doc.schema';

/**
 * O'quvchi ko'rinishi: to'g'ri javoblar va izohlar hujjatdan olib tashlanadi.
 * Javob faqat serverda tekshiriladi (checkAnswer).
 */
export type PlayerBlock =
  | Exclude<Block, InteractiveBlock>
  | (Omit<Extract<Block, { type: 'choice' }>, 'correctIds' | 'explanation'>)
  | (Omit<Extract<Block, { type: 'fillblank' }>, 'blanks' | 'explanation'> & { blanks: { id: string }[] });

export interface PlayerPage extends Omit<Page, 'blocks'> {
  blocks: PlayerBlock[];
}

export function projectBlock(b: Block): PlayerBlock {
  if (b.type === 'choice') {
    const { correctIds: _c, explanation: _e, ...rest } = b;
    return rest;
  }
  if (b.type === 'fillblank') {
    const { blanks, explanation: _e, ...rest } = b;
    return { ...rest, blanks: blanks.map((x) => ({ id: x.id })) };
  }
  return b;
}

export function projectPage(p: Page): PlayerPage {
  return { ...p, blocks: p.blocks.map(projectBlock) };
}

export interface AnswerResult {
  correct: boolean;
  /** fillblank: har bo'sh joy bo'yicha */
  blanks?: Record<string, boolean>;
  explanation: string;
}

const norm = (s: string, caseSensitive: boolean) => {
  const t = s.normalize('NFKC').replace(/[ʻʼ‘’`´]/g, "'").replace(/\s+/g, ' ').trim();
  return caseSensitive ? t : t.toLowerCase();
};

/** Payload: choice → { selected: string[] }, fillblank → { values: Record<blankId, string> } */
export function checkAnswer(b: InteractiveBlock, payload: unknown): AnswerResult | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (b.type === 'choice') {
    if (!Array.isArray(p.selected) || !p.selected.every((x) => typeof x === 'string')) return null;
    const sel = new Set(p.selected as string[]);
    const valid = new Set(b.options.map((o) => o.id));
    if (sel.size === 0 || sel.size !== p.selected.length || [...sel].some((s) => !valid.has(s))) return null;
    if (!b.multiple && sel.size !== 1) return null;
    const correct = sel.size === b.correctIds.length && b.correctIds.every((c) => sel.has(c));
    return { correct, explanation: b.explanation };
  }
  const values = p.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const v = values as Record<string, unknown>;
  const blanks: Record<string, boolean> = {};
  for (const bl of b.blanks) {
    const given = v[bl.id];
    if (typeof given !== 'string' || given.length > 300) return null;
    blanks[bl.id] = bl.answers.some((a) => norm(a, bl.caseSensitive) === norm(given, bl.caseSensitive));
  }
  return { correct: Object.values(blanks).every(Boolean), blanks, explanation: b.explanation };
}

export interface AttemptState {
  /** Javob berilgan */
  answered: boolean;
  everCorrect: boolean;
}

export function pageSatisfied(page: Page, attempts: ReadonlyMap<string, AttemptState>): boolean {
  if (page.gate === 'free') return true;
  const inter = page.blocks.filter(isInteractive);
  return inter.every((b) => {
    const a = attempts.get(b.id);
    return page.gate === 'answered' ? !!a?.answered : !!a?.everCorrect;
  });
}

/**
 * Nechta sahifa ochiq: birinchi shartni bajarmagan sahifagacha (shu sahifa kiradi).
 * Keyingi sahifalar mazmuni mijozga umuman yuborilmaydi — gating aylanib o'tilmaydi.
 */
export function unlockedCount(doc: LessonDoc, attempts: ReadonlyMap<string, AttemptState>): { count: number; allDone: boolean } {
  for (let i = 0; i < doc.pages.length; i++) {
    if (!pageSatisfied(doc.pages[i], attempts)) return { count: i + 1, allDone: false };
  }
  return { count: doc.pages.length, allDone: true };
}

/**
 * Ko'rib chiqish progressi: haqiqatan ochib ko'rilgan sahifalar ulushi.
 * Ochiq sahifa (unlocked) ham, darsning tugallanishi ham bundan ALOHIDA tushuncha.
 * Joriy versiyada mavjud bo'lmagan (eski versiyaning) sahifa id'lari sanalmaydi.
 */
export function reviewProgress(doc: LessonDoc, visitedPageIds: readonly string[]): { total: number; seen: number; pct: number } {
  const ids = new Set(doc.pages.map((p) => p.id));
  const seen = new Set(visitedPageIds.filter((id) => ids.has(id))).size;
  const total = doc.pages.length;
  return { total, seen, pct: total ? Math.round((seen / total) * 100) : 0 };
}

/**
 * Majburiy topshiriqlar: sharti bor (free emas) va interaktiv bloki bor sahifalar.
 * `done` — shulardan sharti bajarilganlari (pageSatisfied bilan bir xil qoida).
 */
export function requiredProgress(doc: LessonDoc, attempts: ReadonlyMap<string, AttemptState>): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const p of doc.pages) {
    if (p.gate === 'free' || !p.blocks.some(isInteractive)) continue;
    total++;
    if (pageSatisfied(p, attempts)) done++;
  }
  return { total, done };
}
