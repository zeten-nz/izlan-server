import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONTENT_SCHEMA_VERSION,
  completenessIssues,
  contentHash,
  languageIssues,
  parseContent,
  releaseLicenseIssues,
  type GrammarContent,
} from './content.schema';
import { GrammarContentService } from './content.service';
import { canModerate, type Actor } from './permissions';
import { canonicalize } from './registry';

export interface GateIssue {
  gate: string;
  ruleId?: string;
  message: string;
}

interface Candidate {
  items: {
    ruleId: string;
    explanationLang: string;
    revisionId: string;
    contentHash: string;
    revisionNo: number;
    meta: Record<string, unknown>;
  }[];
  languages: unknown;
  snapshotHash: string;
  errors: GateIssue[];
  warnings: GateIssue[];
  diff: { added: string[]; changed: string[]; removed: string[] };
  impact: { ruleId: string; lessons: { id: string; title: string }[] }[];
}

/** Release.languages Json = muzlatilgan { languages, retired, redirects } (nomi tarixiy). */
interface FrozenSide {
  languages: { code: string; name: string; nativeName: string; dir: string; levelSystem: string; scripts: string[]; categories: unknown }[];
  retired: { id: string; replacedBy: string | null }[];
  redirects: { lang: string; from: string; id: string }[];
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

@Injectable()
export class GrammarReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: GrammarContentService,
  ) {}

  // ───────────────────── aktiv release ─────────────────────

  async activeRow() {
    return this.prisma.grammarActivation.findFirst({ orderBy: { seq: 'desc' } });
  }

  async status() {
    const [act, last] = await Promise.all([this.activeRow(), this.prisma.grammarOverlayEvent.aggregate({ _max: { seq: true } })]);
    const rel = act ? await this.prisma.grammarRelease.findUnique({ where: { id: act.releaseId }, select: { id: true, seq: true, snapshotHash: true, createdAt: true, note: true } }) : null;
    return { active: rel && act ? { ...rel, activatedAt: act.createdAt, activationSeq: act.seq, actor: act.actor, reason: act.reason } : null, overlayVersion: last._max.seq ?? 0 };
  }

  async activations(limit = 50) {
    return this.prisma.grammarActivation.findMany({ orderBy: { seq: 'desc' }, take: limit });
  }

  async listReleases() {
    const rels = await this.prisma.grammarRelease.findMany({ orderBy: { seq: 'desc' }, take: 100, select: { id: true, seq: true, snapshotHash: true, note: true, createdAt: true, createdById: true, validation: true, _count: { select: { items: true } } } });
    return rels;
  }

  // ───────────────────── candidate ─────────────────────

  /**
   * Nomzod snapshot: har (qoida, tushuntirish tili) uchun `pins` yoki eng yuqori APPROVED revision.
   * Hech narsa saqlanmaydi (preview). Xatolar bo'lsa release yaratilmaydi.
   */
  async buildCandidate(pins: Record<string, string> = {}): Promise<Candidate> {
    const errors: GateIssue[] = [];
    const warnings: GateIssue[] = [];
    const err = (gate: string, message: string, ruleId?: string) => errors.push({ gate, message, ruleId });

    const [langs, rules, active] = await Promise.all([
      this.prisma.grammarLanguage.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.grammarRule.findMany({ where: { deletedAt: null }, include: { aliases: true } }),
      this.activeItems(),
    ]);
    const langByCode = new Map(langs.map((l) => [l.code, l]));
    const enabledLangs = langs.filter((l) => l.enabled);

    const open = rules.filter((r) => r.state === 'OPEN');
    const retired = rules.filter((r) => r.state === 'RETIRED');
    const revs = await this.prisma.grammarRevision.findMany({
      where: { ruleId: { in: open.map((r) => r.id) }, status: 'APPROVED', deletedAt: null },
      orderBy: { revisionNo: 'desc' },
    });
    const approvers = await this.prisma.user.findMany({ where: { id: { in: [...new Set(revs.map((r) => r.approvedById).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } });
    const nameOf = new Map(approvers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    // pins tekshiruvi
    for (const [ruleId, revId] of Object.entries(pins)) {
      const r = await this.prisma.grammarRevision.findUnique({ where: { id: revId } });
      if (!r || r.ruleId !== ruleId) err('pin', `pin revision bu qoidaga tegishli emas`, ruleId);
      else if (r.status !== 'APPROVED' || r.deletedAt) err('pin', `pin revision APPROVED emas`, ruleId);
    }

    const chosen = new Map<string, (typeof revs)[number]>();
    for (const r of revs) {
      const key = `${r.ruleId}\u0000${r.explanationLang}`;
      const pin = pins[r.ruleId];
      if (pin) {
        if (r.id === pin) chosen.set(key, r);
      } else if (!chosen.has(key)) chosen.set(key, r);
    }
    for (const [ruleId, revId] of Object.entries(pins)) {
      if (!open.some((r) => r.id === ruleId)) err('pin', `pin qilingan qoida OPEN emas`, ruleId);
      else if (![...chosen.values()].some((c) => c.id === revId)) {
        const r = await this.prisma.grammarRevision.findUnique({ where: { id: revId } });
        if (r && r.status === 'APPROVED') chosen.set(`${ruleId}\u0000${r.explanationLang}`, r as (typeof revs)[number]);
      }
    }

    const ruleById = new Map(open.map((r) => [r.id, r]));
    const items: Candidate['items'] = [];
    const parsed = new Map<string, GrammarContent>();
    for (const rev of chosen.values()) {
      const rule = ruleById.get(rev.ruleId)!;
      const lang = langByCode.get(rule.lang);
      if (!lang) { err('lang', `til topilmadi: ${rule.lang}`, rule.id); continue; }
      if (!lang.enabled) continue; // o'chirilgan til release'ga kirmaydi
      if (rev.contentSchemaVersion !== CONTENT_SCHEMA_VERSION) err('schema', `schemaVersion ${rev.contentSchemaVersion} qo'llab-quvvatlanmaydi`, rule.id);
      const p = parseContent(rev.content);
      if (!p.ok) { for (const i of p.issues) err('schema', `${i.path}: ${i.message}`, rule.id); continue; }
      parsed.set(rev.id, p.content);
      if (!rev.approvedAt || !rev.approvedById || rev.approvedHash !== rev.contentHash) err('integrity', 'approved xesh contentHash ga teng emas', rule.id);
      if (contentHash(p.content) !== rev.contentHash) err('integrity', 'saqlangan contentHash kontentga mos emas', rule.id);
      for (const i of languageIssues(p.content, lang)) err('content', `${i.path}: ${i.message}`, rule.id);
      for (const i of completenessIssues(p.content, rev.provenance)) err('content', `${i.path}: ${i.message}`, rule.id);
      for (const i of releaseLicenseIssues(p.content, rev.provenance)) err('license', `${i.path}: ${i.message}`, rule.id);
      items.push({
        ruleId: rule.id,
        explanationLang: rev.explanationLang,
        revisionId: rev.id,
        contentHash: rev.contentHash,
        revisionNo: rev.revisionNo,
        meta: {
          lang: rule.lang,
          slug: rule.slug,
          category: rule.category,
          level: rule.levelSystem ? { system: rule.levelSystem, value: rule.levelValue, confirmed: rule.levelConfirmed } : null,
          aliases: rule.aliases.map((a) => a.slug).sort(),
          revision: rev.revisionNo,
          reviewedAt: rev.approvedAt?.toISOString() ?? null,
          reviewedByName: (rev.approvedById && nameOf.get(rev.approvedById)) || 'Admin',
          provenance: rev.provenance,
        },
      });
    }
    items.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.explanationLang.localeCompare(b.explanationLang));

    // release ichidagi ID/slug yaxlitligi
    const ids = new Set(items.map((i) => i.ruleId));
    const slugs = new Set<string>();
    for (const i of items) {
      const m = i.meta as { lang: string; slug: string };
      const k = `${m.lang}/${m.slug}`;
      if (slugs.has(k) && !items.some((x) => x !== i && x.ruleId === i.ruleId)) err('slug', `slug takrorlangan: ${k}`, i.ruleId);
      slugs.add(k);
    }
    // related
    for (const i of items) {
      const c = parsed.get(i.revisionId);
      for (const r of c?.related ?? []) if (!ids.has(r)) err('related', `bog‘liq qoida release'da yo‘q: ${r}`, i.ruleId);
    }
    // retired
    const retiredOut: FrozenSide['retired'] = [];
    for (const r of retired) {
      if (ids.has(r.id)) err('retired', `ID ham faol, ham nafaqada: ${r.id}`, r.id);
      if (r.replacedById && !ids.has(r.replacedById)) err('retired', `almashtiruvchi release'da yo‘q (approved emas yoki o‘chirilgan): ${r.replacedById}`, r.id);
      retiredOut.push({ id: r.id, replacedBy: r.replacedById && ids.has(r.replacedById) ? r.replacedById : null });
    }
    retiredOut.sort((a, b) => a.id.localeCompare(b.id));
    // oldingi aktiv release'dagi ID lar yo'qolmasligi kerak (yo'qolsa — qoida o'chirilgan/bekor)
    for (const [key] of active) {
      const ruleId = key.split('\u0000')[0];
      if (!ids.has(ruleId) && !retiredOut.some((r) => r.id === ruleId)) warnings.push({ gate: 'removed', ruleId, message: 'faol release’da bor edi, yangisida yo‘q (darslarda ishlatilsa ko‘rinmay qoladi)' });
    }

    const frozen: FrozenSide = {
      languages: enabledLangs.map((l) => ({ code: l.code, name: l.name, nativeName: l.nativeName || l.name, dir: l.dir, levelSystem: l.levelSystem, scripts: l.scripts, categories: l.categories })),
      retired: retiredOut,
      redirects: items
        .filter((i) => i.explanationLang === 'uz' || true)
        .flatMap((i) => ((i.meta as { aliases: string[]; lang: string }).aliases ?? []).map((from) => ({ lang: (i.meta as { lang: string }).lang, from, id: i.ruleId })))
        .filter((r, idx, a) => a.findIndex((x) => x.lang === r.lang && x.from === r.from) === idx)
        .sort((a, b) => a.lang.localeCompare(b.lang) || a.from.localeCompare(b.from)),
    };
    const snapshotHash = sha(canonicalize({ v: CONTENT_SCHEMA_VERSION, frozen, items: items.map((i) => [i.ruleId, i.explanationLang, i.revisionId, i.contentHash, i.meta]) }));

    // diff va dars ta'siri
    const diff = { added: [] as string[], changed: [] as string[], removed: [] as string[] };
    const nowKeys = new Map(items.map((i) => [`${i.ruleId}\u0000${i.explanationLang}`, i.revisionId]));
    for (const [k, rid] of nowKeys) {
      const prev = active.get(k);
      if (!prev) diff.added.push(k.replace('\u0000', ':'));
      else if (prev !== rid) diff.changed.push(k.replace('\u0000', ':'));
    }
    for (const k of active.keys()) if (!nowKeys.has(k)) diff.removed.push(k.replace('\u0000', ':'));

    const impact: Candidate['impact'] = [];
    for (const k of [...diff.removed, ...retiredOut.map((r) => r.id)]) {
      const ruleId = k.split(':')[0];
      const lessons = await this.content.usage(ruleId);
      if (lessons.length) impact.push({ ruleId, lessons });
    }
    for (const x of impact) warnings.push({ gate: 'lesson-impact', ruleId: x.ruleId, message: `${x.lessons.length} ta nashr qilingan dars ta’sirlanadi` });

    return { items, languages: frozen, snapshotHash, errors, warnings, diff, impact };
  }

  private async activeItems(): Promise<Map<string, string>> {
    const act = await this.activeRow();
    if (!act) return new Map();
    const rows = await this.prisma.grammarReleaseItem.findMany({ where: { releaseId: act.releaseId }, select: { ruleId: true, explanationLang: true, revisionId: true } });
    return new Map(rows.map((r) => [`${r.ruleId}\u0000${r.explanationLang}`, r.revisionId]));
  }

  async preview(actor: Actor, pins: Record<string, string> = {}) {
    if (!canModerate(actor)) throw new ForbiddenException();
    const c = await this.buildCandidate(pins);
    const act = await this.activeRow();
    const same = act ? (await this.prisma.grammarRelease.findUnique({ where: { id: act.releaseId }, select: { snapshotHash: true } }))?.snapshotHash === c.snapshotHash : false;
    return { ok: c.errors.length === 0, noChanges: same, snapshotHash: c.snapshotHash, itemCount: c.items.length, errors: c.errors, warnings: c.warnings, diff: c.diff, impact: c.impact };
  }

  /** Release nomzodini saqlaydi (AKTIVLASHTIRMAYDI; aktivlash faqat deploy pipeline/CLI orqali). */
  async createCandidate(actor: Actor | { id: string | null }, input: { note?: string; pins?: Record<string, string> } = {}) {
    if ('role' in actor && !canModerate(actor)) throw new ForbiddenException();
    const c = await this.buildCandidate(input.pins ?? {});
    if (c.errors.length) throw new ConflictException({ message: 'Release darvozasidan o‘tmadi', errors: c.errors });
    if (!c.items.length) throw new BadRequestException('Release bo‘sh: tasdiqlangan qoida yo‘q');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('grammar:release', 0))`;
      const act = await tx.grammarActivation.findFirst({ orderBy: { seq: 'desc' } });
      const dup = await tx.grammarRelease.findFirst({ where: { snapshotHash: c.snapshotHash }, select: { id: true } });
      if (dup) throw new ConflictException({ message: 'Aynan shu tarkibdagi release allaqachon mavjud', releaseId: dup.id });
      const rel = await tx.grammarRelease.create({
        data: {
          createdById: actor.id,
          note: input.note ?? null,
          contentSchemaVersion: CONTENT_SCHEMA_VERSION,
          languages: c.languages as Prisma.InputJsonValue,
          snapshotHash: c.snapshotHash,
          validation: { warnings: c.warnings, diff: c.diff, impact: c.impact, pins: input.pins ?? {} } as unknown as Prisma.InputJsonValue,
          baseReleaseId: act?.releaseId ?? null,
          items: {
            create: c.items.map((i) => ({ ruleId: i.ruleId, explanationLang: i.explanationLang, revisionId: i.revisionId, meta: i.meta as Prisma.InputJsonValue })),
          },
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.id ?? 'system', action: 'grammar.release.candidate', entity: 'GrammarRelease', entityId: rel.id, meta: { seq: rel.seq, items: c.items.length, snapshotHash: c.snapshotHash } } });
      return { releaseId: rel.id, seq: rel.seq, snapshotHash: c.snapshotHash, itemCount: c.items.length, warnings: c.warnings };
    });
  }

  /** Bitta qoidani avvalgi released revision'ga qaytaruvchi nomzod (yangi release; eskisi o'zgarmaydi). */
  async createRuleRevertCandidate(actor: Actor, ruleId: string, toRevisionId: string, note?: string) {
    if (!canModerate(actor)) throw new ForbiddenException();
    const rev = await this.prisma.grammarRevision.findUnique({ where: { id: toRevisionId } });
    if (!rev || rev.ruleId !== ruleId) throw new BadRequestException('Revision bu qoidaga tegishli emas');
    const released = await this.prisma.grammarReleaseItem.count({ where: { revisionId: toRevisionId } });
    if (!released) throw new BadRequestException('Faqat avval release qilingan revision’ga qaytarish mumkin');
    return this.createCandidate(actor, { note: note ?? `revert ${ruleId}`, pins: { [ruleId]: toRevisionId } });
  }

  // ───────────────────── aktivlash (faqat CLI/pipeline) ─────────────────────

  /**
   * Aktivlashtirish yoki orqaga qaytarish. HTTP orqali CHAQIRILMAYDI — faqat `scripts/grammar-release.cjs`.
   * Tekshiruvlar: mavjud release, kutilgan xesh, schemaVersion, release yaxlitligi (itemlar qayta tekshiriladi), advisory lock.
   */
  async activate(input: { releaseId: string; expectHash: string; actor: string; reason: string }) {
    if (!input.actor.trim() || !input.reason.trim()) throw new BadRequestException('actor va reason majburiy');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('grammar:activation', 0))`;
      const rel = await tx.grammarRelease.findUnique({ where: { id: input.releaseId } });
      if (!rel) throw new NotFoundException('Release topilmadi');
      if (rel.snapshotHash !== input.expectHash) throw new ConflictException('Kutilgan xesh release xeshiga teng emas');
      if (rel.contentSchemaVersion !== CONTENT_SCHEMA_VERSION) throw new ConflictException('Release schemaVersion qo‘llab-quvvatlanmaydi');
      const cur = await tx.grammarActivation.findFirst({ orderBy: { seq: 'desc' } });
      if (cur?.releaseId === rel.id) throw new ConflictException('Bu release allaqachon aktiv');
      // yaxlitlik: har item hanuz APPROVED va xesh mos
      const items = await tx.grammarReleaseItem.findMany({ where: { releaseId: rel.id }, include: { revision: true } });
      for (const i of items) {
        if (i.revision.status !== 'APPROVED' || i.revision.approvedHash !== i.revision.contentHash || contentHash(i.revision.content as unknown as GrammarContent) !== i.revision.contentHash) {
          throw new ConflictException(`Release yaxlitligi buzilgan: ${i.ruleId}`);
        }
      }
      const prevRel = cur ? await tx.grammarRelease.findUnique({ where: { id: cur.releaseId }, select: { seq: true } }) : null;
      const action = prevRel && prevRel.seq > rel.seq ? 'ROLLBACK' : 'ACTIVATE';
      const act = await tx.grammarActivation.create({ data: { releaseId: rel.id, action, actor: input.actor, reason: input.reason, previousReleaseId: cur?.releaseId ?? null } });
      await tx.auditLog.create({ data: { actorId: input.actor, action: `grammar.release.${action.toLowerCase()}`, entity: 'GrammarRelease', entityId: rel.id, meta: { seq: act.seq, previous: cur?.releaseId ?? null, reason: input.reason } } });
      return { activationSeq: act.seq, action, releaseId: rel.id, previousReleaseId: cur?.releaseId ?? null };
    });
  }

  // ───────────────────── bundle (runtime) ─────────────────────

  /** Client `PublicData` shaklidagi bundle. Release o'zgarmas bo'lgani uchun natija ham o'zgarmas (releaseId bo'yicha keshlanadi). */
  async bundle(releaseId: string) {
    const rel = await this.prisma.grammarRelease.findUnique({ where: { id: releaseId } });
    if (!rel) throw new NotFoundException('Release topilmadi');
    const frozen = rel.languages as unknown as FrozenSide;
    const items = await this.prisma.grammarReleaseItem.findMany({ where: { releaseId }, include: { revision: true }, orderBy: [{ ruleId: 'asc' }, { explanationLang: 'asc' }] });
    const byRule = new Map<string, typeof items>();
    for (const i of items) byRule.set(i.ruleId, [...(byRule.get(i.ruleId) ?? []), i]);
    const ids = new Set(byRule.keys());

    const rules = [...byRule.values()].map((list) => {
      const m0 = list[0].meta as { lang: string; slug: string; category: string; level: { system: string; value: string; confirmed?: boolean } | null };
      const translations: Record<string, unknown> = {};
      let related: string[] = [];
      for (const i of list) {
        const c = i.revision.content as unknown as GrammarContent;
        const m = i.meta as { revision: number; reviewedAt: string | null; reviewedByName: string };
        related = c.related.filter((r) => ids.has(r)).sort();
        translations[i.explanationLang] = {
          title: c.title,
          summary: c.summary,
          revision: m.revision,
          reviewedAt: (m.reviewedAt ?? '').slice(0, 10),
          reviewedByName: m.reviewedByName,
          formulas: c.formulas,
          examples: c.examples,
          exceptions: c.exceptions,
          commonMistakes: c.commonMistakes,
          blocks: c.blocks,
          keywords: c.keywords,
          // Ommaviy shakl: faqat title/url/license/note (muallif/attribution note'ga qo'shiladi; ichki license-review maydonlari chiqmaydi)
          sources: c.sources.map((s) => ({
            title: s.title,
            ...(s.url ? { url: s.url } : {}),
            ...(s.license ? { license: s.license } : {}),
            ...(s.attribution || s.author ? { note: (s.attribution ?? `Muallif: ${s.author}`).slice(0, 300) } : {}),
          })),
          body: c.body,
        };
      }
      return {
        id: list[0].ruleId,
        lang: m0.lang,
        slug: m0.slug,
        category: m0.category,
        ...(m0.level ? { level: { system: m0.level.system, value: m0.level.value, ...(m0.level.confirmed ? { confirmed: true } : {}) } } : {}),
        related,
        translations,
      };
    });

    return {
      schemaVersion: 1 as const,
      languages: frozen.languages,
      rules,
      redirects: frozen.redirects,
      retired: frozen.retired.map((t) => ({ id: t.id, replacedBy: t.replacedBy && ids.has(t.replacedBy) ? t.replacedBy : null })),
    };
  }

  async exists(releaseId: string) {
    return !!(await this.prisma.grammarRelease.findUnique({ where: { id: releaseId }, select: { id: true } }));
  }
}
