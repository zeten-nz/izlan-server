import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type LessonVersion } from '@prisma/client';
import { LearningService } from '../learning/learning.service';
import { PrismaService } from '../prisma/prisma.service';
import { isInteractive, parseDoc, type LessonDoc } from './doc.schema';
import { checkAnswer, projectPage, requiredProgress, reviewProgress, unlockedCount, type AttemptState } from './player';
import { isContentPreparing, isTopicCompleted } from '../learning/progress';
import { XpService } from '../xp/xp.service';
import { AchievementsService } from '../achievements/achievements.service';

@Injectable()
export class StudentLessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: LearningService,
    private readonly xp: XpService,
    private readonly achievements: AchievementsService,
  ) {}

  /** Mavzudagi nashr qilingan darslar (mavzu o'quvchiga ochiq bo'lsa). Tartib: sortOrder, createdAt, id. */
  async listForTopic(userId: string, topicId: string) {
    await this.learning.topic(userId, topicId); // ruxsatni tekshiradi (403/404)
    const lessons = await this.prisma.lesson.findMany({
      where: { topicId, publishedVersionId: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: { published: true },
    });
    const done = await this.prisma.lessonProgress.findMany({
      where: { userId, completedAt: { not: null }, version: { lessonId: { in: lessons.map((l) => l.id) } } },
      select: { version: { select: { lessonId: true } } },
    });
    const doneIds = new Set(done.map((d) => d.version.lessonId));
    const counts = { total: lessons.length, completed: lessons.filter((l) => doneIds.has(l.id)).length };
    return {
      /** "N / M dars tugatildi" — o'zlashtirish foizi EMAS */
      topic: {
        totalLessons: counts.total,
        completedLessons: counts.completed,
        topicCompleted: isTopicCompleted(counts),
        contentPreparing: isContentPreparing(counts),
      },
      lessons: lessons.map((l) => {
        const parsed = l.published ? parseDoc(l.published.doc) : null;
        return { id: l.id, title: l.title, pages: parsed?.ok ? parsed.doc.pages.length : 0, completed: doneIds.has(l.id) };
      }),
    };
  }

  /**
   * Versiya tanlash:
   * - Dars istalgan versiyada tugatilgan bo'lsa (sticky completion) — eng so'nggi nashr "qayta ko'rib chiqish"
   *   rejimida; nashrdan olingan bo'lsa — tugatilgan versiyaning o'zi. Tugatish holati o'zgarmaydi.
   * - Aks holda: o'quvchi boshlagan tugallanmagan versiyada davom etadi (version pinning); bo'lmasa joriy nashr.
   */
  private async resolveVersion(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Dars topilmadi');
    const done = await this.firstCompletion(this.prisma, userId, lessonId);
    let version: LessonVersion | null = null;
    if (done) {
      version = lesson.publishedVersionId ? await this.prisma.lessonVersion.findUnique({ where: { id: lesson.publishedVersionId } }) : done.version;
    } else {
      const ongoing = await this.prisma.lessonProgress.findFirst({
        where: { userId, completedAt: null, version: { lessonId } },
        orderBy: { startedAt: 'desc' },
        include: { version: true },
      });
      version = ongoing?.version ?? (lesson.publishedVersionId ? await this.prisma.lessonVersion.findUnique({ where: { id: lesson.publishedVersionId } }) : null);
    }
    if (!version) throw new NotFoundException('Dars hali nashr qilinmagan');
    await this.learning.topic(userId, lesson.topicId);
    const parsed = parseDoc(version.doc);
    if (!parsed.ok) throw new UnprocessableEntityException("Dars hujjati buzilgan");
    return { lesson, version, doc: parsed.doc, completedAt: done?.completedAt ?? null };
  }

  /**
   * Daftar manbasini tekshiradi: dars o'quvchiga ochiq (nashr qilingan, mavzu ochilgan) bo'lishi va
   * (berilgan bo'lsa) sahifa shu versiya hujjatida real mavjud bo'lishi shart. Mavjud kirish qoidalarini qayta ishlatadi.
   */
  async locate(userId: string, lessonId: string, pageId?: string) {
    const { lesson, doc } = await this.resolveVersion(userId, lessonId);
    const page = pageId ? doc.pages.find((p) => p.id === pageId) : undefined;
    if (pageId && !page) throw new NotFoundException('Sahifa topilmadi');
    const topic = await this.prisma.topic.findUniqueOrThrow({ where: { id: lesson.topicId }, include: { level: true } });
    return {
      lesson: { id: lesson.id, title: lesson.title, topicId: lesson.topicId, directionId: topic.level.directionId },
      page: page ? { id: page.id, title: page.title } : null,
      pageIds: doc.pages.map((p) => p.id),
    };
  }

  /** O'quvchining shu darsdagi birinchi (eng eski) tugatishi — istalgan versiyada. */
  private firstCompletion(db: Pick<PrismaService, 'lessonProgress'> | Prisma.TransactionClient, userId: string, lessonId: string) {
    return db.lessonProgress.findFirst({
      where: { userId, completedAt: { not: null }, version: { lessonId } },
      orderBy: { completedAt: 'asc' },
      include: { version: true },
    });
  }

  private async attemptMap(userId: string, versionId: string, db: Pick<PrismaService, 'lessonBlockAttempt'> | Prisma.TransactionClient = this.prisma) {
    const rows = await db.lessonBlockAttempt.findMany({ where: { userId, versionId } });
    const map = new Map<string, AttemptState & { correct: boolean; tries: number; response: unknown }>();
    for (const r of rows) map.set(r.blockId, { answered: true, everCorrect: r.everCorrect, correct: r.correct, tries: r.tries, response: r.response });
    return map;
  }

  private buildView(
    lesson: { id: string; title: string; topicId: string },
    versionId: string,
    doc: LessonDoc,
    attempts: Awaited<ReturnType<StudentLessonsService['attemptMap']>>,
    progress: { completedAt: Date | null; lastPageIndex: number | null; visitedPageIds: string[] },
    stickyCompleted: boolean,
  ) {
    const { count, allDone } = unlockedCount(doc, attempts);
    const visibleIds = new Set(doc.pages.slice(0, count).flatMap((p) => p.blocks.map((b) => b.id)));
    const review = reviewProgress(doc, progress.visitedPageIds);
    const pageIds = new Set(doc.pages.map((p) => p.id));
    return {
      lesson: { id: lesson.id, title: lesson.title, topicId: lesson.topicId },
      totalPages: doc.pages.length,
      /** Ochiq sahifalar (gating). Ko'rilgan sahifa va tugatishdan ALOHIDA. */
      unlocked: count,
      allDone,
      /** Sticky: dars istalgan versiyada tugatilgan. Yangi versiyani ko'rish uni bekor qilmaydi. */
      completed: stickyCompleted,
      /** Tugatilgan dars hozirgi nashrda qayta ko'rilmoqda */
      review: stickyCompleted && !progress.completedAt,
      /** Davom ettirish uchun oxirgi tasdiqlangan sahifa (progress emas) */
      lastPageIndex: progress.lastPageIndex !== null && progress.lastPageIndex < doc.pages.length ? progress.lastPageIndex : null,
      /** Haqiqatan ochib ko'rilgan sahifalar (joriy versiyadagilar) */
      visitedPageIds: progress.visitedPageIds.filter((id) => pageIds.has(id)),
      progress: {
        review: { total: review.total, seen: review.seen, pct: review.pct },
        required: requiredProgress(doc, attempts),
      },
      pages: doc.pages.slice(0, count).map(projectPage),
      attempts: Object.fromEntries(
        [...attempts]
          .filter(([id]) => visibleIds.has(id))
          .map(([id, a]) => [id, { correct: a.correct, everCorrect: a.everCorrect, tries: a.tries, response: a.response }]),
      ),
    };
  }

  private async ensureProgress(userId: string, versionId: string) {
    return this.prisma.lessonProgress.upsert({
      where: { userId_versionId: { userId, versionId } },
      create: { userId, versionId },
      update: {},
    });
  }

  async view(userId: string, lessonId: string) {
    const { lesson, version, doc, completedAt } = await this.resolveVersion(userId, lessonId);
    const progress = await this.ensureProgress(userId, version.id);
    const attempts = await this.attemptMap(userId, version.id);
    return this.buildView(lesson, version.id, doc, attempts, progress, !!completedAt || !!progress.completedAt);
  }

  async answer(userId: string, lessonId: string, blockId: string, payload: unknown) {
    const { lesson, version, doc, completedAt } = await this.resolveVersion(userId, lessonId);
    const attempts = await this.attemptMap(userId, version.id);
    const { count } = unlockedCount(doc, attempts);
    // Faqat ochilgan sahifadagi blokka javob berish mumkin
    const block = doc.pages.slice(0, count).flatMap((p) => p.blocks).find((b) => b.id === blockId);
    if (!block) {
      const exists = doc.pages.some((p) => p.blocks.some((b) => b.id === blockId));
      if (exists) throw new ForbiddenException('Bu sahifa hali ochilmagan');
      throw new NotFoundException('Blok topilmadi');
    }
    if (!isInteractive(block)) throw new BadRequestException("Bu blokka javob berilmaydi");
    const result = checkAnswer(block, payload);
    if (!result) throw new UnprocessableEntityException("Javob formati noto'g'ri");

    const key = { userId_versionId_blockId: { userId, versionId: version.id, blockId } };
    const response = payload as Prisma.InputJsonValue;
    // Noto'g'ri urinishlar soni Daftar → Xatolarim uchun; baholash natijasiga ta'sir qilmaydi
    const outcome = { correct: result.correct, response, ...(result.correct ? { everCorrect: true } : { wrongTries: { increment: 1 } }) };
    try {
      await this.prisma.lessonBlockAttempt.upsert({
        where: key,
        create: { userId, versionId: version.id, blockId, correct: result.correct, everCorrect: result.correct, wrongTries: result.correct ? 0 : 1, response },
        update: { tries: { increment: 1 }, ...outcome },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      // Ikki so'rov bir vaqtda birinchi urinishni yaratmoqchi bo'ldi: ikkinchisi yangilaydi
      await this.prisma.lessonBlockAttempt.update({ where: key, data: { tries: { increment: 1 }, ...outcome } });
    }
    const progress = await this.ensureProgress(userId, version.id);
    return {
      result,
      view: this.buildView(lesson, version.id, doc, await this.attemptMap(userId, version.id), progress, !!completedAt || !!progress.completedAt),
    };
  }

  /**
   * Sahifa ochib ko'rildi. Ko'rilgan sahifalar faqat QO'SHILADI (parallel so'rovlarda ham yo'qolmaydi).
   * Faqat shu versiya hujjatidagi va ochiq (gating) sahifa qabul qilinadi. Bu tugatish EMAS.
   */
  async visit(userId: string, lessonId: string, pageId: string) {
    const { version, doc } = await this.resolveVersion(userId, lessonId);
    const index = doc.pages.findIndex((p) => p.id === pageId);
    if (index < 0) throw new NotFoundException('Sahifa topilmadi');
    const { count } = unlockedCount(doc, await this.attemptMap(userId, version.id));
    if (index >= count) throw new ForbiddenException('Bu sahifa hali ochilmagan');
    await this.ensureProgress(userId, version.id);
    // Bitta atomik UPDATE: o'qish-o'zgartirish-yozish yo'q, shuning uchun parallel tashriflar bir-birini bosmaydi
    await this.prisma.$executeRaw`
      UPDATE "LessonProgress"
      SET "visitedPageIds" = CASE WHEN ${pageId} = ANY("visitedPageIds") THEN "visitedPageIds" ELSE array_append("visitedPageIds", ${pageId}) END,
          "lastPageIndex" = ${index}
      WHERE "userId" = ${userId} AND "versionId" = ${version.id}`;
    const row = await this.prisma.lessonProgress.findUniqueOrThrow({ where: { userId_versionId: { userId, versionId: version.id } } });
    const review = reviewProgress(doc, row.visitedPageIds);
    return { lastPageIndex: row.lastPageIndex, visitedPageIds: row.visitedPageIds.filter((id) => doc.pages.some((p) => p.id === id)), review };
  }

  /**
   * Darsni tugatish — IDEMPOTENT. Kalit: (o'quvchi, dars) — versiya emas (sticky completion).
   * - Dars istalgan versiyada allaqachon tugatilgan bo'lsa: hech narsa o'zgarmaydi, `firstTime: false`.
   * - Parallel so'rovlar (o'quvchi, dars) bo'yicha advisory qulf bilan ketma-ketlashtiriladi.
   * - XP faqat `firstTime: true` da, `lesson:{userId}:{lessonId}` dedupe kaliti bilan va shu tranzaksiyada beriladi.
   */
  async complete(userId: string, lessonId: string) {
    const { lesson, version, doc } = await this.resolveVersion(userId, lessonId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ':' + lessonId}, 0))`;

      const existing = await this.firstCompletion(tx, userId, lessonId);
      if (existing?.completedAt) return { completed: true, completedAt: existing.completedAt, firstTime: false, xp: null, achievements: [] };

      const { allDone } = unlockedCount(doc, await this.attemptMap(userId, version.id, tx));
      if (!allDone) throw new ConflictException('Avval barcha majburiy sahifalarni bajaring');

      const now = new Date();
      await tx.lessonProgress.upsert({
        where: { userId_versionId: { userId, versionId: version.id } },
        create: { userId, versionId: version.id, completedAt: now },
        update: { completedAt: now },
      });
      // Tugatish mavzu ochilishini oshirishi mumkin (faqat oshadi)
      await this.learning.advanceAfterCompletion(tx, userId, lesson.topicId);
      // XP shu tranzaksiyada: tugatish va mukofot birga yoziladi yoki birga qaytariladi
      const xp = await this.xp.onLessonFirstCompleted(tx, userId, { id: lesson.id, topicId: lesson.topicId }, now);
      // Badge: shu tranzaksiyada (savepoint ichida), xato o'quv oqimini buzmaydi
      const earnedBadges = await this.achievements.evaluateInTx(tx, userId, 'lesson-complete');
      return { completed: true, completedAt: now, firstTime: true, xp, achievements: earnedBadges };
    });
  }
}
