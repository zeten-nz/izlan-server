import { BLANK_RE, type Block, type InteractiveBlock } from '../lessons/doc.schema';
import { checkAnswer } from '../lessons/player';

/** Qidirish va takrorni aniqlash kaliti: NFKC, kichik harf, apostrof turlari va bo'shliqlar birxillashtiriladi. */
export function normKey(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Ko'rinadigan matn: chekka bo'shliqlar olib tashlanadi, ichki takroriy bo'shliq bittaga keltiriladi. */
export function tidy(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Ko'p qatorli matn (eslatma/izoh): qatorlar saqlanadi, chekkalar tozalanadi. */
export function tidyBlock(s: string | undefined | null): string {
  return (s ?? '').replace(/\r\n/g, '\n').trim();
}

export interface LessonMistakeCore {
  kind: 'choice' | 'fillblank';
  /** choice: savol; fillblank: shablon (bo'sh joylar `[[id]]`) */
  question: string;
  options?: Array<{ id: string; text: string; chosen: boolean; correct?: boolean }>;
  blanks?: Array<{ id: string; given: string; ok: boolean | null; answers?: string[] }>;
  explanation: string;
}

/**
 * Darsdagi xato bloki kartasi. To'g'ri javob (variant/bo'sh joy javoblari) FAQAT o'quvchi shu blokni keyin
 * to'g'ri bajargan bo'lsa (`resolved`) ochiladi: aks holda Daftar darsdagi baholashni aylanib o'tish yo'li bo'lib qolardi.
 * Izoh esa o'quvchi har javobdan keyin player'da baribir ko'radi (AnswerResult.explanation).
 */
export function projectLessonMistake(block: Block, response: unknown, resolved: boolean): LessonMistakeCore | null {
  if (block.type === 'choice') {
    const sel = new Set(Array.isArray((response as { selected?: unknown })?.selected) ? ((response as { selected: unknown[] }).selected.filter((x) => typeof x === 'string') as string[]) : []);
    return {
      kind: 'choice',
      question: block.question,
      options: block.options.map((o) => ({
        id: o.id,
        text: o.text,
        chosen: sel.has(o.id),
        ...(resolved ? { correct: block.correctIds.includes(o.id) } : {}),
      })),
      explanation: block.explanation,
    };
  }
  if (block.type === 'fillblank') {
    const values = ((response as { values?: unknown })?.values ?? {}) as Record<string, unknown>;
    const graded = checkAnswer(block as InteractiveBlock, response);
    return {
      kind: 'fillblank',
      question: block.template,
      blanks: block.blanks.map((b) => ({
        id: b.id,
        given: typeof values[b.id] === 'string' ? (values[b.id] as string) : '',
        ok: graded ? (graded.blanks?.[b.id] ?? null) : null,
        ...(resolved ? { answers: b.answers } : {}),
      })),
      explanation: block.explanation,
    };
  }
  return null;
}

/** Shablondagi `[[id]]` bo'sh joylarini "_____" ga almashtiradi (ro'yxat uchun qisqa matn). */
export function plainQuestion(core: LessonMistakeCore): string {
  return core.kind === 'fillblank' ? core.question.replace(BLANK_RE, '_____') : core.question;
}

/**
 * Tanlangan so'z/ibora joylashgan gapni topadi (Lug'atdagi "misol gap" uchun taklif).
 * Topilmasa bo'sh qaytadi — taxmin qilinmaydi.
 */
export function sentenceAround(text: string, selected: string, max = 300): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const s = selected.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const at = t.toLowerCase().indexOf(s.toLowerCase());
  if (at < 0) return '';
  const isEnd = (c: string) => c === '.' || c === '!' || c === '?' || c === '…';
  let from = at;
  while (from > 0 && !isEnd(t[from - 1])) from--;
  let to = at + s.length;
  while (to < t.length && !isEnd(t[to - 1])) to++;
  const out = t.slice(from, to).trim();
  return out.length <= max ? out : '';
}
