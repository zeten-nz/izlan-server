import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { CONTENT_SCHEMA_VERSION, contentHash, languageIssues, parseContent } from './content.schema';

/**
 * Git korpusi (client/content/grammar) → PostgreSQL import (bir martalik ko'chirish) va release → JSON arxiv eksporti.
 * Qoidalar: import HECH QACHON approve qilmaydi (hamma narsa DRAFT, provenance AI_DRAFT); idempotent (ruleId+explanationLang+contentHash);
 * mavjud qoidani ustidan yozmaydi; ID/slug aliaslar/retired/darslardagi grammarRuleId saqlanadi; hammasi bitta tranzaksiyada.
 */
export interface ImportReport {
  dryRun: boolean;
  source: string;
  languages: { code: string; action: 'create' | 'update' | 'same' }[];
  rules: { id: string; lang: string; slug: string; explanationLang: string; action: 'create' | 'skip-same' | 'skip-differs' | 'invalid'; issues?: string[] }[];
  aliases: { lang: string; slug: string; ruleId: string; action: 'create' | 'same' | 'conflict' }[];
  retired: { id: string; action: 'create' | 'same' }[];
  counters: Record<string, number>;
  ok: boolean;
}

type Json = Record<string, unknown>;
const readJson = async (p: string) => JSON.parse((await readFile(p, 'utf8')).replace(/^﻿/, '')) as Json;

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
export function parseMdx(source: string): { fm: Json; body: string } {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const m = FENCE.exec(text);
  if (!m) throw new Error("frontmatter bloki yo'q");
  return { fm: JSON.parse(m[1]) as Json, body: text.slice(m[0].length) };
}

const CONTENT_KEYS = ['title', 'summary', 'formulas', 'examples', 'exceptions', 'commonMistakes', 'blocks', 'keywords'] as const;

function toContent(fm: Json, body: string, related: unknown): unknown {
  const c: Json = {};
  for (const k of CONTENT_KEYS) if (fm[k] !== undefined) c[k] = fm[k];
  c.related = Array.isArray(related) ? related : [];
  c.sources = ((fm.sources as Json[] | undefined) ?? []).map((s) => ({
    title: s.title,
    ...(s.url ? { url: s.url } : {}),
    ...(s.license ? { license: s.license } : {}),
    ...(s.note ? { attribution: s.note } : {}),
  }));
  c.body = body.replace(/^\r?\n/, '').replace(/\s+$/, '') + '\n';
  return c;
}

export async function runImport(prisma: PrismaClient, dir: string, opts: { dryRun: boolean }): Promise<ImportReport> {
  const report: ImportReport = { dryRun: opts.dryRun, source: dir, languages: [], rules: [], aliases: [], retired: [], counters: {}, ok: true };
  if (!existsSync(join(dir, 'languages.json'))) throw new Error(`languages.json topilmadi: ${dir}`);
  const langFile = (await readJson(join(dir, 'languages.json'))) as { languages: Record<string, Json> };
  const redirects = (existsSync(join(dir, 'redirects.json')) ? await readJson(join(dir, 'redirects.json')) : {}) as { redirects?: Json[]; retired?: Json[] };

  type Plan = { id: string; lang: string; slug: string; category: string; level: Json | null; author: string | null; items: { explanationLang: string; content: unknown; hash: string }[] };
  const plans: Plan[] = [];
  for (const lang of Object.keys(langFile.languages)) {
    const ld = join(dir, lang);
    if (!existsSync(ld)) continue;
    for (const slugDir of (await readdir(ld, { withFileTypes: true })).filter((e) => e.isDirectory())) {
      const rd = join(ld, slugDir.name);
      const rule = await readJson(join(rd, 'rule.json'));
      const plan: Plan = { id: String(rule.id), lang, slug: String(rule.slug), category: String(rule.category), level: (rule.level as Json) ?? null, author: null, items: [] };
      for (const f of (await readdir(rd)).filter((n) => n.endsWith('.mdx'))) {
        const explanationLang = f.replace(/\.mdx$/, '');
        const { fm, body } = parseMdx(await readFile(join(rd, f), 'utf8'));
        const content = toContent(fm, body, rule.related);
        const lcfg = langFile.languages[lang] as { scripts: string[]; blocks: string[] };
        const p = parseContent(content);
        const issues = p.ok ? languageIssues(p.content, lcfg).map((i) => `${i.path}: ${i.message}`) : p.issues.map((i) => `${i.path}: ${i.message}`);
        if (typeof fm.author === 'string') plan.author = fm.author;
        if (issues.length || !p.ok) {
          report.rules.push({ id: plan.id, lang, slug: plan.slug, explanationLang, action: 'invalid', issues });
          report.ok = false;
          continue;
        }
        plan.items.push({ explanationLang, content: p.content, hash: contentHash(p.content) });
      }
      plans.push(plan);
    }
  }

  const apply = async (tx: Prisma.TransactionClient) => {
    // tillar
    for (const [code, l] of Object.entries(langFile.languages)) {
      const data = {
        name: String(l.name),
        nativeName: String(l.nativeName ?? l.name),
        dir: String(l.dir ?? 'ltr'),
        blocks: (l.blocks as string[]) ?? [],
        enabled: l.enabled === true,
        levelSystem: String(l.levelSystem ?? 'none'),
        scripts: (l.scripts as string[]) ?? [],
        categories: (l.categories ?? []) as Prisma.InputJsonValue,
      };
      const ex = await tx.grammarLanguage.findUnique({ where: { code } });
      const same = ex && JSON.stringify({ ...data, categories: data.categories }) === JSON.stringify({ name: ex.name, nativeName: ex.nativeName, dir: ex.dir, blocks: ex.blocks, enabled: ex.enabled, levelSystem: ex.levelSystem, scripts: ex.scripts, categories: ex.categories });
      report.languages.push({ code, action: !ex ? 'create' : same ? 'same' : 'update' });
      if (!opts.dryRun && !same) await tx.grammarLanguage.upsert({ where: { code }, create: { code, ...data }, update: data });
    }
    // qoidalar
    for (const p of plans) {
      let rule = await tx.grammarRule.findUnique({ where: { id: p.id } });
      for (const it of p.items) {
        const ex = rule ? await tx.grammarRevision.findFirst({ where: { ruleId: p.id, explanationLang: it.explanationLang, deletedAt: null }, orderBy: { revisionNo: 'desc' } }) : null;
        if (ex) {
          const hasSame = await tx.grammarRevision.findFirst({ where: { ruleId: p.id, explanationLang: it.explanationLang, contentHash: it.hash }, select: { id: true } });
          report.rules.push({ id: p.id, lang: p.lang, slug: p.slug, explanationLang: it.explanationLang, action: hasSame ? 'skip-same' : 'skip-differs' });
          continue;
        }
        report.rules.push({ id: p.id, lang: p.lang, slug: p.slug, explanationLang: it.explanationLang, action: 'create' });
        if (opts.dryRun) continue;
        if (!rule) {
          rule = await tx.grammarRule.create({
            data: {
              id: p.id,
              lang: p.lang,
              slug: p.slug,
              category: p.category,
              levelSystem: (p.level?.system as string) ?? null,
              levelValue: (p.level?.value as string) ?? null,
              levelConfirmed: p.level?.confirmed === true,
              createdLabel: p.author ?? 'import',
            },
          });
        }
        await tx.grammarRevision.create({
          data: {
            ruleId: p.id,
            explanationLang: it.explanationLang,
            revisionNo: 1,
            status: 'DRAFT',
            content: it.content as Prisma.InputJsonValue,
            contentSchemaVersion: CONTENT_SCHEMA_VERSION,
            contentHash: it.hash,
            provenance: 'AI_DRAFT',
            authorLabel: p.author ?? 'AI qoralama (Claude), tekshirilmagan',
          },
        });
        await tx.grammarReviewEvent.create({ data: { ruleId: p.id, action: 'import', toStatus: 'DRAFT', note: 'Git korpusidan import (AI qoralama, tekshirilmagan)' } });
      }
    }
    // slug aliaslar
    for (const r of redirects.redirects ?? []) {
      const lang = String(r.lang), from = String(r.from), ruleId = String(r.id);
      const ex = await tx.grammarSlugAlias.findUnique({ where: { lang_slug: { lang, slug: from } } });
      if (ex) report.aliases.push({ lang, slug: from, ruleId, action: ex.ruleId === ruleId ? 'same' : 'conflict' });
      else {
        report.aliases.push({ lang, slug: from, ruleId, action: 'create' });
        if (!opts.dryRun) await tx.grammarSlugAlias.create({ data: { lang, slug: from, ruleId } });
      }
      if (ex && ex.ruleId !== ruleId) report.ok = false;
    }
    // nafaqadagi ID lar (qayta ishlatilmasligi uchun tombstone qoida)
    for (const t of redirects.retired ?? []) {
      const id = String(t.id);
      const ex = await tx.grammarRule.findUnique({ where: { id } });
      if (ex) {
        report.retired.push({ id, action: 'same' });
        continue;
      }
      report.retired.push({ id, action: 'create' });
      if (!opts.dryRun) {
        const lang = id.split('_')[1];
        await tx.grammarRule.create({ data: { id, lang, slug: `retired-${id}`, category: 'retired', state: 'RETIRED', replacedById: (t.replacedBy as string) ?? null, retiredReason: 'import (redirects.json › retired)' } });
      }
    }
    // hisoblagichlar: max(ID)+1 (kamaymaydi)
    const all = dryRunIds(plans, redirects);
    for (const [lang, max] of Object.entries(all)) {
      report.counters[lang] = max + 1;
      if (!opts.dryRun) {
        const rows = await tx.$queryRaw<{ max: number | null }[]>`SELECT MAX(CAST(SUBSTRING(id FROM 7) AS INTEGER)) AS max FROM "GrammarRule" WHERE lang = ${lang}`;
        const next = Math.max(max, rows[0]?.max ?? 0) + 1;
        await tx.grammarIdCounter.upsert({ where: { lang }, create: { lang, next }, update: { next } });
      }
    }
  };

  if (!report.ok && report.rules.some((r) => r.action === 'invalid')) return report; // yaroqsiz kontent bor: hech narsa yozilmaydi
  await prisma.$transaction(
    async (tx) => {
      await apply(tx);
      if (!report.ok) throw new ImportAbort();
      if (!opts.dryRun) await tx.grammarImportRun.create({ data: { source: dir, dryRun: false, finishedAt: new Date(), report: report as unknown as Prisma.InputJsonValue } });
    },
    { timeout: 120_000 },
  ).catch((e) => {
    if (!(e instanceof ImportAbort)) throw e;
  });
  return report;
}

class ImportAbort extends Error {}

function dryRunIds(plans: { id: string; lang: string }[], redirects: { retired?: Json[] }): Record<string, number> {
  const out: Record<string, number> = {};
  const ids = [...plans.map((p) => p.id), ...(redirects.retired ?? []).map((t) => String(t.id))];
  for (const id of ids) {
    const m = /^gr_([a-z]{2,3})_(\d{6})$/.exec(id);
    if (m) out[m[1]] = Math.max(out[m[1]] ?? 0, Number(m[2]));
  }
  return out;
}

/** Release → arxiv (bundle.json + qoida/revision JSON'lari). Git korpusiga qayta import QILINMAYDI (alohida format). */
export async function exportRelease(prisma: PrismaClient, bundle: unknown, releaseId: string, out: string): Promise<{ files: number }> {
  await mkdir(join(out, 'rules'), { recursive: true });
  await writeFile(join(out, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
  const items = await prisma.grammarReleaseItem.findMany({ where: { releaseId }, include: { revision: true } });
  for (const i of items) {
    await writeFile(
      join(out, 'rules', `${i.ruleId}.${i.explanationLang}.json`),
      JSON.stringify({ ruleId: i.ruleId, explanationLang: i.explanationLang, meta: i.meta, revisionNo: i.revision.revisionNo, contentHash: i.revision.contentHash, provenance: i.revision.provenance, approvedAt: i.revision.approvedAt, selfApproved: i.revision.selfApproved, content: i.revision.content }, null, 2) + '\n',
    );
  }
  return { files: items.length + 1 };
}
