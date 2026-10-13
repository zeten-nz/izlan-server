import { z } from 'zod';

/**
 * Dars hujjati (LessonVersion.doc). Sahifa = 1600x900 mantiqiy sahna; bloklar shu sahnada x,y,w,h bilan joylashadi.
 * Ustoz faqat tipli JSON yozadi: HTML/iframe yo'q. Matn maydonlari oddiy matn (ro'yxat "- ", qalin **...**).
 */
export const STAGE_W = 1600;
export const STAGE_H = 900;
export const DOC_SCHEMA_VERSION = 1;

export const LIMITS = { pages: 60, blocksPerPage: 40, options: 6, blanks: 12, text: 4000, short: 300 } as const;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const text = (max: number = LIMITS.text) => z.string().max(max);
const short = text(LIMITS.short);

const frame = {
  id,
  x: z.number().min(0).max(STAGE_W),
  y: z.number().min(0).max(STAGE_H),
  w: z.number().min(20).max(STAGE_W),
  h: z.number().min(20).max(STAGE_H),
  z: z.number().int().min(0).max(1000).default(0),
};

const align = z.enum(['left', 'center', 'right']).default('left');

export const headingBlock = z.object({
  ...frame,
  type: z.literal('heading'),
  text: short,
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  align,
});

export const textBlock = z.object({ ...frame, type: z.literal('text'), text: text(), align });

export const calloutBlock = z.object({
  ...frame,
  type: z.literal('callout'),
  text: text(),
  tone: z.enum(['info', 'warning', 'success']).default('info'),
});

export const imageBlock = z.object({
  ...frame,
  type: z.literal('image'),
  assetId: z.string().uuid().nullable().default(null),
  alt: short.default(''),
  fit: z.enum(['contain', 'cover']).default('contain'),
});

export const audioBlock = z.object({
  ...frame,
  type: z.literal('audio'),
  assetId: z.string().uuid().nullable().default(null),
  caption: short.default(''),
  transcript: text().default(''),
});

const option = z.object({ id, text: short });

export const choiceBlock = z.object({
  ...frame,
  type: z.literal('choice'),
  question: text(1000),
  options: z.array(option).min(2).max(LIMITS.options),
  correctIds: z.array(id).max(LIMITS.options),
  /// true = bir nechta javob belgilanadi
  multiple: z.boolean().default(false),
  explanation: text(1000).default(''),
});

const blank = z.object({
  id,
  /// Qabul qilinadigan javoblar (kamida bittasi)
  answers: z.array(short).max(10),
  caseSensitive: z.boolean().default(false),
});

export const fillBlankBlock = z.object({
  ...frame,
  type: z.literal('fillblank'),
  /// Bo'sh joylar `[[id]]` bilan belgilanadi
  template: text(1500),
  blanks: z.array(blank).max(LIMITS.blanks),
  explanation: text(1000).default(''),
});

export const blockSchema = z.discriminatedUnion('type', [
  headingBlock,
  textBlock,
  calloutBlock,
  imageBlock,
  audioBlock,
  choiceBlock,
  fillBlankBlock,
]);

export const pageSchema = z.object({
  id,
  title: short.default(''),
  /// O'tish sharti: free = erkin; answered = interaktiv bloklarga javob berilishi; correct = to'g'ri javob berilishi
  gate: z.enum(['free', 'answered', 'correct']).default('free'),
  blocks: z.array(blockSchema).max(LIMITS.blocksPerPage),
});

export const docSchema = z.object({
  schemaVersion: z.literal(DOC_SCHEMA_VERSION),
  pages: z.array(pageSchema).min(1).max(LIMITS.pages),
});

export type Block = z.infer<typeof blockSchema>;
export type Page = z.infer<typeof pageSchema>;
export type LessonDoc = z.infer<typeof docSchema>;
export type InteractiveBlock = Extract<Block, { type: 'choice' | 'fillblank' }>;

export const isInteractive = (b: Block): b is InteractiveBlock => b.type === 'choice' || b.type === 'fillblank';

export const BLANK_RE = /\[\[([A-Za-z0-9_-]{1,40})\]\]/g;

export function emptyDoc(): LessonDoc {
  return { schemaVersion: DOC_SCHEMA_VERSION, pages: [{ id: 'p1', title: '', gate: 'free', blocks: [] }] };
}

export interface DocIssue {
  path: string;
  message: string;
}

/** Tuzilish bo'yicha tekshiruv (qoralama saqlash uchun yetarli). */
export function parseDoc(input: unknown): { ok: true; doc: LessonDoc } | { ok: false; issues: DocIssue[] } {
  const r = docSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, issues: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
  const issues = uniquenessIssues(r.data);
  return issues.length ? { ok: false, issues } : { ok: true, doc: r.data };
}

/** ID'lar lessonda yagona bo'lishi shart (javoblar blockId bo'yicha saqlanadi). */
function uniquenessIssues(doc: LessonDoc): DocIssue[] {
  const issues: DocIssue[] = [];
  const pageIds = new Set<string>();
  const blockIds = new Set<string>();
  doc.pages.forEach((p, pi) => {
    if (pageIds.has(p.id)) issues.push({ path: `pages.${pi}.id`, message: 'Sahifa ID takrorlangan' });
    pageIds.add(p.id);
    p.blocks.forEach((b, bi) => {
      if (blockIds.has(b.id)) issues.push({ path: `pages.${pi}.blocks.${bi}.id`, message: 'Blok ID takrorlangan' });
      blockIds.add(b.id);
    });
  });
  return issues;
}

/** Nashrdan oldingi mazmuniy tekshiruv (ustoz tuzatishi uchun o'zbekcha xabarlar). */
export function publishIssues(doc: LessonDoc): DocIssue[] {
  const issues: DocIssue[] = [];
  doc.pages.forEach((p, pi) => {
    const at = (bi: number) => `pages.${pi}.blocks.${bi}`;
    const label = `${pi + 1}-sahifa`;
    if (p.blocks.length === 0) issues.push({ path: `pages.${pi}`, message: `${label} bo'sh` });
    const interactive = p.blocks.filter(isInteractive).length;
    if (p.gate !== 'free' && interactive === 0) {
      issues.push({ path: `pages.${pi}.gate`, message: `${label}: o'tish sharti bor, lekin savol bloki yo'q` });
    }
    p.blocks.forEach((b, bi) => {
      if (b.type === 'choice') {
        const ids = new Set(b.options.map((o) => o.id));
        if (ids.size !== b.options.length) issues.push({ path: at(bi), message: `${label}: variant ID'lari takrorlangan` });
        if (!b.question.trim()) issues.push({ path: at(bi), message: `${label}: savol matni bo'sh` });
        if (b.options.some((o) => !o.text.trim())) issues.push({ path: at(bi), message: `${label}: bo'sh variant bor` });
        if (b.correctIds.some((c) => !ids.has(c))) issues.push({ path: at(bi), message: `${label}: to'g'ri javob variantlar orasida yo'q` });
        if (new Set(b.correctIds).size !== b.correctIds.length) issues.push({ path: at(bi), message: `${label}: to'g'ri javoblar takrorlangan` });
        if (!b.multiple && b.correctIds.length !== 1) issues.push({ path: at(bi), message: `${label}: bitta javobli savolda aynan bitta to'g'ri javob bo'lishi kerak` });
        if (b.multiple && b.correctIds.length < 1) issues.push({ path: at(bi), message: `${label}: to'g'ri javob belgilanmagan` });
      } else if (b.type === 'fillblank') {
        const inTemplate = [...b.template.matchAll(BLANK_RE)].map((m) => m[1]);
        const declared = new Set(b.blanks.map((x) => x.id));
        if (declared.size !== b.blanks.length) issues.push({ path: at(bi), message: `${label}: bo'sh joy ID'lari takrorlangan` });
        if (new Set(inTemplate).size !== inTemplate.length) issues.push({ path: at(bi), message: `${label}: shablonda bir bo'sh joy ikki marta` });
        if (inTemplate.some((t) => !declared.has(t)) || [...declared].some((d) => !inTemplate.includes(d))) {
          issues.push({ path: at(bi), message: `${label}: shablon va bo'sh joylar mos emas` });
        }
        if (b.blanks.length === 0) issues.push({ path: at(bi), message: `${label}: kamida bitta bo'sh joy kerak` });
        if (b.blanks.some((x) => x.answers.length === 0 || x.answers.some((a) => !a.trim()))) {
          issues.push({ path: at(bi), message: `${label}: bo'sh joyning to'g'ri javobi yozilmagan` });
        }
      } else if (b.type === 'image' || b.type === 'audio') {
        if (!b.assetId) issues.push({ path: at(bi), message: `${label}: ${b.type === 'image' ? 'rasm' : 'audio'} tanlanmagan` });
        else if (b.type === 'image' && !b.alt.trim()) issues.push({ path: at(bi), message: `${label}: rasmga tavsif (alt) yozing` });
      } else if (b.type === 'heading' || b.type === 'text' || b.type === 'callout') {
        if (!b.text.trim()) issues.push({ path: at(bi), message: `${label}: bo'sh matn bloki` });
      }
    });
  });
  return issues;
}
