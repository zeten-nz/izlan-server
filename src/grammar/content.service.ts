import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type GrammarProvenance, type GrammarRevision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONTENT_SCHEMA_VERSION,
  completenessIssues,
  contentHash,
  languageIssues,
  parseContent,
  type ContentIssue,
  type GrammarContent,
} from './content.schema';
import {
  canApprove,
  canCreateRevision,
  canCreateRule,
  canEditRevision,
  canModerate,
  canSoftDeleteRule,
  canSubmit,
  canViewRules,
  canWithdraw,
  type Actor,
  type RevisionStatus,
} from './permissions';
import { canTransition } from './state-machine';

type Tx = Prisma.TransactionClient;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROVENANCE: readonly GrammarProvenance[] = ['AI_DRAFT', 'ORIGINAL', 'EXTERNAL', 'MIXED', 'UNKNOWN'];

export interface RuleMetaInput {
  slug?: string;
  category?: string;
  level?: { system: string; value: string; confirmed?: boolean } | null;
}

function issuesError(issues: ContentIssue[]): UnprocessableEntityException {
  return new UnprocessableEntityException({ message: 'Kontent tekshiruvdan o‘tmadi', issues });
}

@Injectable()
export class GrammarContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────── yordamchilar ─────────────────────────

  private async langConfig(db: Tx | PrismaService, code: string) {
    const l = await db.grammarLanguage.findUnique({ where: { code } });
    if (!l) throw new BadRequestException(`Til topilmadi: ${code}`);
    return l;
  }

  private async audit(tx: Tx, a: { actor: Actor; ruleId: string; revisionId?: string; action: string; from?: string; to?: string; note?: string; meta?: object }) {
    await tx.grammarReviewEvent.create({
      data: {
        ruleId: a.ruleId,
        revisionId: a.revisionId ?? null,
        actorId: a.actor.id,
        action: a.action,
        fromStatus: a.from ?? null,
        toStatus: a.to ?? null,
        note: a.note ?? null,
        meta: (a.meta ?? {}) as Prisma.InputJsonValue,
      },
    });
    // Kontent matni auditga yozilmaydi — faqat ID va amal.
    await tx.auditLog.create({
      data: { actorId: a.actor.id, action: `grammar.${a.action}`, entity: 'GrammarRule', entityId: a.ruleId, meta: { revisionId: a.revisionId ?? null, from: a.from ?? null, to: a.to ?? null } },
    });
  }

  private async lock(tx: Tx, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  /** Yangi ID: gr_<til>_<6 raqam>. Hisoblagich hech qachon kamaymaydi (DB trigger), ID qayta ishlatilmaydi. */
  private async allocateId(tx: Tx, lang: string): Promise<string> {
    await this.lock(tx, `grammar:id:${lang}`);
    for (let guard = 0; guard < 50; guard++) {
      const c = await tx.grammarIdCounter.upsert({ where: { lang }, create: { lang, next: 2 }, update: { next: { increment: 1 } } });
      const n = c.next - 1;
      const id = `gr_${lang}_${String(n).padStart(6, '0')}`;
      if (!(await tx.grammarRule.findUnique({ where: { id }, select: { id: true } }))) return id;
    }
    throw new ConflictException('ID ajratib bo‘lmadi');
  }

  private async slugFree(tx: Tx, lang: string, slug: string, exceptRuleId?: string) {
    const r = await tx.grammarRule.findUnique({ where: { lang_slug: { lang, slug } }, select: { id: true } });
    if (r && r.id !== exceptRuleId) return false;
    const al = await tx.grammarSlugAlias.findUnique({ where: { lang_slug: { lang, slug } }, select: { ruleId: true } });
    return !(al && al.ruleId !== exceptRuleId);
  }

  private normProvenance(p: unknown, fallback: GrammarProvenance): GrammarProvenance {
    return typeof p === 'string' && (PROVENANCE as readonly string[]).includes(p) ? (p as GrammarProvenance) : fallback;
  }

  private checkMeta(m: RuleMetaInput, cfg: { categories: unknown; levelSystem: string }) {
    if (m.slug !== undefined && !(SLUG_RE.test(m.slug) && m.slug.length <= 60)) throw new BadRequestException('slug noto‘g‘ri (kichik harf, raqam, defis)');
    if (m.category !== undefined) {
      const cats = (Array.isArray(cfg.categories) ? cfg.categories : []) as { id?: string }[];
      if (cats.length && !cats.some((c) => c.id === m.category)) throw new BadRequestException(`Noma'lum kategoriya: ${m.category}`);
    }
    if (m.level) {
      if (cfg.levelSystem === 'none' || m.level.system !== cfg.levelSystem) throw new BadRequestException('Daraja tizimi til sozlamasiga mos emas');
    }
  }

  /** Foydalanuvchi kontentini tekshiradi; `strict` — topshirish/tasdiqlash uchun to'liq tekshiruv. */
  private validate(contentRaw: unknown, lang: { scripts: string[]; blocks: string[] }, provenance: string, strict: boolean): GrammarContent {
    const p = parseContent(contentRaw);
    if (!p.ok) throw issuesError(p.issues);
    const issues = languageIssues(p.content, lang);
    if (strict) issues.push(...completenessIssues(p.content, provenance));
    if (issues.length) throw issuesError(issues);
    return p.content;
  }

  private revFacts = (r: Pick<GrammarRevision, 'status' | 'authorId' | 'deletedAt'>) => ({ status: r.status as RevisionStatus, authorId: r.authorId, deleted: r.deletedAt !== null });

  private async getRevision(db: Tx | PrismaService, id: string) {
    const r = await db.grammarRevision.findUnique({ where: { id }, include: { rule: true } });
    if (!r || r.deletedAt || r.rule.deletedAt) throw new NotFoundException('Revision topilmadi');
    return r;
  }

  // ───────────────────────── o'qish ─────────────────────────

  async languages(actor: Actor) {
    if (!canViewRules(actor)) throw new ForbiddenException();
    return this.prisma.grammarLanguage.findMany({ orderBy: { code: 'asc' } });
  }

  async listRules(actor: Actor, q: { lang?: string; status?: string; mine?: boolean; search?: string }) {
    if (!canViewRules(actor)) throw new ForbiddenException();
    const where: Prisma.GrammarRuleWhereInput = { deletedAt: null };
    if (q.lang) where.lang = q.lang;
    if (q.search) where.OR = [{ slug: { contains: q.search.toLowerCase() } }, { id: { contains: q.search.toLowerCase() } }];
    if (q.mine) where.createdById = actor.id;
    const rules = await this.prisma.grammarRule.findMany({
      where,
      orderBy: [{ lang: 'asc' }, { updatedAt: 'desc' }],
      take: 500,
      include: {
        revisions: {
          where: { deletedAt: null },
          orderBy: { revisionNo: 'desc' },
          select: { id: true, explanationLang: true, revisionNo: true, status: true, authorId: true, authorLabel: true, provenance: true, updatedAt: true, content: true, approvedAt: true, selfApproved: true },
        },
      },
    });
    const overlay = await this.hiddenSet();
    const out = rules.map((r) => ({
      id: r.id,
      lang: r.lang,
      slug: r.slug,
      category: r.category,
      level: r.levelSystem ? { system: r.levelSystem, value: r.levelValue, confirmed: r.levelConfirmed } : null,
      state: r.state,
      hidden: overlay.has(r.id),
      createdById: r.createdById,
      createdLabel: r.createdLabel,
      updatedAt: r.updatedAt,
      mine: r.createdById === actor.id,
      revisions: r.revisions.map((v) => ({
        id: v.id,
        explanationLang: v.explanationLang,
        revisionNo: v.revisionNo,
        status: v.status,
        title: (v.content as { title?: string } | null)?.title ?? '',
        authorId: v.authorId,
        authorLabel: v.authorLabel,
        provenance: v.provenance,
        updatedAt: v.updatedAt,
        approvedAt: v.approvedAt,
        selfApproved: v.selfApproved,
        canEdit: canEditRevision(actor, this.revFacts({ status: v.status, authorId: v.authorId, deletedAt: null })),
      })),
    }));
    return q.status ? out.filter((r) => r.revisions.some((v) => v.status === q.status)) : out;
  }

  async getRule(actor: Actor, id: string) {
    if (!canViewRules(actor)) throw new ForbiddenException();
    const r = await this.prisma.grammarRule.findUnique({
      where: { id },
      include: { aliases: true, revisions: { where: { deletedAt: null }, orderBy: [{ explanationLang: 'asc' }, { revisionNo: 'desc' }] } },
    });
    if (!r || r.deletedAt) throw new NotFoundException('Qoida topilmadi');
    const overlay = await this.hiddenSet();
    const facts = await this.ruleFacts(this.prisma, r.id);
    return {
      id: r.id,
      lang: r.lang,
      slug: r.slug,
      category: r.category,
      level: r.levelSystem ? { system: r.levelSystem, value: r.levelValue, confirmed: r.levelConfirmed } : null,
      state: r.state,
      replacedById: r.replacedById,
      retiredReason: r.retiredReason,
      hidden: overlay.has(r.id),
      createdById: r.createdById,
      createdLabel: r.createdLabel,
      aliases: r.aliases.map((a) => a.slug),
      canDelete: canSoftDeleteRule(actor, { createdById: r.createdById, deleted: false, ...facts }),
      revisions: r.revisions.map((v) => ({
        id: v.id,
        explanationLang: v.explanationLang,
        revisionNo: v.revisionNo,
        status: v.status,
        rev: v.rev,
        content: v.content,
        contentHash: v.contentHash,
        provenance: v.provenance,
        authorId: v.authorId,
        authorLabel: v.authorLabel,
        submittedAt: v.submittedAt,
        approvedAt: v.approvedAt,
        approvedById: v.approvedById,
        selfApproved: v.selfApproved,
        reviewNote: v.reviewNote,
        updatedAt: v.updatedAt,
        canEdit: canEditRevision(actor, this.revFacts(v)),
        canSubmit: canSubmit(actor, this.revFacts(v)),
        canWithdraw: canWithdraw(actor, this.revFacts(v)),
      })),
    };
  }

  async ruleFacts(db: Tx | PrismaService, ruleId: string) {
    const [approved, released] = await Promise.all([
      db.grammarRevision.count({ where: { ruleId, approvedAt: { not: null } } }),
      db.grammarReleaseItem.count({ where: { ruleId } }),
    ]);
    const used = await this.usage(ruleId, db);
    return { everApproved: approved > 0, everReleased: released > 0, inUse: used.length > 0 };
  }

  /** Nashr qilingan darslarda ishlatilishi (jsonb_path_exists). */
  async usage(ruleId: string, db: Tx | PrismaService = this.prisma): Promise<{ id: string; title: string }[]> {
    return db.$queryRaw<{ id: string; title: string }[]>`
      SELECT l.id, l.title FROM "Lesson" l
      JOIN "LessonVersion" v ON v.id = l."publishedVersionId"
      WHERE jsonb_path_exists(v.doc, '$.** ? (@.grammarRuleId == $id)', jsonb_build_object('id', ${ruleId}::text))
      ORDER BY l.title LIMIT 200`;
  }

  async history(actor: Actor, ruleId: string) {
    if (!canViewRules(actor)) throw new ForbiddenException();
    return this.prisma.grammarReviewEvent.findMany({ where: { ruleId }, orderBy: { createdAt: 'desc' }, take: 300 });
  }

  // ───────────────────────── yozish ─────────────────────────

  async createRule(
    actor: Actor,
    input: { lang: string; explanationLang?: string; slug: string; category: string; level?: RuleMetaInput["level"]; content?: unknown; provenance?: string },
  ) {
    if (!canCreateRule(actor)) throw new ForbiddenException();
    const cfg = await this.langConfig(this.prisma, input.lang);
    if (!cfg.enabled) throw new BadRequestException('Bu til hali yoqilmagan');
    const explanationLang = input.explanationLang ?? 'uz';
    if (explanationLang !== 'uz') throw new BadRequestException('Hozircha faqat o‘zbekcha tushuntirish qo‘llab-quvvatlanadi');
    this.checkMeta({ slug: input.slug, category: input.category, level: input.level }, cfg);
    const provenance = this.normProvenance(input.provenance, 'ORIGINAL');
    const content = this.validate(input.content, cfg, provenance, false);
    const hash = contentHash(content);

    return this.prisma.$transaction(async (tx) => {
      if (!(await this.slugFree(tx, input.lang, input.slug))) throw new ConflictException('Bu slug band');
      const id = await this.allocateId(tx, input.lang);
      await tx.grammarRule.create({
        data: {
          id,
          lang: input.lang,
          slug: input.slug,
          category: input.category,
          levelSystem: input.level?.system ?? null,
          levelValue: input.level?.value ?? null,
          levelConfirmed: input.level?.confirmed ?? false,
          createdById: actor.id,
        },
      });
      const rev = await tx.grammarRevision.create({
        data: {
          ruleId: id,
          explanationLang,
          revisionNo: 1,
          content: content as unknown as Prisma.InputJsonValue,
          contentSchemaVersion: CONTENT_SCHEMA_VERSION,
          contentHash: hash,
          provenance,
          authorId: actor.id,
          lastEditedById: actor.id,
        },
      });
      await this.audit(tx, { actor, ruleId: id, revisionId: rev.id, action: 'rule.create', to: 'DRAFT' });
      return { ruleId: id, revisionId: rev.id };
    });
  }

  async saveDraft(actor: Actor, revisionId: string, input: { rev: number; content?: unknown; provenance?: string; meta?: RuleMetaInput }) {
    const cur = await this.getRevision(this.prisma, revisionId);
    if (!canEditRevision(actor, this.revFacts(cur))) throw new ForbiddenException('Bu revisionni tahrirlab bo‘lmaydi');
    const cfg = await this.langConfig(this.prisma, cur.rule.lang);
    const provenance = this.normProvenance(input.provenance, cur.provenance);
    const content = this.validate(input.content, cfg, provenance, false);
    const hash = contentHash(content);
    const meta = input.meta ?? {};
    this.checkMeta(meta, cfg);

    return this.prisma.$transaction(async (tx) => {
      const neverApproved = (await tx.grammarRevision.count({ where: { ruleId: cur.ruleId, approvedAt: { not: null } } })) === 0;
      if ((meta.slug !== undefined || meta.category !== undefined || meta.level !== undefined) && !neverApproved) {
        throw new ForbiddenException('Tasdiqlangan qoidaning slug/kategoriya/darajasini bu yerda o‘zgartirib bo‘lmaydi');
      }
      if (meta.slug !== undefined && meta.slug !== cur.rule.slug) {
        if (!(await this.slugFree(tx, cur.rule.lang, meta.slug, cur.ruleId))) throw new ConflictException('Bu slug band');
      }
      const upd = await tx.grammarRevision.updateMany({
        where: { id: revisionId, rev: input.rev, status: { in: ['DRAFT', 'CHANGES_REQUESTED'] }, deletedAt: null },
        data: { content: content as unknown as Prisma.InputJsonValue, contentHash: hash, provenance, rev: { increment: 1 }, lastEditedById: actor.id },
      });
      if (upd.count !== 1) throw new ConflictException('Konflikt: revision boshqa joyda o‘zgargan yoki holati o‘zgargan. Sahifani yangilang.');
      if (neverApproved && (meta.slug !== undefined || meta.category !== undefined || meta.level !== undefined)) {
        await tx.grammarRule.update({
          where: { id: cur.ruleId },
          data: {
            ...(meta.slug !== undefined ? { slug: meta.slug } : {}),
            ...(meta.category !== undefined ? { category: meta.category } : {}),
            ...(meta.level !== undefined
              ? { levelSystem: meta.level?.system ?? null, levelValue: meta.level?.value ?? null, levelConfirmed: meta.level?.confirmed ?? false }
              : {}),
          },
        });
      }
      return { rev: input.rev + 1, contentHash: hash };
    });
  }

  private async transition(
    tx: Tx,
    actor: Actor,
    cur: GrammarRevision,
    to: RevisionStatus,
    action: string,
    data: Prisma.GrammarRevisionUpdateManyMutationInput,
    note?: string,
  ) {
    if (!canTransition(cur.status as RevisionStatus, to)) throw new ConflictException(`O‘tish mumkin emas: ${cur.status} → ${to}`);
    const upd = await tx.grammarRevision.updateMany({
      where: { id: cur.id, status: cur.status, contentHash: cur.contentHash, deletedAt: null },
      data: { ...data, status: to },
    });
    if (upd.count !== 1) throw new ConflictException('Revision holati yoki kontenti o‘zgargan (boshqa amal bilan to‘qnashuv). Qayta yuklang.');
    await this.audit(tx, { actor, ruleId: cur.ruleId, revisionId: cur.id, action, from: cur.status, to, note });
  }

  async submit(actor: Actor, revisionId: string) {
    const cur = await this.getRevision(this.prisma, revisionId);
    if (!canSubmit(actor, this.revFacts(cur))) throw new ForbiddenException('Topshirib bo‘lmaydi');
    const cfg = await this.langConfig(this.prisma, cur.rule.lang);
    this.validate(cur.content, cfg, cur.provenance, true);
    await this.relatedIssues(cur.content as unknown as GrammarContent);
    await this.prisma.$transaction((tx) => this.transition(tx, actor, cur, 'IN_REVIEW', 'revision.submit', { submittedAt: new Date(), reviewNote: null }));
    return { status: 'IN_REVIEW' };
  }

  async withdraw(actor: Actor, revisionId: string) {
    const cur = await this.getRevision(this.prisma, revisionId);
    if (!canWithdraw(actor, this.revFacts(cur))) throw new ForbiddenException('Qaytarib olib bo‘lmaydi');
    await this.prisma.$transaction((tx) => this.transition(tx, actor, cur, 'DRAFT', 'revision.withdraw', { submittedAt: null }));
    return { status: 'DRAFT' };
  }

  /** `related` ID lar mavjud (o'chirilmagan) qoidalarga ishora qilishi shart. */
  private async relatedIssues(c: GrammarContent) {
    if (!c.related.length) return;
    const found = await this.prisma.grammarRule.findMany({ where: { id: { in: c.related }, deletedAt: null }, select: { id: true } });
    const ok = new Set(found.map((f) => f.id));
    const bad = c.related.filter((r) => !ok.has(r));
    if (bad.length) throw issuesError(bad.map((b) => ({ path: 'related', message: `bog‘liq qoida topilmadi: ${b}` })));
  }

  async approve(actor: Actor, revisionId: string, input: { contentHash: string; checks?: Record<string, boolean>; note?: string }) {
    if (!canApprove(actor)) throw new ForbiddenException('Faqat ADMIN tasdiqlay oladi');
    const cur = await this.getRevision(this.prisma, revisionId);
    if (cur.status !== 'IN_REVIEW') throw new ConflictException('Faqat IN_REVIEW tasdiqlanadi');
    // TOCTOU: admin ko'rgan xesh hozirgi xesh bilan teng bo'lishi va saqlangan kontent xeshi qayta hisoblangan xeshga mos bo'lishi shart.
    if (input.contentHash !== cur.contentHash) throw new ConflictException('Kontent siz ko‘rganingizdan keyin o‘zgargan. Qayta ko‘rib chiqing.');
    const cfg = await this.langConfig(this.prisma, cur.rule.lang);
    const content = this.validate(cur.content, cfg, cur.provenance, true);
    if (contentHash(content) !== cur.contentHash) throw new ConflictException('Saqlangan xesh kontentga mos emas (yaxlitlik buzilgan)');
    const self = cur.authorId === actor.id || cur.lastEditedById === actor.id;
    await this.prisma.$transaction((tx) =>
      this.transition(
        tx,
        actor,
        cur,
        'APPROVED',
        self ? 'revision.approve.self' : 'revision.approve',
        { approvedById: actor.id, approvedAt: new Date(), approvedHash: cur.contentHash, selfApproved: self, checks: (input.checks ?? {}) as Prisma.InputJsonValue, reviewNote: input.note ?? null },
        input.note,
      ),
    );
    return { status: 'APPROVED', selfApproved: self, released: false };
  }

  async requestChanges(actor: Actor, revisionId: string, note: string) {
    if (!canApprove(actor)) throw new ForbiddenException();
    if (!note.trim()) throw new BadRequestException('Izoh majburiy');
    const cur = await this.getRevision(this.prisma, revisionId);
    await this.prisma.$transaction((tx) => this.transition(tx, actor, cur, 'CHANGES_REQUESTED', 'revision.request-changes', { reviewNote: note }, note));
    return { status: 'CHANGES_REQUESTED' };
  }

  async reject(actor: Actor, revisionId: string, note: string) {
    if (!canApprove(actor)) throw new ForbiddenException();
    if (!note.trim()) throw new BadRequestException('Sabab majburiy');
    const cur = await this.getRevision(this.prisma, revisionId);
    await this.prisma.$transaction((tx) => this.transition(tx, actor, cur, 'REJECTED', 'revision.reject', { reviewNote: note }, note));
    return { status: 'REJECTED' };
  }

  /** Approved qoidaga yangi DRAFT revision (faqat Admin). Oldingi revision o'zgarmaydi. */
  async newRevision(actor: Actor, ruleId: string, explanationLang = 'uz') {
    if (!canCreateRevision(actor)) throw new ForbiddenException('Yangi revisionni faqat ADMIN ochadi');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `grammar:rev:${ruleId}`);
      const rule = await tx.grammarRule.findUnique({ where: { id: ruleId } });
      if (!rule || rule.deletedAt) throw new NotFoundException('Qoida topilmadi');
      if (rule.state === 'RETIRED') throw new ConflictException('Nafaqadagi qoidaga revision ochib bo‘lmaydi');
      const revs = await tx.grammarRevision.findMany({ where: { ruleId, explanationLang, deletedAt: null }, orderBy: { revisionNo: 'desc' } });
      if (!revs.length) throw new NotFoundException('Revision topilmadi');
      if (revs.some((r) => ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(r.status))) throw new ConflictException('Ochiq revision allaqachon bor');
      const base = revs.find((r) => r.status === 'APPROVED') ?? revs[0];
      const max = await tx.grammarRevision.findFirst({ where: { ruleId, explanationLang }, orderBy: { revisionNo: 'desc' }, select: { revisionNo: true } });
      const rev = await tx.grammarRevision.create({
        data: {
          ruleId,
          explanationLang,
          revisionNo: (max?.revisionNo ?? 0) + 1,
          content: base.content as Prisma.InputJsonValue,
          contentSchemaVersion: base.contentSchemaVersion,
          contentHash: base.contentHash,
          provenance: base.provenance,
          authorId: actor.id,
          lastEditedById: actor.id,
        },
      });
      await this.audit(tx, { actor, ruleId, revisionId: rev.id, action: 'revision.create', to: 'DRAFT', meta: { baseRevisionId: base.id } });
      return { revisionId: rev.id };
    });
  }

  async softDelete(actor: Actor, ruleId: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('Sabab majburiy');
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.grammarRule.findUnique({ where: { id: ruleId } });
      if (!rule || rule.deletedAt) throw new NotFoundException('Qoida topilmadi');
      const facts = await this.ruleFacts(tx, ruleId);
      if (!canSoftDeleteRule(actor, { createdById: rule.createdById, deleted: false, ...facts })) {
        throw new ForbiddenException('Bu qoidani o‘chirib bo‘lmaydi (tasdiqlangan/nashr qilingan/ishlatilgan yoki sizniki emas)');
      }
      const now = new Date();
      await tx.grammarRevision.updateMany({ where: { ruleId, deletedAt: null }, data: { deletedAt: now } });
      await tx.grammarRule.update({
        where: { id: ruleId },
        data: { deletedAt: now, deletedById: actor.id, deletedReason: reason, deletedSlug: rule.slug, slug: `deleted-${ruleId}` },
      });
      await this.audit(tx, { actor, ruleId, action: 'rule.delete', note: reason });
      return { deleted: true };
    });
  }

  // ───────────────────────── kill-switch va nafaqa ─────────────────────────

  async hiddenSet(): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<{ ruleId: string }[]>`
      SELECT "ruleId" FROM (
        SELECT DISTINCT ON ("ruleId") "ruleId", action FROM "GrammarOverlayEvent" ORDER BY "ruleId", seq DESC
      ) t WHERE action = 'HIDE'`;
    return new Set(rows.map((r) => r.ruleId));
  }

  async setHidden(actor: Actor, ruleId: string, hide: boolean, reason: string) {
    if (!canModerate(actor)) throw new ForbiddenException();
    if (!reason.trim()) throw new BadRequestException('Sabab majburiy');
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.grammarRule.findUnique({ where: { id: ruleId } });
      if (!rule || rule.deletedAt) throw new NotFoundException('Qoida topilmadi');
      await this.lock(tx, `grammar:overlay:${ruleId}`);
      await tx.grammarOverlayEvent.create({ data: { ruleId, action: hide ? 'HIDE' : 'UNHIDE', actorId: actor.id, reason } });
      await this.audit(tx, { actor, ruleId, action: hide ? 'rule.hide' : 'rule.unhide', note: reason });
      return { hidden: hide };
    });
  }

  /** Overlay holati (versiya = oxirgi seq) — runtime kesh uchun. */
  async overlay() {
    const hidden = [...(await this.hiddenSet())].sort();
    const last = await this.prisma.grammarOverlayEvent.aggregate({ _max: { seq: true } });
    return { overlayVersion: last._max.seq ?? 0, hiddenIds: hidden };
  }

  async retire(actor: Actor, ruleId: string, input: { reason: string; replacedById?: string | null; acknowledgeUsage?: boolean }) {
    if (!canModerate(actor)) throw new ForbiddenException();
    if (!input.reason.trim()) throw new BadRequestException('Sabab majburiy');
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.grammarRule.findUnique({ where: { id: ruleId } });
      if (!rule || rule.deletedAt) throw new NotFoundException('Qoida topilmadi');
      if (rule.state === 'RETIRED') throw new ConflictException('Allaqachon nafaqada');
      if (input.replacedById) {
        const rep = await tx.grammarRule.findUnique({ where: { id: input.replacedById } });
        if (!rep || rep.deletedAt || rep.state !== 'OPEN' || rep.id === ruleId) throw new BadRequestException('Almashtiruvchi qoida yaroqsiz');
      }
      const used = await this.usage(ruleId, tx);
      if (used.length && !input.replacedById && !input.acknowledgeUsage) {
        throw new ConflictException({ message: 'Qoida nashr qilingan darslarda ishlatilmoqda: almashtiruvchi ko‘rsating yoki ogohlantirishni tasdiqlang', usedBy: used });
      }
      await tx.grammarRule.update({ where: { id: ruleId }, data: { state: 'RETIRED', replacedById: input.replacedById ?? null, retiredReason: input.reason } });
      await this.audit(tx, { actor, ruleId, action: 'rule.retire', note: input.reason, meta: { replacedById: input.replacedById ?? null, usedBy: used.length } });
      return { state: 'RETIRED', note: 'Nafaqa keyingi release aktivlashganda kuchga kiradi' };
    });
  }
}
