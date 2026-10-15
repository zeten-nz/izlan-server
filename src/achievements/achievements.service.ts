import { ConflictException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACHIEVEMENT_RULES_V1, ACHIEVEMENT_RULES_VERSION, SHOWCASE_MAX, evaluateRules, type Metrics } from './achievement.rules';

type Db = Prisma.TransactionClient | PrismaService;

export interface Earned {
  slug: string;
  name: string;
}

@Injectable()
export class AchievementsService {
  private readonly log = new Logger('Achievements');
  constructor(private readonly prisma: PrismaService) {}

  /** Haqiqiy backend ma'lumotlaridan ko'rsatkichlar (dars/test/mavzu yozuvlari). Frontend hodisasiga tayanilmaydi. */
  async metrics(db: Db, userId: string): Promise<Metrics> {
    const rows = await db.$queryRaw<Metrics[]>`
      SELECT
        (SELECT COUNT(DISTINCT v."lessonId") FROM "LessonProgress" lp JOIN "LessonVersion" v ON v."id" = lp."versionId"
          WHERE lp."userId" = ${userId} AND lp."completedAt" IS NOT NULL)::int AS "completedLessons",
        (SELECT COUNT(*) FROM "TopicCompletion" WHERE "userId" = ${userId})::int AS "completedTopics",
        (SELECT COUNT(*) FROM (
            SELECT q."topicId" FROM "QuizAttempt" a
              JOIN "QuizVersion" qv ON qv."id" = a."versionId"
              JOIN "TopicQuiz" q ON q."id" = qv."quizId"
            WHERE a."userId" = ${userId}
            GROUP BY q."topicId" HAVING MAX(a."scorePct") >= 90
          ) t)::int AS "quiz90Topics",
        (SELECT COUNT(DISTINCT d) FROM (
            SELECT (lp."completedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent')::date AS d
              FROM "LessonProgress" lp WHERE lp."userId" = ${userId} AND lp."completedAt" IS NOT NULL
            UNION ALL
            SELECT (a."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent')::date
              FROM "QuizAttempt" a WHERE a."userId" = ${userId}
          ) x)::int AS "activeDays"`;
    return rows[0] ?? { completedLessons: 0, completedTopics: 0, quiz90Topics: 0, activeDays: 0 };
  }

  /**
   * O'quv hodisasi (dars/test) tranzaksiyasi ICHIDA chaqiriladi: yangi badge'lar shu yerda yoziladi.
   * Badge xatosi o'quv oqimini buzmasligi uchun SAVEPOINT ichida: xato bo'lsa faqat badge qismi qaytariladi,
   * tugatish/XP saqlanadi va keyingi hodisa yoki reconcileUser() uni qayta tekshiradi.
   * Parallel chaqiruvlar: (userId, achievementId) UNIQUE + skipDuplicates, takroriy badge imkonsiz.
   */
  async evaluateInTx(tx: Prisma.TransactionClient, userId: string, trigger: string): Promise<Earned[]> {
    await tx.$executeRaw`SAVEPOINT achievement_eval`;
    try {
      const earned = await this.grantEligible(tx, userId, trigger);
      await tx.$executeRaw`RELEASE SAVEPOINT achievement_eval`;
      return earned;
    } catch (e) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT achievement_eval`;
      this.log.error(`achievement tekshiruvi bajarilmadi (user=${userId}, trigger=${trigger}): ${(e as Error).message}`);
      return [];
    }
  }

  /** Mos va hali olinmagan faol badge'larni beradi. XP/IZL/bezak BERMAYDI. */
  async grantEligible(db: Db, userId: string, trigger: string): Promise<Earned[]> {
    const metrics = await this.metrics(db, userId);
    const progress = evaluateRules(metrics);
    const met = progress.filter((p) => p.earned).map((p) => p.slug);
    if (met.length === 0) return [];

    const defs = await db.achievementDefinition.findMany({ where: { slug: { in: met }, active: true } });
    if (defs.length === 0) return [];
    const have = await db.userAchievement.findMany({ where: { userId, achievementId: { in: defs.map((d) => d.id) } }, select: { achievementId: true } });
    const haveIds = new Set(have.map((h) => h.achievementId));
    const fresh = defs.filter((d) => !haveIds.has(d.id));
    if (fresh.length === 0) return [];

    const bySlug = new Map(progress.map((p) => [p.slug, p]));
    const res = await db.userAchievement.createManyAndReturn({
      data: fresh.map((d) => ({
        userId,
        achievementId: d.id,
        ruleVersion: ACHIEVEMENT_RULES_VERSION,
        reason: {
          trigger,
          metric: ACHIEVEMENT_RULES_V1.find((r) => r.slug === d.slug)?.metric ?? null,
          value: bySlug.get(d.slug)?.value ?? null,
          target: bySlug.get(d.slug)?.target ?? null,
        },
      })),
      skipDuplicates: true,
      select: { achievementId: true },
    });
    const created = new Set(res.map((r) => r.achievementId));
    return fresh.filter((d) => created.has(d.id)).map((d) => ({ slug: d.slug, name: d.name }));
  }

  /** Eski foydalanuvchilar uchun: XP bermaydi, faqat haqiqatan earned badge'lar; idempotent. */
  async reconcileUser(userId: string): Promise<Earned[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'xp:' + userId}, 0))`;
      return this.grantEligible(tx, userId, 'reconcile');
    });
  }

  // ───── O'qish ─────

  async listForUser(userId: string) {
    const [defs, mine, metrics] = await Promise.all([
      this.prisma.achievementDefinition.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.userAchievement.findMany({ where: { userId } }),
      this.metrics(this.prisma, userId),
    ]);
    const progress = new Map(evaluateRules(metrics).map((p) => [p.slug, p]));
    const earnedBy = new Map(mine.map((m) => [m.achievementId, m]));
    const rules = new Map(ACHIEVEMENT_RULES_V1.map((r) => [r.slug, r]));
    const items = defs
      .filter((d) => d.active || earnedBy.has(d.id)) // faol bo'lmagan, lekin olingan badge ko'rinadi
      .map((d) => {
        const e = earnedBy.get(d.id);
        const p = progress.get(d.slug);
        return {
          slug: d.slug,
          name: d.name,
          description: d.description,
          requirement: rules.get(d.slug)?.requirement ?? '',
          earned: !!e,
          earnedAt: e?.earnedAt ?? null,
          showcaseOrder: e?.showcaseOrder ?? null,
          progress: e ? null : p ? { value: p.value, target: p.target, pct: p.pct } : null,
        };
      });
    return { showcaseMax: SHOWCASE_MAX, items };
  }

  /** Asosiy badge'lar (≤3): faqat o'zi olgan badge'lar; ownership serverda tekshiriladi. Bo'sh ro'yxat = tozalash. */
  async setShowcase(userId: string, slugs: string[]) {
    const uniq = [...new Set(slugs)];
    if (uniq.length !== slugs.length) throw new UnprocessableEntityException('Badge takrorlangan');
    if (uniq.length > SHOWCASE_MAX) throw new UnprocessableEntityException(`Ko'pi bilan ${SHOWCASE_MAX} ta badge tanlash mumkin`);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'showcase:' + userId}, 0))`;
      const owned = await tx.userAchievement.findMany({ where: { userId, achievement: { slug: { in: uniq } } }, include: { achievement: true } });
      if (owned.length !== uniq.length) throw new ConflictException("Faqat o'zingiz olgan badge'larni tanlash mumkin");
      await tx.userAchievement.updateMany({ where: { userId, showcaseOrder: { not: null } }, data: { showcaseOrder: null } });
      for (const [i, slug] of uniq.entries()) {
        const row = owned.find((o) => o.achievement.slug === slug);
        if (row) await tx.userAchievement.update({ where: { id: row.id }, data: { showcaseOrder: i + 1 } });
      }
      return { showcase: uniq };
    });
  }

  // ───── Admin ─────

  async adminList() {
    const [defs, counts] = await Promise.all([
      this.prisma.achievementDefinition.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.userAchievement.groupBy({ by: ['achievementId'], _count: { _all: true } }),
    ]);
    const c = new Map(counts.map((x) => [x.achievementId, x._count._all]));
    const rules = new Map(ACHIEVEMENT_RULES_V1.map((r) => [r.slug, r]));
    return {
      ruleVersion: ACHIEVEMENT_RULES_VERSION,
      items: defs.map((d) => {
        const r = rules.get(d.slug);
        return {
          id: d.id,
          slug: d.slug,
          name: d.name,
          description: d.description,
          active: d.active,
          holders: c.get(d.id) ?? 0,
          rule: r ? { metric: r.metric, target: r.target, requirement: r.requirement } : null,
        };
      }),
    };
  }

  async adminSetActive(actorId: string, id: string, active: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.achievementDefinition.findUnique({ where: { id } });
      if (!cur) throw new UnprocessableEntityException('Achievement topilmadi');
      const hasRule = ACHIEVEMENT_RULES_V1.some((r) => r.slug === cur.slug);
      if (active && !hasRule) throw new UnprocessableEntityException("Bu achievement uchun qoida yo'q: faollashtirib bo'lmaydi");
      const upd = await tx.achievementDefinition.update({ where: { id }, data: { active } });
      await tx.auditLog.create({
        data: { actorId, action: 'achievement.active', entity: 'AchievementDefinition', entityId: id, meta: { slug: cur.slug, from: cur.active, to: active } },
      });
      return { id: upd.id, active: upd.active };
    });
  }
}
