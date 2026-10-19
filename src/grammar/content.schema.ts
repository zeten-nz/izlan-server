import { createHash } from 'node:crypto';
import { z } from 'zod';
import { lintMdxBody, MAX_BODY_CHARS } from './mdx-lint';
import { canonicalize } from './registry';
import { hasAnyScript, stripStress } from './text';

/**
 * Qoida kontenti (GrammarRevision.content). Server — YAGONA hokim: mijoz yuborgan hech narsaga (status, muallif, hash) ishonilmaydi.
 * Tuzilish client/src/lib/grammar/schema.ts dagi tarjima frontmatter'i bilan mos (paritet testi bor), lekin
 * workflow maydonlari (status, review, author) kontentda emas, revision ustunlarida.
 */
export const CONTENT_SCHEMA_VERSION = 1;

const text = (max: number) => z.string().trim().min(1).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'sana YYYY-MM-DD bo‘lishi kerak');
const ruleId = z.string().regex(/^gr_[a-z]{2,3}_\d{6}$/);
const KANA_READING = /^[ぁ-ゖァ-ヺー]+$/;

export const rubySegmentSchema = z
  .object({ base: text(40), reading: z.string().max(40).regex(KANA_READING, 'reading faqat hiragana/katakana').optional() })
  .strict();
const rubyText = z.array(rubySegmentSchema).min(1).max(80);

export const exampleSchema = z
  .object({
    text: text(300),
    translation: text(300),
    note: text(300).optional(),
    reading: text(300).optional(),
    stressed: text(300).optional(),
    ruby: rubyText.optional(),
    romanization: text(300).optional(),
  })
  .strict();

export const LICENSE_REVIEW = ['UNRESOLVED', 'ALLOWED', 'BLOCKED'] as const;
export const sourceSchema = z
  .object({
    title: text(160),
    url: z.string().max(300).regex(/^https:\/\/\S+$/, 'url https:// bilan boshlanishi kerak').optional(),
    author: text(120).optional(),
    license: text(80).optional(),
    attribution: text(300).optional(),
    retrievedAt: isoDate.optional(),
    /** CC BY-SA kabi ShareAlike talabi bor manba */
    shareAlike: z.boolean().default(false),
    licenseReview: z
      .object({ status: z.enum(LICENSE_REVIEW), by: text(80).optional(), at: isoDate.optional(), note: text(300).optional() })
      .strict()
      .optional(),
  })
  .strict();

const tableBlock = z
  .object({
    kind: z.literal('table'),
    caption: text(120).optional(),
    headers: z.array(text(80)).min(1).max(8),
    rows: z.array(z.array(text(200)).min(1).max(8)).min(1).max(60),
  })
  .strict();
const conjugationBlock = z
  .object({
    kind: z.literal('conjugation'),
    caption: text(120).optional(),
    forms: z
      .array(z.object({ label: text(80), value: text(120), reading: text(120).optional(), ruby: rubyText.optional() }).strict())
      .min(1)
      .max(40),
  })
  .strict();
export const CASE_IDS = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'] as const;
const declensionBlock = z
  .object({
    kind: z.literal('declension'),
    caption: text(120).optional(),
    word: text(60).optional(),
    gender: z.enum(['m', 'f', 'n']).optional(),
    rows: z
      .array(
        z
          .object({ case: text(60), caseId: z.enum(CASE_IDS).optional(), singular: text(120), plural: text(120), note: text(200).optional() })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
const blockSchema = z.discriminatedUnion('kind', [tableBlock, conjugationBlock, declensionBlock]);

export const contentSchema = z
  .object({
    title: text(120),
    summary: z.string().trim().max(400).default(''),
    formulas: z.array(z.object({ label: text(80), pattern: text(200), note: text(300).optional() }).strict()).max(12).default([]),
    examples: z.array(exampleSchema).max(40).default([]),
    exceptions: z.array(z.object({ title: text(120), body: text(600) }).strict()).max(20).default([]),
    commonMistakes: z
      .array(z.object({ wrong: text(200), right: text(200), explanation: text(400) }).strict())
      .max(20)
      .default([]),
    blocks: z.array(blockSchema).max(12).default([]),
    keywords: z.array(text(60)).max(20).default([]),
    sources: z.array(sourceSchema).max(10).default([]),
    related: z.array(ruleId).max(20).default([]),
    body: z.string().max(MAX_BODY_CHARS).default(''),
  })
  .strict();
export type GrammarContent = z.infer<typeof contentSchema>;

export interface ContentIssue {
  path: string;
  message: string;
}

export function parseContent(input: unknown): { ok: true; content: GrammarContent } | { ok: false; issues: ContentIssue[] } {
  const r = contentSchema.safeParse(input);
  if (r.success) return { ok: true, content: r.data };
  return { ok: false, issues: r.error.issues.slice(0, 25).map((i) => ({ path: i.path.join('.'), message: i.message })) };
}

/** Kontent xeshi (versiya + kanonik kontent). */
export function contentHash(content: GrammarContent): string {
  return createHash('sha256').update(canonicalize({ v: CONTENT_SCHEMA_VERSION, content })).digest('hex').slice(0, 32);
}

export interface LanguageRules {
  scripts: readonly string[];
  blocks: readonly string[];
}

/** Til bo'yicha mazmuniy tekshiruv: yozuv, urg'u/furigana ruxsati, blok turi, ruby/urg'u mosligi, markdown lint. */
export function languageIssues(c: GrammarContent, lang: LanguageRules): ContentIssue[] {
  const out: ContentIssue[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  const allowsRuby = lang.scripts.includes('Jpan');
  const allowsStress = lang.scripts.includes('Cyrl');

  c.examples.forEach((e, i) => {
    if (!hasAnyScript(e.text, lang.scripts)) add(`examples.${i}.text`, `til yozuvi (${lang.scripts.join('/')}) topilmadi`);
    if (e.stressed !== undefined) {
      if (!allowsStress) add(`examples.${i}.stressed`, 'bu tilda urg‘u belgisi ruxsat etilmagan');
      else if (stripStress(e.stressed) !== e.text.normalize('NFC')) add(`examples.${i}.stressed`, 'urg‘usiz holda text bilan bir xil bo‘lishi kerak');
    }
    if (e.ruby !== undefined) {
      if (!allowsRuby) add(`examples.${i}.ruby`, 'bu tilda furigana ruxsat etilmagan');
      else if (e.ruby.map((s) => s.base).join('') !== e.text) add(`examples.${i}.ruby`, 'segmentlar birlashganda text ga teng bo‘lishi kerak');
    }
  });
  c.blocks.forEach((b, i) => {
    if (!lang.blocks.includes(b.kind)) add(`blocks.${i}`, `'${b.kind}' bloki bu tilda ruxsat etilmagan`);
    if (b.kind === 'table') {
      b.rows.forEach((row, r) => {
        if (row.length !== b.headers.length) add(`blocks.${i}.rows.${r}`, `ustunlar soni sarlavhadagidek bo‘lishi kerak (${b.headers.length})`);
      });
    }
    if (b.kind === 'conjugation' && !allowsRuby && b.forms.some((f) => f.ruby)) add(`blocks.${i}`, 'bu tilda furigana ruxsat etilmagan');
    if (b.kind === 'declension') {
      const seen = new Set<string>();
      b.rows.forEach((r, ri) => {
        if (!r.caseId) return;
        if (seen.has(r.caseId)) add(`blocks.${i}.rows.${ri}.caseId`, `kelishik takrorlangan: ${r.caseId}`);
        seen.add(r.caseId);
      });
    }
  });
  for (const m of lintMdxBody(c.body)) add('body', m);
  return out;
}

/** Tekshiruvga yuborish (DRAFT → IN_REVIEW) uchun to'liqlik. */
export function completenessIssues(c: GrammarContent, provenance: string): ContentIssue[] {
  const out: ContentIssue[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  if (!c.summary.trim()) add('summary', 'qisqa tavsif (summary) majburiy');
  if (c.examples.length < 2) add('examples', 'kamida 2 ta misol kerak');
  if (c.sources.length < 1) add('sources', 'kamida bitta manba kerak (o‘zingiz yozgan bo‘lsangiz: "original" litsenziyali manba)');
  c.sources.forEach((s, i) => {
    if (!s.license) add(`sources.${i}.license`, 'litsenziya ko‘rsatilishi shart');
  });
  if (provenance === 'UNKNOWN') add('provenance', 'kontent kelib chiqishi (provenance) belgilanishi shart');
  return out;
}

/** Release darvozasi uchun litsenziya/provenance tekshiruvi (ADR §9). */
export function releaseLicenseIssues(c: GrammarContent, provenance: string): ContentIssue[] {
  const out: ContentIssue[] = [];
  if (provenance === 'UNKNOWN') out.push({ path: 'provenance', message: 'provenance noma‘lum (UNKNOWN)' });
  c.sources.forEach((s, i) => {
    const external = s.shareAlike || provenance === 'EXTERNAL' || provenance === 'MIXED';
    const st = s.licenseReview?.status;
    if (s.licenseReview?.status === 'BLOCKED') out.push({ path: `sources.${i}`, message: 'manba litsenziyasi BLOCKED' });
    else if ((s.shareAlike || (external && s.license && !/^(original|CC0|public domain)/i.test(s.license))) && st !== 'ALLOWED') {
      out.push({ path: `sources.${i}`, message: 'tashqi/ShareAlike manba: litsenziya tekshiruvi ALLOWED emas (huquqiy qaror kerak)' });
    }
  });
  return out;
}
