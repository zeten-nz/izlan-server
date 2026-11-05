import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Grammatika qoidalari reyestri (server tomoni). Manba: client repo'dagi kontent (`content/grammar`),
 * u yerda `npm run grammar:export-registry` bilan generatsiya qilinadi va `grammar-registry.data.ts` ga yoziladi.
 *
 * Server faqat shu reyestrga ishonadi: dars hujjatidagi qoida nomi/holati/tili hech qachon ishonchli emas,
 * hujjatda faqat doimiy `grammarRuleId` saqlanadi.
 */
export const REGISTRY_SCHEMA_VERSION = 1;
export const RULE_ID_RE = /^gr_[a-z]{2,3}_\d{6}$/;

const ruleId = z.string().regex(RULE_ID_RE);

const registrySchema = z
  .object({
    schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
    version: z.string().regex(/^[0-9a-f]{16}$/),
    languages: z.array(
      z.object({ code: z.string().regex(/^[a-z]{2,3}$/), name: z.string().min(1).max(40), enabled: z.boolean() }).strict(),
    ),
    rules: z.array(
      z
        .object({
          id: ruleId,
          lang: z.string().regex(/^[a-z]{2,3}$/),
          slug: z.string().min(1).max(60),
          category: z.string().min(1).max(60),
          level: z
            .object({ system: z.enum(['cefr', 'jlpt']), value: z.string(), confirmed: z.boolean().optional() })
            .strict()
            .optional(),
          status: z.enum(['approved', 'review', 'draft']),
          /** Faqat approved qoida uchun (tushuntirish tilidagi sarlavha). */
          title: z.string().min(1).max(200).nullable(),
        })
        .strict(),
    ),
    retired: z.array(z.object({ id: ruleId, replacedBy: ruleId.nullable() }).strict()),
  })
  .strict();

export type GrammarRegistryData = z.infer<typeof registrySchema>;
export type RegistryRule = GrammarRegistryData['rules'][number];

/** Kalitlar tartiblangan, probelsiz JSON: client generatori bilan bir xil (versiya shundan hisoblanadi). */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Versiya = reyestr mazmunining SHA-256 qisqa xeshi (versiya maydonining o'zi hisobga olinmaydi). */
export function computeVersion(data: Omit<GrammarRegistryData, 'version'>): string {
  const { schemaVersion, languages, rules, retired } = data;
  return createHash('sha256').update(canonicalize({ schemaVersion, languages, rules, retired })).digest('hex').slice(0, 16);
}

export type RegistryLoad = { ok: true; registry: GrammarRegistry } | { ok: false; reason: string };

/** Reyestrni tekshirib yuklaydi: sxema, mantiqiy butunlik va xesh. Buzilgan bo'lsa ishlatilmaydi (fail closed). */
export function loadRegistry(raw: unknown): RegistryLoad {
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `sxema noto'g'ri: ${parsed.error.issues[0]?.message ?? '?'}` };
  const d = parsed.data;
  if (computeVersion(d) !== d.version) return { ok: false, reason: "xesh mos kelmadi (reyestr o'zgartirilgan yoki buzilgan)" };

  const ids = new Set<string>();
  for (const r of d.rules) {
    if (ids.has(r.id)) return { ok: false, reason: `ID takrorlangan: ${r.id}` };
    ids.add(r.id);
    if (!r.id.startsWith(`gr_${r.lang}_`)) return { ok: false, reason: `ID tili mos emas: ${r.id}` };
    if (r.status === 'approved' && !r.title) return { ok: false, reason: `approved qoidada sarlavha yo'q: ${r.id}` };
  }
  const retiredIds = new Set<string>();
  for (const t of d.retired) {
    if (ids.has(t.id)) return { ok: false, reason: `ID ham jonli, ham nafaqada: ${t.id}` };
    if (retiredIds.has(t.id)) return { ok: false, reason: `nafaqa ID takrorlangan: ${t.id}` };
    retiredIds.add(t.id);
  }
  for (const t of d.retired) {
    if (t.replacedBy && !ids.has(t.replacedBy)) return { ok: false, reason: `replacedBy topilmadi: ${t.replacedBy}` };
  }
  return { ok: true, registry: new GrammarRegistry(d) };
}

export type RuleLookup =
  | { state: 'available'; rule: RegistryRule & { title: string }; langName: string }
  | { state: 'unapproved'; rule: RegistryRule }
  | { state: 'language-disabled'; rule: RegistryRule }
  | { state: 'retired'; replacedBy: string | null }
  | { state: 'unknown' };

export type PlayerRule =
  | { available: false }
  | { available: true; id: string; lang: string; langName: string; title: string };

export class GrammarRegistry {
  private readonly byId = new Map<string, RegistryRule>();
  private readonly retired = new Map<string, string | null>();
  private readonly langs = new Map<string, { name: string; enabled: boolean }>();

  constructor(readonly data: GrammarRegistryData) {
    for (const r of data.rules) this.byId.set(r.id, r);
    for (const t of data.retired) this.retired.set(t.id, t.replacedBy);
    for (const l of data.languages) this.langs.set(l.code, { name: l.name, enabled: l.enabled });
  }

  get version(): string {
    return this.data.version;
  }

  /** Bitta qoidaning holati (nashr tekshiruvi va o'quvchiga ko'rsatish uchun yagona manba). */
  lookup(id: string): RuleLookup {
    const rule = this.byId.get(id);
    if (rule) {
      if (rule.status !== 'approved' || !rule.title) return { state: 'unapproved', rule };
      const lang = this.langs.get(rule.lang);
      if (!lang?.enabled) return { state: 'language-disabled', rule };
      return { state: 'available', rule: { ...rule, title: rule.title }, langName: lang.name };
    }
    if (this.retired.has(id)) return { state: 'retired', replacedBy: this.retired.get(id) ?? null };
    return { state: 'unknown' };
  }

  /** O'quvchi ko'rinishi: nafaqaga chiqarilgan qoida almashtiruvchisiga yo'naltiriladi (agar u mavjud va ochiq bo'lsa). */
  resolveForPlayer(id: string): PlayerRule {
    let cur = this.lookup(id);
    if (cur.state === 'retired' && cur.replacedBy) cur = this.lookup(cur.replacedBy);
    if (cur.state !== 'available') return { available: false };
    return { available: true, id: cur.rule.id, lang: cur.rule.lang, langName: cur.langName, title: cur.rule.title };
  }

  /** Ustoz tanlashi mumkin bo'lgan qoidalar: faqat approved va faol til. */
  listSelectable() {
    const out: {
      id: string;
      lang: string;
      langName: string;
      title: string;
      category: string;
      level?: { system: string; value: string; confirmed: boolean };
    }[] = [];
    for (const r of this.data.rules) {
      const l = this.lookup(r.id);
      if (l.state !== 'available') continue;
      out.push({
        id: r.id,
        lang: r.lang,
        langName: l.langName,
        title: l.rule.title,
        category: r.category,
        ...(r.level ? { level: { system: r.level.system, value: r.level.value, confirmed: r.level.confirmed === true } } : {}),
      });
    }
    return out.sort((a, b) => a.langName.localeCompare(b.langName) || a.title.localeCompare(b.title));
  }
}
