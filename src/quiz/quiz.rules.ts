/** Mavzu testi qoidalari (sof funksiyalar): tekshiruv, baholash, o'quvchiga ko'rinish. DB va HTTP yo'q. */

export interface QuizOption {
  id: string;
  text: string;
}
export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
  correctId: string;
}

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 30;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

export type ParseResult = { ok: true; questions: QuizQuestion[] } | { ok: false; error: string };

/** Ustoz yuborgan savollarni qat'iy tekshiradi va tozalangan ko'rinishini qaytaradi (ortiqcha maydonlar tashlanadi). */
export function parseQuestions(raw: unknown, opts: { forPublish?: boolean } = {}): ParseResult {
  if (!Array.isArray(raw)) return { ok: false, error: "Savollar ro'yxati noto'g'ri" };
  if (raw.length > MAX_QUESTIONS) return { ok: false, error: `Ko'pi bilan ${MAX_QUESTIONS} ta savol` };
  if (opts.forPublish && raw.length < MIN_QUESTIONS) return { ok: false, error: `Nashr uchun kamida ${MIN_QUESTIONS} ta savol kerak` };

  const out: QuizQuestion[] = [];
  const qIds = new Set<string>();
  for (const [i, q] of raw.entries()) {
    const n = i + 1;
    if (!isObj(q)) return { ok: false, error: `${n}-savol noto'g'ri` };
    const id = typeof q.id === 'string' && ID_RE.test(q.id) ? q.id : null;
    if (!id) return { ok: false, error: `${n}-savol identifikatori noto'g'ri` };
    if (qIds.has(id)) return { ok: false, error: `${n}-savol identifikatori takrorlangan` };
    qIds.add(id);
    const text = str(q.text, 500);
    if (!text) return { ok: false, error: `${n}-savol matni bo'sh yoki juda uzun` };
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      return { ok: false, error: `${n}-savolda 2 dan 6 gacha variant bo'lsin` };
    }
    const options: QuizOption[] = [];
    const oIds = new Set<string>();
    const oTexts = new Set<string>();
    for (const o of q.options) {
      if (!isObj(o)) return { ok: false, error: `${n}-savol varianti noto'g'ri` };
      const oid = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : null;
      const otext = str(o.text, 200);
      if (!oid || !otext) return { ok: false, error: `${n}-savol varianti bo'sh yoki noto'g'ri` };
      if (oIds.has(oid)) return { ok: false, error: `${n}-savolda variant identifikatori takrorlangan` };
      const key = otext.toLowerCase();
      if (oTexts.has(key)) return { ok: false, error: `${n}-savolda bir xil variantlar bor` };
      oIds.add(oid);
      oTexts.add(key);
      options.push({ id: oid, text: otext });
    }
    if (typeof q.correctId !== 'string' || !oIds.has(q.correctId)) return { ok: false, error: `${n}-savolda to'g'ri javob belgilanmagan` };
    out.push({ id, text, options, correctId: q.correctId });
  }
  return { ok: true, questions: out };
}

/** O'quvchiga: to'g'ri javobsiz ko'rinish. */
export const studentView = (qs: QuizQuestion[]) => qs.map((q) => ({ id: q.id, text: q.text, options: q.options.map((o) => ({ id: o.id, text: o.text })) }));

export interface GradeResult {
  correct: number;
  total: number;
  results: { questionId: string; correct: boolean }[];
  /** Saqlanadigan tozalangan javoblar (faqat mavjud savol/variantlar) */
  answers: Record<string, string>;
}

/**
 * Baholash faqat backend'da. Javob berilmagan, noma'lum savol/variant — noto'g'ri. Frontend yuborgan ball/foiz
 * hech qachon qabul qilinmaydi.
 */
export function grade(questions: QuizQuestion[], submitted: unknown): GradeResult {
  const src = isObj(submitted) ? submitted : {};
  let correct = 0;
  const answers: Record<string, string> = {};
  const results = questions.map((q) => {
    const a = src[q.id];
    const valid = typeof a === 'string' && q.options.some((o) => o.id === a);
    if (valid) answers[q.id] = a as string;
    const ok = valid && a === q.correctId;
    if (ok) correct++;
    return { questionId: q.id, correct: ok };
  });
  return { correct, total: questions.length, results, answers };
}
