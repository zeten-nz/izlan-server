import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlacementAttempt } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveFrontier,
  isContentPreparing,
  isTopicCompleted,
  mergeFrontier,
  parseFrontier,
  topicStateOf,
  type TopicCounts,
} from './progress';
import {
  claimedTestSize,
  judgeClaimed,
  nextUnknownStep,
  pct,
  pickDiverse,
  type Answer,
  type Outcome,
} from './placement.engine';

export const MAX_DIRECTIONS = 2;

type Db = PrismaService | Prisma.TransactionClient;
type UserDirectionFull = Prisma.UserDirectionGetPayload<{
  include: { direction: { include: { levels: { include: { topics: true } } } } };
}>;
const EMPTY_COUNTS: TopicCounts = { total: 0, completed: 0 };

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Katalog va umumiy ko'rinish ─────────────

  async catalog() {
    const [directions, withQuestions] = await Promise.all([
      this.prisma.direction.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { levels: { orderBy: { ord: 'asc' } } },
      }),
      this.prisma.question.groupBy({ by: ['directionId'], _count: { _all: true } }),
    ]);
    const hasQuestions = new Set(withQuestions.map((q) => q.directionId));
    return directions.map((d) => ({
      id: d.id,
      slug: d.slug,
      kind: d.kind,
      title: d.title,
      description: d.description,
      active: d.active,
      /** Daraja aniqlash testi savollari bormi: yo'q bo'lsa o'quvchiga faqat "0 dan boshlash" ko'rsatiladi */
      placementReady: hasQuestions.has(d.id),
      levels: d.levels.map((l) => ({
        ord: l.ord,
        code: l.code,
        title: l.title,
        summary: l.summary,
        canDo: l.canDo,
        vocabHint: l.vocabHint,
      })),
    }));
  }

  async overview(userId: string) {
    const [user, userDirections] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { directionPromptDismissedAt: true } }),
      this.prisma.userDirection.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: {
          direction: { include: { levels: { orderBy: { ord: 'asc' }, include: { topics: { orderBy: { ord: 'asc' } } } } } },
        },
      }),
    ]);
    const inProgress = await this.prisma.placementAttempt.findMany({
      where: { userId, done: false },
      select: { id: true, directionId: true, mode: true },
    });

    const { frontiers, counts } = await this.frontiersFor(userId, userDirections);

    const directions = userDirections.map((ud) => {
      const current = ud.currentLevelOrd;
      const frontier = frontiers.get(ud.directionId) ?? 1;
      const levels = ud.direction.levels.map((lv) => {
        const levelState = current === null ? 'locked' : lv.ord < current ? 'done' : lv.ord === current ? 'current' : 'locked';
        return {
          ord: lv.ord,
          code: lv.code,
          title: lv.title,
          summary: lv.summary,
          vocabHint: lv.vocabHint,
          canDo: lv.canDo,
          state: levelState,
          topics: lv.topics.map((t) => {
            // Dars sonlari faqat joriy daraja uchun hisoblanadi (boshqa darajalarda null)
            const c = lv.ord === current ? (counts.get(t.id) ?? EMPTY_COUNTS) : null;
            return {
              id: t.id,
              ord: t.ord,
              title: t.title,
              state: topicStateOf(current, ud.levelAccess, lv.ord, t.ord, frontier),
              lessons: c
                ? { total: c.total, completed: c.completed, topicCompleted: isTopicCompleted(c), contentPreparing: isContentPreparing(c) }
                : null,
            };
          }),
        };
      });
      const currentLevel = levels.find((l) => l.state === 'current');
      const currentTopic = currentLevel?.topics.find((t) => t.state === 'current') ?? null;
      return {
        directionId: ud.directionId,
        slug: ud.direction.slug,
        title: ud.direction.title,
        kind: ud.direction.kind,
        currentLevelOrd: current,
        levelAccess: ud.levelAccess,
        placedBy: ud.placedBy,
        levels,
        currentTopic: currentTopic && currentLevel ? { ...currentTopic, levelCode: currentLevel.code } : null,
        placementInProgress: inProgress.find((p) => p.directionId === ud.directionId)?.id ?? null,
      };
    });

    return { promptDismissed: user.directionPromptDismissedAt !== null, directions };
  }

  // ───────────── Mavzu progressi va ochilishi (frontier) ─────────────

  /** Mavzular bo'yicha: nashr qilingan darslar soni va o'quvchi tugatganlari (istalgan versiyada — sticky). */
  async topicCounts(userId: string, topicIds: string[], db: Db = this.prisma): Promise<Map<string, TopicCounts>> {
    const out = new Map<string, TopicCounts>(topicIds.map((id) => [id, { total: 0, completed: 0 }]));
    if (topicIds.length === 0) return out;
    const lessons = await db.lesson.findMany({
      where: { topicId: { in: topicIds }, publishedVersionId: { not: null } },
      select: { id: true, topicId: true },
    });
    const done = lessons.length
      ? await db.lessonProgress.findMany({
          where: { userId, completedAt: { not: null }, version: { lessonId: { in: lessons.map((l) => l.id) } } },
          select: { version: { select: { lessonId: true } } },
        })
      : [];
    const doneIds = new Set(done.map((d) => d.version.lessonId));
    for (const l of lessons) {
      const c = out.get(l.topicId)!;
      c.total++;
      if (doneIds.has(l.id)) c.completed++;
    }
    return out;
  }

  /**
   * Har yo'nalishning joriy darajasi uchun ochilgan eng yuqori mavzu tartibi.
   * Hosila hisob saqlangandan katta bo'lsa — saqlanadi (faqat oshadi, hech qachon kamaymaydi).
   */
  private async frontiersFor(userId: string, uds: UserDirectionFull[], db: Db = this.prisma) {
    const topicIds: string[] = [];
    for (const ud of uds) {
      const lv = ud.direction.levels.find((l) => l.ord === ud.currentLevelOrd);
      if (lv) topicIds.push(...lv.topics.map((t) => t.id));
    }
    const counts = await this.topicCounts(userId, topicIds, db);
    const frontiers = new Map<string, number>();
    for (const ud of uds) {
      const lv = ud.direction.levels.find((l) => l.ord === ud.currentLevelOrd);
      if (!lv || ud.currentLevelOrd === null) continue;
      const stored = parseFrontier(ud.topicFrontier)[String(ud.currentLevelOrd)];
      const derived = deriveFrontier(lv.topics.map((t) => ({ ord: t.ord, counts: counts.get(t.id) ?? EMPTY_COUNTS })));
      const merged = mergeFrontier(stored, derived);
      if (merged > (stored ?? 1)) await this.raiseFrontier(db, ud.id, ud.currentLevelOrd, merged);
      frontiers.set(ud.directionId, merged);
    }
    return { frontiers, counts };
  }

  /** Frontier'ni qator qulfi ostida faqat oshiradi (parallel so'rovlar bir-birini kamaytirmaydi). */
  private async raiseFrontier(db: Db, userDirectionId: string, levelOrd: number, value: number) {
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM "UserDirection" WHERE id = ${userDirectionId} FOR UPDATE`;
      const row = await tx.userDirection.findUniqueOrThrow({ where: { id: userDirectionId }, select: { topicFrontier: true } });
      const map = parseFrontier(row.topicFrontier);
      if ((map[String(levelOrd)] ?? 1) >= value) return;
      map[String(levelOrd)] = value;
      await tx.userDirection.update({ where: { id: userDirectionId }, data: { topicFrontier: map as Prisma.InputJsonValue } });
    };
    if ('$transaction' in db) await db.$transaction(run);
    else await run(db);
  }

  /** Dars tugatilgach chaqiriladi (complete() tranzaksiyasi ichida): shu mavzu darajasining frontier'ini oshiradi. */
  async advanceAfterCompletion(tx: Prisma.TransactionClient, userId: string, topicId: string) {
    const topic = await tx.topic.findUnique({ where: { id: topicId }, include: { level: true } });
    if (!topic) return;
    const [ud] = await tx.userDirection.findMany({
      where: { userId, directionId: topic.level.directionId },
      include: { direction: { include: { levels: { orderBy: { ord: 'asc' }, include: { topics: { orderBy: { ord: 'asc' } } } } } } },
    });
    // Frontier faqat o'quvchining joriy darajasida ahamiyatli
    if (!ud || ud.currentLevelOrd !== topic.level.ord) return;
    await this.frontiersFor(userId, [ud], tx);
  }

  // ───────────── Yo'nalish tanlash ─────────────

  async selectDirections(userId: string, directionIds: string[]) {
    const found = await this.prisma.direction.findMany({ where: { id: { in: directionIds } } });
    if (found.length !== directionIds.length) throw new NotFoundException("Yo'nalish topilmadi");
    if (found.some((d) => !d.active)) throw new BadRequestException("Bu yo'nalish hali ochilmagan");

    await this.prisma.$transaction(async (tx) => {
      // Bir vaqtda ikkita so'rov 2 chegarasini aylanib o'tmasligi uchun foydalanuvchi qatorini qulflaymiz
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const existing = await tx.userDirection.findMany({ where: { userId }, select: { directionId: true } });
      const have = new Set(existing.map((e) => e.directionId));
      const fresh = directionIds.filter((id) => !have.has(id));
      if (have.size + fresh.length > MAX_DIRECTIONS) {
        throw new ConflictException(`Ko'pi bilan ${MAX_DIRECTIONS} ta yo'nalish tanlash mumkin`);
      }
      if (fresh.length) await tx.userDirection.createMany({ data: fresh.map((directionId) => ({ userId, directionId })) });
    });
    return this.overview(userId);
  }

  async dismissPrompt(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { directionPromptDismissedAt: new Date() } });
    return { ok: true };
  }

  private async ownedDirection(userId: string, directionId: string) {
    const ud = await this.prisma.userDirection.findUnique({
      where: { userId_directionId: { userId, directionId } },
      include: { direction: { include: { levels: { orderBy: { ord: 'asc' } } } } },
    });
    if (!ud) throw new NotFoundException("Avval bu yo'nalishni tanlang");
    return ud;
  }

  async startFromZero(userId: string, directionId: string) {
    await this.ownedDirection(userId, directionId);
    await this.prisma.$transaction([
      this.prisma.placementAttempt.deleteMany({ where: { userId, directionId, done: false } }),
      this.prisma.userDirection.update({
        where: { userId_directionId: { userId, directionId } },
        data: { currentLevelOrd: 1, levelAccess: 'SEQUENTIAL', placedBy: 'ZERO' },
      }),
    ]);
    return { ok: true };
  }

  // ───────────── Daraja aniqlash testi ─────────────

  async startPlacement(userId: string, directionId: string, mode: 'CLAIMED' | 'UNKNOWN', levelOrd?: number) {
    const ud = await this.ownedDirection(userId, directionId);
    const maxOrd = ud.direction.levels.length;
    if (maxOrd === 0) throw new BadRequestException("Bu yo'nalishda daraja yo'q");

    let questionIds: string[] = [];
    let claimedOrd: number | null = null;

    if (mode === 'CLAIMED') {
      if (!levelOrd || levelOrd < 1 || levelOrd > maxOrd) throw new BadRequestException('Darajani tanlang');
      const level = ud.direction.levels.find((l) => l.ord === levelOrd)!;
      const pool = await this.prisma.question.findMany({ where: { levelId: level.id }, select: { id: true, ruleId: true } });
      if (pool.length === 0) throw new BadRequestException("Bu daraja uchun savollar hali yo'q");
      questionIds = pickDiverse(pool, claimedTestSize(pool.length)).map((q) => q.id);
      claimedOrd = levelOrd;
    } else {
      const first = await this.pickUnknownQuestion(directionId, ud.direction.levels, 1, []);
      if (!first) throw new BadRequestException("Bu yo'nalish uchun savollar hali yo'q");
      questionIds = [first];
    }

    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.placementAttempt.deleteMany({ where: { userId, directionId, done: false } });
      return tx.placementAttempt.create({ data: { userId, directionId, mode, claimedOrd, questionIds } });
    });
    return { id: attempt.id };
  }

  private async pickUnknownQuestion(
    directionId: string,
    levels: Array<{ id: string; ord: number }>,
    levelOrd: number,
    asked: string[],
  ): Promise<string | null> {
    const level = levels.find((l) => l.ord === levelOrd);
    if (!level) return null;
    const pool = await this.prisma.question.findMany({
      where: { levelId: level.id, directionId, id: { notIn: asked } },
      select: { id: true, ruleId: true },
    });
    return pool.length ? pickDiverse(pool, 1)[0].id : null;
  }

  async getPlacement(userId: string, id: string) {
    const attempt = await this.prisma.placementAttempt.findFirst({
      where: { id, userId },
      include: { direction: { include: { levels: { orderBy: { ord: 'asc' } } } } },
    });
    if (!attempt) throw new NotFoundException('Test topilmadi');
    return attempt.done ? this.resultView(attempt) : this.questionView(attempt);
  }

  private async questionView(attempt: PlacementAttempt & { direction: { levels: Array<{ ord: number; code: string }> } }) {
    const answers = attempt.answers as unknown as Answer[];
    const currentId = attempt.questionIds[answers.length];
    const q = await this.prisma.question.findUniqueOrThrow({ where: { id: currentId } });
    const total = attempt.mode === 'CLAIMED' ? attempt.questionIds.length : null;
    const level = attempt.direction.levels.find((l) => l.ord === (attempt.mode === 'CLAIMED' ? attempt.claimedOrd : null));
    return {
      status: 'IN_PROGRESS' as const,
      id: attempt.id,
      mode: attempt.mode,
      directionId: attempt.directionId,
      levelCode: level?.code ?? null,
      index: answers.length + 1,
      total,
      question: { id: q.id, prompt: q.prompt, instruction: q.instruction, options: q.options },
    };
  }

  async answer(userId: string, id: string, questionId: string, choice: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PlacementAttempt" WHERE id = ${id} FOR UPDATE`;
      const attempt = await tx.placementAttempt.findFirst({
        where: { id, userId },
        include: { direction: { include: { levels: { orderBy: { ord: 'asc' } } } } },
      });
      if (!attempt) throw new NotFoundException('Test topilmadi');
      if (attempt.done) throw new ConflictException('Test tugagan');

      const answers = attempt.answers as unknown as Answer[];
      if (attempt.questionIds[answers.length] !== questionId) throw new ConflictException("Bu savol allaqachon javoblangan");
      const q = await tx.question.findUniqueOrThrow({ where: { id: questionId }, include: { level: true } });
      const correct = choice === q.correctIndex;
      const next: Answer[] = [...answers, { questionId, choice, correct, levelOrd: q.level.ord }];

      if (!correct) {
        await tx.userMistake.upsert({
          where: { userId_questionId: { userId, questionId } },
          create: { userId, questionId, lastChoice: choice },
          update: { count: { increment: 1 }, lastChoice: choice, lastAt: new Date() },
        });
      }

      const levels = attempt.direction.levels;
      let questionIds = attempt.questionIds;
      let finished = false;
      let resultOrd = 0;

      if (attempt.mode === 'CLAIMED') {
        finished = next.length >= questionIds.length;
      } else {
        // Har bir daraja uchun hali berilmagan savollar bormi (bank kichik bo'lsa to'xtaymiz)
        const counts = await tx.question.groupBy({
          by: ['levelId'],
          where: { directionId: attempt.directionId },
          _count: { _all: true },
        });
        const bank = new Map(counts.map((c) => [c.levelId, c._count._all]));
        const available = (ord: number) => {
          const lv = levels.find((l) => l.ord === ord);
          if (!lv) return false;
          return (bank.get(lv.id) ?? 0) > next.filter((a) => a.levelOrd === ord).length;
        };
        const step = nextUnknownStep(next, levels.length, available);
        if (step.type === 'done') {
          finished = true;
          resultOrd = step.resultOrd;
        } else {
          const lv = levels.find((l) => l.ord === step.levelOrd)!;
          const pool = await tx.question.findMany({
            where: { levelId: lv.id, id: { notIn: questionIds } },
            select: { id: true, ruleId: true },
          });
          if (pool.length === 0) {
            finished = true;
            resultOrd = step.levelOrd;
          } else {
            questionIds = [...questionIds, pickDiverse(pool, 1)[0].id];
          }
        }
      }

      const correctCount = next.filter((a) => a.correct).length;
      if (!finished) {
        await tx.placementAttempt.update({
          where: { id },
          data: { answers: next as unknown as Prisma.InputJsonValue, questionIds },
        });
        return;
      }

      const scorePct = pct(correctCount, next.length);
      const maxOrd = levels.length;
      let outcome: Outcome;
      if (attempt.mode === 'CLAIMED') {
        const verdict = judgeClaimed(scorePct, attempt.claimedOrd!, maxOrd);
        outcome = verdict.outcome;
        resultOrd = verdict.resultOrd;
      } else {
        outcome = 'PLACED';
      }

      await tx.placementAttempt.update({
        where: { id },
        data: {
          answers: next as unknown as Prisma.InputJsonValue,
          questionIds,
          done: true,
          scorePct,
          outcome,
          resultOrd,
          finishedAt: new Date(),
        },
      });
      await this.applyOutcome(tx, userId, attempt.directionId, outcome, resultOrd, attempt.mode);
    });
    return this.getPlacement(userId, id);
  }

  /** Natijani foydalanuvchi progressiga yozadi. RETEST_LOWER holatida hech narsa o'zgarmaydi (foydalanuvchi qayta test boshlaydi). */
  private async applyOutcome(
    tx: Prisma.TransactionClient,
    userId: string,
    directionId: string,
    outcome: Outcome,
    resultOrd: number,
    mode: 'CLAIMED' | 'UNKNOWN',
  ) {
    if (outcome === 'RETEST_LOWER') return;
    const levelAccess = outcome === 'REPEAT_OPEN' || outcome === 'MASTERED' ? 'OPEN' : 'SEQUENTIAL';
    await tx.userDirection.update({
      where: { userId_directionId: { userId, directionId } },
      data: { currentLevelOrd: resultOrd, levelAccess, placedBy: mode },
    });
  }

  private async resultView(attempt: PlacementAttempt & { direction: { levels: Array<{ ord: number; code: string; title: string }> } }) {
    const answers = attempt.answers as unknown as Answer[];
    const questions = await this.prisma.question.findMany({
      where: { id: { in: answers.map((a) => a.questionId) } },
      include: { rule: true, level: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const wrong = answers
      .filter((a) => !a.correct)
      .map((a) => {
        const q = byId.get(a.questionId)!;
        return {
          prompt: q.prompt,
          options: q.options,
          chosenIndex: a.choice,
          correctIndex: q.correctIndex,
          correctSentence: q.correctSentence,
          levelCode: q.level.code,
          ruleTitle: q.rule.title,
        };
      });
    const resultLevel = attempt.direction.levels.find((l) => l.ord === attempt.resultOrd);
    const claimed = attempt.direction.levels.find((l) => l.ord === attempt.claimedOrd);
    const perLevel = attempt.direction.levels
      .map((l) => {
        const inLevel = answers.filter((a) => a.levelOrd === l.ord);
        return { code: l.code, total: inLevel.length, correct: inLevel.filter((a) => a.correct).length };
      })
      .filter((l) => l.total > 0);
    return {
      status: 'DONE' as const,
      id: attempt.id,
      mode: attempt.mode,
      directionId: attempt.directionId,
      claimedCode: claimed?.code ?? null,
      claimedOrd: attempt.claimedOrd,
      scorePct: attempt.scorePct ?? 0,
      correct: answers.filter((a) => a.correct).length,
      total: answers.length,
      outcome: attempt.outcome as Outcome,
      resultOrd: attempt.resultOrd ?? 1,
      resultCode: resultLevel?.code ?? null,
      resultTitle: resultLevel?.title ?? null,
      levels: attempt.direction.levels.map((l) => ({ ord: l.ord, code: l.code, title: l.title })),
      perLevel,
      wrong,
    };
  }

  // ───────────── Xatolar (takrorlash) ─────────────

  /** Xatolar qoida (xato turi) bo'yicha jamlanadi: bir xil mavzudagi xatolar dublikat emas, soni ko'rsatiladi. */
  async mistakes(userId: string) {
    const rows = await this.prisma.userMistake.findMany({
      where: { userId },
      orderBy: { lastAt: 'desc' },
      include: { question: { include: { rule: true, topic: { include: { level: true } }, level: true } } },
    });
    const userDirections = await this.fullDirections(userId);
    const access = new Map(userDirections.map((u) => [u.directionId, u]));
    const { frontiers } = await this.frontiersFor(userId, userDirections);

    const groups = new Map<string, {
      ruleKey: string; title: string; tipTitle: string; tipBody: string; remember: string; total: number; lastAt: Date;
      topic: { id: string; title: string; levelCode: string; accessible: boolean };
      items: Array<Record<string, unknown>>;
    }>();
    for (const m of rows) {
      const q = m.question;
      const g = groups.get(q.rule.key) ?? {
        ruleKey: q.rule.key,
        title: q.rule.title,
        tipTitle: q.rule.tipTitle,
        tipBody: q.rule.tipBody,
        remember: q.rule.remember,
        total: 0,
        lastAt: m.lastAt,
        topic: {
          id: q.topic.id,
          title: q.topic.title,
          levelCode: q.topic.level.code,
          accessible: this.canOpenTopic(access.get(q.directionId), q.topic.level.ord, q.topic.ord, frontiers.get(q.directionId) ?? 1),
        },
        items: [],
      };
      g.total += m.count;
      if (m.lastAt > g.lastAt) g.lastAt = m.lastAt;
      g.items.push({
        questionId: q.id,
        prompt: q.prompt,
        options: q.options,
        chosenIndex: m.lastChoice,
        correctIndex: q.correctIndex,
        correctSentence: q.correctSentence,
        note: q.note,
        count: m.count,
        levelCode: q.level.code,
      });
      groups.set(q.rule.key, g);
    }
    return { groups: [...groups.values()].sort((a, b) => b.total - a.total || b.lastAt.getTime() - a.lastAt.getTime()) };
  }

  // ───────────── Mavzu ─────────────

  private canOpenTopic(
    ud: { currentLevelOrd: number | null; levelAccess: 'SEQUENTIAL' | 'OPEN' } | undefined,
    levelOrd: number,
    topicOrd: number,
    frontier: number,
  ) {
    if (!ud) return false;
    const s = topicStateOf(ud.currentLevelOrd, ud.levelAccess, levelOrd, topicOrd, frontier);
    return s === 'open' || s === 'current';
  }

  /**
   * Berilgan mavzulardan o'quvchiga hozir ochiq bo'lganlari (topic() bilan bir xil qoida, lekin xato tashlamaydi).
   * Daftar ro'yxatlarida "darsga qaytish" havolasi yopiq mavzuga olib bormasligi uchun.
   */
  async accessibleTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (topicIds.length === 0) return out;
    const topics = await this.prisma.topic.findMany({ where: { id: { in: [...new Set(topicIds)] } }, include: { level: true } });
    const uds = await this.fullDirections(userId);
    const access = new Map(uds.map((u) => [u.directionId, u]));
    const { frontiers } = await this.frontiersFor(userId, uds);
    for (const t of topics) {
      const ud = access.get(t.level.directionId);
      if (this.canOpenTopic(ud, t.level.ord, t.ord, frontiers.get(t.level.directionId) ?? 1)) out.add(t.id);
    }
    return out;
  }

  private fullDirections(userId: string, directionId?: string) {
    return this.prisma.userDirection.findMany({
      where: { userId, ...(directionId ? { directionId } : {}) },
      include: { direction: { include: { levels: { orderBy: { ord: 'asc' }, include: { topics: { orderBy: { ord: 'asc' } } } } } } },
    });
  }

  async topic(userId: string, topicId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: { level: { include: { direction: true } } },
    });
    if (!topic) throw new NotFoundException('Mavzu topilmadi');
    const [ud] = await this.fullDirections(userId, topic.level.directionId);
    const frontier = ud ? ((await this.frontiersFor(userId, [ud])).frontiers.get(ud.directionId) ?? 1) : 1;
    if (!this.canOpenTopic(ud, topic.level.ord, topic.ord, frontier)) {
      throw new ForbiddenException('Bu mavzu hali ochilmagan: avval oldingi bosqichlarni tugating');
    }
    return {
      id: topic.id,
      title: topic.title,
      ord: topic.ord,
      levelCode: topic.level.code,
      levelTitle: topic.level.title,
      directionTitle: topic.level.direction.title,
    };
  }
}
