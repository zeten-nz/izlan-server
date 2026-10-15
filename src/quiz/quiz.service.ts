import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PublicUser } from '../auth/auth.service';
import { LearningService } from '../learning/learning.service';
import { PrismaService } from '../prisma/prisma.service';
import { quizTiersReached, scorePct } from '../xp/xp.engine';
import { ACTIVE_XP_POLICY } from '../xp/xp.policy';
import { XpService } from '../xp/xp.service';
import { AchievementsService } from '../achievements/achievements.service';
import { grade, parseQuestions, studentView, type QuizQuestion } from './quiz.rules';

/** Mavzu testi: ustoz boshqaruvi (vakolat tekshiruvi bilan) va o'quvchi topshirishi (backend baholaydi, XP beradi). */
@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: LearningService,
    private readonly xp: XpService,
    private readonly achievements: AchievementsService,
  ) {}

  // ───────────── Ustoz / admin ─────────────

  /**
   * Vakolat: ADMIN — hamma mavzu; USTOZ — o'zi kamida bitta dars yozgan mavzu yoki o'zi yaratgan test.
   * (Ustozga mavzu biriktirish modeli yo'q; mavjud "o'z darsi" qoidasi bilan mos.)
   */
  private async assertCanManage(user: PublicUser, topicId: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId }, select: { id: true, title: true } });
    if (!topic) throw new NotFoundException('Mavzu topilmadi');
    if (user.role === 'ADMIN') return topic;
    const [ownLessons, ownQuiz] = await Promise.all([
      this.prisma.lesson.count({ where: { topicId, authorId: user.id } }),
      this.prisma.topicQuiz.count({ where: { topicId, authorId: user.id } }),
    ]);
    if (ownLessons === 0 && ownQuiz === 0) throw new ForbiddenException("Bu mavzu uchun test boshqarish huquqingiz yo'q");
    return topic;
  }

  async staffGet(user: PublicUser, topicId: string) {
    const topic = await this.assertCanManage(user, topicId);
    const quiz = await this.prisma.topicQuiz.findUnique({
      where: { topicId },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!quiz) return { topic, quiz: null };
    const draft = quiz.versions.find((v) => v.status === 'DRAFT') ?? null;
    const published = quiz.versions.find((v) => v.status === 'PUBLISHED') ?? null;
    return {
      topic,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        draft: draft && { rev: draft.rev, questions: draft.questions },
        published: published && { publishedAt: published.publishedAt, count: (published.questions as unknown[]).length },
      },
    };
  }

  async staffSaveDraft(user: PublicUser, topicId: string, input: { title: string; questions: unknown; rev?: number }) {
    await this.assertCanManage(user, topicId);
    const parsed = parseQuestions(input.questions);
    if (!parsed.ok) throw new UnprocessableEntityException(parsed.error);
    const title = input.title.trim();

    return this.prisma.$transaction(async (tx) => {
      let quiz = await tx.topicQuiz.findUnique({ where: { topicId } });
      if (!quiz) {
        quiz = await tx.topicQuiz.create({ data: { topicId, authorId: user.id, title } });
      } else if (quiz.title !== title) {
        quiz = await tx.topicQuiz.update({ where: { id: quiz.id }, data: { title } });
      }
      const draft = await tx.quizVersion.findFirst({ where: { quizId: quiz.id, status: 'DRAFT' } });
      const data = parsed.questions as unknown as Prisma.InputJsonValue;
      if (!draft) {
        const created = await tx.quizVersion.create({ data: { quizId: quiz.id, status: 'DRAFT', questions: data } });
        return { quizId: quiz.id, rev: created.rev };
      }
      if (input.rev !== undefined && input.rev !== draft.rev) {
        throw new ConflictException("Test boshqa joyda o'zgargan. Sahifani yangilang");
      }
      // Optimistic lock: rev mos kelsagina yangilanadi
      const res = await tx.quizVersion.updateMany({
        where: { id: draft.id, rev: draft.rev },
        data: { questions: data, rev: { increment: 1 } },
      });
      if (res.count !== 1) throw new ConflictException("Test boshqa joyda o'zgargan. Sahifani yangilang");
      return { quizId: quiz.id, rev: draft.rev + 1 };
    });
  }

  async staffPublish(user: PublicUser, topicId: string) {
    await this.assertCanManage(user, topicId);
    const quiz = await this.prisma.topicQuiz.findUnique({ where: { topicId } });
    if (!quiz) throw new NotFoundException('Avval testni saqlang');
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.quizVersion.findFirst({ where: { quizId: quiz.id, status: 'DRAFT' } });
      if (!draft) throw new NotFoundException('Qoralama topilmadi');
      const parsed = parseQuestions(draft.questions, { forPublish: true });
      if (!parsed.ok) throw new UnprocessableEntityException(parsed.error);
      // Eski nashr o'zgarmas snapshot sifatida qoladi (urinishlar unga bog'langan); eng so'nggisi amal qiladi
      await tx.quizVersion.create({
        data: { quizId: quiz.id, status: 'PUBLISHED', questions: parsed.questions as unknown as Prisma.InputJsonValue, publishedAt: new Date() },
      });
      return { published: true, count: parsed.questions.length };
    });
  }

  // ───────────── O'quvchi ─────────────

  private async latestPublished(topicId: string) {
    const quiz = await this.prisma.topicQuiz.findUnique({ where: { topicId } });
    if (!quiz) return null;
    const version = await this.prisma.quizVersion.findFirst({
      where: { quizId: quiz.id, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
    return version ? { quiz, version } : null;
  }

  private tiersView(earned: Set<number>) {
    return ACTIVE_XP_POLICY.quizTiers.map((t) => ({ minPct: t.minPct, xp: t.xp, earned: earned.has(t.minPct) }));
  }

  async studentView(userId: string, topicId: string) {
    await this.learning.topic(userId, topicId); // mavzu o'quvchiga ochiqligini tekshiradi
    const found = await this.latestPublished(topicId);
    const maxXp = ACTIVE_XP_POLICY.quizTiers.reduce((s, t) => s + t.xp, 0);
    if (!found) return { available: false as const, maxXp };

    const [earnedRows, best, attempts] = await Promise.all([
      this.prisma.xpLedger.findMany({
        where: { userId, topicId, eventType: 'QUIZ_TIER' },
        select: { dedupeKey: true },
      }),
      this.prisma.quizAttempt.findFirst({
        where: { userId, version: { quizId: found.quiz.id } },
        orderBy: [{ scorePct: 'desc' }, { createdAt: 'asc' }],
        select: { scorePct: true },
      }),
      this.prisma.quizAttempt.count({ where: { userId, version: { quizId: found.quiz.id } } }),
    ]);
    const earned = new Set(earnedRows.map((r) => Number(r.dedupeKey.split(':').pop())));
    return {
      available: true as const,
      quizId: found.quiz.id,
      title: found.quiz.title,
      questions: studentView(found.version.questions as unknown as QuizQuestion[]),
      bestScorePct: best?.scorePct ?? null,
      attempts,
      tiers: this.tiersView(earned),
      maxXp,
    };
  }

  async submit(userId: string, topicId: string, answers: unknown) {
    await this.learning.topic(userId, topicId);
    const found = await this.latestPublished(topicId);
    if (!found) throw new NotFoundException('Bu mavzuda test hali yo‘q');
    const parsed = parseQuestions(found.version.questions);
    if (!parsed.ok) throw new UnprocessableEntityException('Test hozircha mavjud emas');

    const g = grade(parsed.questions, answers);
    const pct = scorePct(g.correct, g.total);
    const reached = quizTiersReached(g.correct, g.total);

    return this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.create({
        data: { userId, versionId: found.version.id, answers: g.answers, correctCount: g.correct, total: g.total, scorePct: pct },
      });
      // Faqat ilgari olinmagan bo'sag'alar: dedupe kaliti mavzu bo'yicha (versiya/urinishga bog'liq emas)
      const events = [];
      for (const tier of ACTIVE_XP_POLICY.quizTiers) {
        if (!reached.includes(tier.minPct)) continue;
        events.push(
          await this.xp.grant(tx, {
            userId,
            eventType: 'QUIZ_TIER',
            sourceId: found.quiz.id,
            topicId,
            baseXp: tier.xp,
            dedupeKey: `quiz:${userId}:${topicId}:${tier.minPct}`,
            meta: { label: `Mavzu testi ${tier.minPct}%`, quizId: found.quiz.id },
          }),
        );
      }
      const award = await this.xp.award(tx, userId, events);
      const earnedBadges = await this.achievements.evaluateInTx(tx, userId, 'quiz-submit');
      return {
        achievements: earnedBadges,
        scorePct: pct,
        correct: g.correct,
        total: g.total,
        results: g.results,
        reachedTiers: reached,
        xp: award,
      };
    });
  }
}
