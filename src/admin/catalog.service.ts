import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseFrontier } from '../learning/progress';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDirectionDto, CreateLevelDto, CreateTopicDto, UpdateDirectionDto, UpdateLevelDto, UpdateTopicDto } from './catalog.dto';
import {
  directionDeleteBlockers,
  learnersAtLevel,
  levelDeleteBlockers,
  levelReorderBlocker,
  MAX_LEVELS,
  nameKey,
  sameIdSet,
  slugify,
  topicDeleteBlockers,
  topicReorderBlocker,
  type LearnerState,
} from './catalog.rules';

type Db = PrismaService | Prisma.TransactionClient;

const invalid = (field: string, message: string) => new UnprocessableEntityException({ message, errors: { [field]: message } });
const blocked = (reasons: string[], head: string) => new ConflictException({ message: `${head} ${reasons[0]}`, reasons });

/** Bitta yo'nalish bo'yicha hisoblangan faktlar: daraxt va xavfsizlik tekshiruvlari bir xil manbadan foydalanadi. */
interface DirFacts {
  direction: Prisma.DirectionGetPayload<{ include: { levels: { include: { topics: true } } } }>;
  states: LearnerState[];
  placements: number;
  questions: number;
  questionsByLevel: Map<string, number>;
  questionsByTopic: Map<string, number>;
  lessonsByTopic: Map<string, number>;
  publishedByTopic: Map<string, number>;
  progressByTopic: Map<string, number>;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Faktlar ─────────────

  private async facts(db: Db, directionIds?: string[]): Promise<DirFacts[]> {
    const directions = await db.direction.findMany({
      where: directionIds ? { id: { in: directionIds } } : {},
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: { levels: { orderBy: { ord: 'asc' }, include: { topics: { orderBy: { ord: 'asc' } } } } },
    });
    if (directions.length === 0) return [];
    const dIds = directions.map((d) => d.id);
    const topicIds = directions.flatMap((d) => d.levels.flatMap((l) => l.topics.map((t) => t.id)));
    const inTopics = topicIds.length ? { topicId: { in: topicIds } } : { topicId: { in: ['-'] } };

    const [uds, placeAgg, qDir, qLevel, qTopic, lessons, published, progress] = await Promise.all([
      db.userDirection.findMany({ where: { directionId: { in: dIds } }, select: { directionId: true, currentLevelOrd: true, topicFrontier: true } }),
      db.placementAttempt.groupBy({ by: ['directionId'], where: { directionId: { in: dIds } }, _count: { _all: true } }),
      db.question.groupBy({ by: ['directionId'], where: { directionId: { in: dIds } }, _count: { _all: true } }),
      db.question.groupBy({ by: ['levelId'], where: { directionId: { in: dIds } }, _count: { _all: true } }),
      db.question.groupBy({ by: ['topicId'], where: { directionId: { in: dIds } }, _count: { _all: true } }),
      db.lesson.groupBy({ by: ['topicId'], where: inTopics, _count: { _all: true } }),
      db.lesson.groupBy({ by: ['topicId'], where: { ...inTopics, publishedVersionId: { not: null } }, _count: { _all: true } }),
      topicIds.length
        ? db.$queryRaw<Array<{ topicId: string; n: number }>>`
            SELECT l."topicId" AS "topicId", COUNT(*)::int AS n
            FROM "LessonProgress" lp
            JOIN "LessonVersion" v ON v.id = lp."versionId"
            JOIN "Lesson" l ON l.id = v."lessonId"
            WHERE l."topicId" IN (${Prisma.join(topicIds)})
            GROUP BY l."topicId"`
        : Promise.resolve([] as Array<{ topicId: string; n: number }>),
    ]);

    const byKey = <K extends string>(rows: Array<Record<K, string> & { _count: { _all: number } }>, k: K) =>
      new Map(rows.map((r) => [r[k], r._count._all] as const));
    const levelQ = byKey(qLevel, 'levelId');
    const topicQ = byKey(qTopic, 'topicId');
    const dirQ = byKey(qDir, 'directionId');
    const dirP = byKey(placeAgg, 'directionId');
    const lessonsBy = byKey(lessons, 'topicId');
    const publishedBy = byKey(published, 'topicId');
    const progressBy = new Map(progress.map((r) => [r.topicId, Number(r.n)] as const));

    return directions.map((direction) => ({
      direction,
      states: uds
        .filter((u) => u.directionId === direction.id)
        .map((u) => ({ currentLevelOrd: u.currentLevelOrd, frontier: parseFrontier(u.topicFrontier) })),
      placements: dirP.get(direction.id) ?? 0,
      questions: dirQ.get(direction.id) ?? 0,
      questionsByLevel: levelQ,
      questionsByTopic: topicQ,
      lessonsByTopic: lessonsBy,
      publishedByTopic: publishedBy,
      progressByTopic: progressBy,
    }));
  }

  private async factsOne(db: Db, directionId: string): Promise<DirFacts> {
    const [f] = await this.facts(db, [directionId]);
    if (!f) throw new NotFoundException("Yo'nalish topilmadi");
    return f;
  }

  private levelProgress(f: DirFacts, levelId: string): number {
    const lv = f.direction.levels.find((l) => l.id === levelId);
    return lv ? lv.topics.reduce((s, t) => s + (f.progressByTopic.get(t.id) ?? 0), 0) : 0;
  }

  private levelReorderReason(f: DirFacts): string | null {
    return levelReorderBlocker({ levels: f.direction.levels.length, learners: f.states.length, placements: f.placements });
  }

  private topicReorderReason(f: DirFacts, levelId: string): string | null {
    const lv = f.direction.levels.find((l) => l.id === levelId);
    if (!lv) return null;
    return topicReorderBlocker({
      topics: lv.topics.length,
      progress: this.levelProgress(f, levelId),
      learnersAtLevel: learnersAtLevel(f.states, lv.ord),
    });
  }

  // ───────────── Daraxt ─────────────

  async tree() {
    const all = await this.facts(this.prisma);
    return {
      maxLevels: MAX_LEVELS,
      directions: all.map((f) => {
        const d = f.direction;
        const levelsBlock = this.levelReorderReason(f);
        const deleteBlockers = directionDeleteBlockers({ levels: d.levels.length, learners: f.states.length, placements: f.placements, questions: f.questions });
        return {
          id: d.id,
          slug: d.slug,
          kind: d.kind,
          title: d.title,
          description: d.description,
          active: d.active,
          sortOrder: d.sortOrder,
          learners: f.states.length,
          questions: f.questions,
          /** Daraja aniqlash testi (savollar) tayyormi: yo'q bo'lsa o'quvchi faqat "0 dan boshlash" ni tanlay oladi */
          placementReady: f.questions > 0,
          canActivate: d.levels.length > 0,
          deleteBlockers,
          levelsReorderBlocker: levelsBlock,
          levels: d.levels.map((l) => {
            const atLevel = learnersAtLevel(f.states, l.ord);
            const topicsLessons = l.topics.reduce((s, t) => s + (f.lessonsByTopic.get(t.id) ?? 0), 0);
            return {
              id: l.id,
              ord: l.ord,
              code: l.code,
              title: l.title,
              summary: l.summary,
              canDo: l.canDo,
              vocabHint: l.vocabHint,
              lessons: topicsLessons,
              questions: f.questionsByLevel.get(l.id) ?? 0,
              learners: atLevel,
              deleteBlockers: levelDeleteBlockers({
                isLast: l.ord === Math.max(...d.levels.map((x) => x.ord)),
                topics: l.topics.length,
                questions: f.questionsByLevel.get(l.id) ?? 0,
                learnersAtLevel: atLevel,
              }),
              topicsReorderBlocker: this.topicReorderReason(f, l.id),
              topics: l.topics.map((t) => {
                const lessons = f.lessonsByTopic.get(t.id) ?? 0;
                const questions = f.questionsByTopic.get(t.id) ?? 0;
                const progress = f.progressByTopic.get(t.id) ?? 0;
                return {
                  id: t.id,
                  ord: t.ord,
                  title: t.title,
                  lessons,
                  publishedLessons: f.publishedByTopic.get(t.id) ?? 0,
                  questions,
                  deleteBlockers: topicDeleteBlockers({ lessons, questions, progress, learnersAtLevel: atLevel }),
                };
              }),
            };
          }),
        };
      }),
    };
  }

  // ───────────── Yo'nalish ─────────────

  private async assertDirectionTitleFree(db: Db, title: string, exceptId?: string) {
    const key = nameKey(title);
    const all = await db.direction.findMany({ select: { id: true, title: true } });
    if (all.some((d) => d.id !== exceptId && nameKey(d.title) === key)) throw invalid('title', "Bunday nomli yo'nalish allaqachon bor");
  }

  async createDirection(dto: CreateDirectionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('catalog:directions', 0))`;
      await this.assertDirectionTitleFree(tx, dto.title);
      const base = slugify(dto.title);
      const taken = new Set((await tx.direction.findMany({ select: { slug: true } })).map((d) => d.slug));
      let slug = base;
      for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
      const max = await tx.direction.aggregate({ _max: { sortOrder: true } });
      const row = await tx.direction.create({
        data: { slug, kind: dto.kind, title: dto.title, description: dto.description ?? '', active: false, sortOrder: (max._max.sortOrder ?? -1) + 1 },
      });
      return { id: row.id };
    });
  }

  async updateDirection(id: string, dto: UpdateDirectionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Direction" WHERE id = ${id} FOR UPDATE`;
      const cur = await tx.direction.findUnique({ where: { id }, include: { levels: { select: { id: true } } } });
      if (!cur) throw new NotFoundException("Yo'nalish topilmadi");
      if (dto.title !== undefined) await this.assertDirectionTitleFree(tx, dto.title, id);
      if (dto.active === true && !cur.active && cur.levels.length === 0) {
        throw new ConflictException({ message: "Faollashtirish uchun avval kamida bitta daraja qo'shing", reasons: ['Darajasi yo\'q yo\'nalishni o\'quvchilarga ochib bo\'lmaydi.'] });
      }
      await tx.direction.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      return { ok: true };
    });
  }

  async deleteDirection(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Direction" WHERE id = ${id} FOR UPDATE`;
      const f = await this.factsOne(tx, id);
      const reasons = directionDeleteBlockers({ levels: f.direction.levels.length, learners: f.states.length, placements: f.placements, questions: f.questions });
      if (reasons.length) throw blocked(reasons, "Yo'nalishni o'chirib bo'lmaydi.");
      await tx.direction.delete({ where: { id } });
      return { ok: true };
    });
  }

  /** Yo'nalishlar ko'rsatish tartibi (`sortOrder`): o'quvchi holatiga ta'sir qilmaydi, har doim ruxsat. */
  async reorderDirections(ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('catalog:directions', 0))`;
      const cur = await tx.direction.findMany({ select: { id: true } });
      if (!sameIdSet(ids, cur.map((c) => c.id))) throw invalid('ids', "Yo'nalishlar ro'yxati eskirgan. Sahifani yangilang.");
      for (const [i, id] of ids.entries()) await tx.direction.update({ where: { id }, data: { sortOrder: i } });
      return { ok: true };
    });
  }

  // ───────────── Daraja ─────────────

  private async levelCtx(db: Db, levelId: string) {
    const level = await db.level.findUnique({ where: { id: levelId }, select: { id: true, directionId: true } });
    if (!level) throw new NotFoundException('Daraja topilmadi');
    return level;
  }

  private assertLevelNamesFree(levels: Array<{ id: string; code: string; title: string }>, code: string | undefined, title: string | undefined, exceptId?: string) {
    const others = levels.filter((l) => l.id !== exceptId);
    if (code !== undefined && others.some((l) => nameKey(l.code) === nameKey(code))) throw invalid('code', `Bu yo'nalishda «${code}» kodli daraja allaqachon bor`);
    if (title !== undefined && others.some((l) => nameKey(l.title) === nameKey(title))) throw invalid('title', 'Bu yo\'nalishda bunday nomli daraja allaqachon bor');
  }

  async createLevel(directionId: string, dto: CreateLevelDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Direction" WHERE id = ${directionId} FOR UPDATE`;
      const d = await tx.direction.findUnique({ where: { id: directionId }, include: { levels: { select: { id: true, ord: true, code: true, title: true } } } });
      if (!d) throw new NotFoundException("Yo'nalish topilmadi");
      if (d.levels.length >= MAX_LEVELS) {
        throw new ConflictException({
          message: `Hozircha yo'nalishda ${MAX_LEVELS} tadan ortiq daraja bo'lishi mumkin emas`,
          reasons: [`Daraja aniqlash testi ${MAX_LEVELS} darajagacha ishlaydi.`],
        });
      }
      this.assertLevelNamesFree(d.levels, dto.code, dto.title);
      const ord = Math.max(0, ...d.levels.map((l) => l.ord)) + 1;
      const row = await tx.level.create({
        data: { directionId, ord, code: dto.code, title: dto.title, summary: dto.summary ?? '', canDo: dto.canDo ?? [], vocabHint: dto.vocabHint ?? '' },
      });
      return { id: row.id };
    });
  }

  async updateLevel(id: string, dto: UpdateLevelDto) {
    return this.prisma.$transaction(async (tx) => {
      const ctx = await this.levelCtx(tx, id);
      await tx.$queryRaw`SELECT id FROM "Direction" WHERE id = ${ctx.directionId} FOR UPDATE`;
      const levels = await tx.level.findMany({ where: { directionId: ctx.directionId }, select: { id: true, code: true, title: true } });
      this.assertLevelNamesFree(levels, dto.code, dto.title, id);
      await tx.level.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
          ...(dto.canDo !== undefined ? { canDo: dto.canDo } : {}),
          ...(dto.vocabHint !== undefined ? { vocabHint: dto.vocabHint } : {}),
        },
      });
      return { ok: true };
    });
  }

  async deleteLevel(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const ctx = await this.levelCtx(tx, id);
      await tx.$queryRaw`SELECT id FROM "Direction" WHERE id = ${ctx.directionId} FOR UPDATE`;
      const f = await this.factsOne(tx, ctx.directionId);
      const lv = f.direction.levels.find((l) => l.id === id);
      if (!lv) throw new NotFoundException('Daraja topilmadi');
      const reasons = levelDeleteBlockers({
        isLast: lv.ord === Math.max(...f.direction.levels.map((l) => l.ord)),
        topics: lv.topics.length,
        questions: f.questionsByLevel.get(id) ?? 0,
        learnersAtLevel: learnersAtLevel(f.states, lv.ord),
      });
      if (reasons.length) throw blocked(reasons, "Darajani o'chirib bo'lmaydi.");
      await tx.level.delete({ where: { id } });
      return { ok: true };
    });
  }

  async reorderLevels(directionId: string, ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Direction" WHERE id = ${directionId} FOR UPDATE`;
      const f = await this.factsOne(tx, directionId);
      const reason = this.levelReorderReason(f);
      if (reason) throw blocked([reason], 'Darajalar tartibini o\'zgartirib bo\'lmaydi.');
      if (!sameIdSet(ids, f.direction.levels.map((l) => l.id))) throw invalid('ids', "Darajalar ro'yxati eskirgan. Sahifani yangilang.");
      // (directionId, ord) unikal: avval vaqtinchalik manfiy qiymatlar, so'ng yakuniy tartib
      for (const l of f.direction.levels) await tx.level.update({ where: { id: l.id }, data: { ord: -l.ord } });
      for (const [i, id] of ids.entries()) await tx.level.update({ where: { id }, data: { ord: i + 1 } });
      return { ok: true };
    });
  }

  // ───────────── Mavzu ─────────────

  private assertTopicTitleFree(topics: Array<{ id: string; title: string }>, title: string, exceptId?: string) {
    if (topics.some((t) => t.id !== exceptId && nameKey(t.title) === nameKey(title))) throw invalid('title', 'Bu darajada bunday nomli mavzu allaqachon bor');
  }

  async createTopic(levelId: string, dto: CreateTopicDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Level" WHERE id = ${levelId} FOR UPDATE`;
      const level = await tx.level.findUnique({ where: { id: levelId }, include: { topics: { select: { id: true, ord: true, title: true } } } });
      if (!level) throw new NotFoundException('Daraja topilmadi');
      this.assertTopicTitleFree(level.topics, dto.title);
      const ord = Math.max(0, ...level.topics.map((t) => t.ord)) + 1;
      const row = await tx.topic.create({ data: { levelId, ord, title: dto.title } });
      return { id: row.id };
    });
  }

  async updateTopic(id: string, dto: UpdateTopicDto) {
    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.findUnique({ where: { id }, select: { levelId: true } });
      if (!topic) throw new NotFoundException('Mavzu topilmadi');
      await tx.$queryRaw`SELECT id FROM "Level" WHERE id = ${topic.levelId} FOR UPDATE`;
      const siblings = await tx.topic.findMany({ where: { levelId: topic.levelId }, select: { id: true, title: true } });
      this.assertTopicTitleFree(siblings, dto.title, id);
      await tx.topic.update({ where: { id }, data: { title: dto.title } });
      return { ok: true };
    });
  }

  async deleteTopic(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.findUnique({ where: { id }, include: { level: true } });
      if (!topic) throw new NotFoundException('Mavzu topilmadi');
      await tx.$queryRaw`SELECT id FROM "Level" WHERE id = ${topic.levelId} FOR UPDATE`;
      const f = await this.factsOne(tx, topic.level.directionId);
      const lv = f.direction.levels.find((l) => l.id === topic.levelId)!;
      const reasons = topicDeleteBlockers({
        lessons: f.lessonsByTopic.get(id) ?? 0,
        questions: f.questionsByTopic.get(id) ?? 0,
        progress: f.progressByTopic.get(id) ?? 0,
        learnersAtLevel: learnersAtLevel(f.states, lv.ord),
      });
      if (reasons.length) throw blocked(reasons, "Mavzuni o'chirib bo'lmaydi.");
      await tx.topic.delete({ where: { id } });
      // O'quvchi izi yo'q (yuqorida tekshirildi): tartib raqamlari uzluksiz qoladi
      for (const t of lv.topics.filter((x) => x.ord > topic.ord)) await tx.topic.update({ where: { id: t.id }, data: { ord: t.ord - 1 } });
      return { ok: true };
    });
  }

  async reorderTopics(levelId: string, ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const level = await tx.level.findUnique({ where: { id: levelId }, select: { directionId: true } });
      if (!level) throw new NotFoundException('Daraja topilmadi');
      await tx.$queryRaw`SELECT id FROM "Level" WHERE id = ${levelId} FOR UPDATE`;
      const f = await this.factsOne(tx, level.directionId);
      const lv = f.direction.levels.find((l) => l.id === levelId)!;
      const reason = this.topicReorderReason(f, levelId);
      if (reason) throw blocked([reason], "Mavzular tartibini o'zgartirib bo'lmaydi.");
      if (!sameIdSet(ids, lv.topics.map((t) => t.id))) throw invalid('ids', "Mavzular ro'yxati eskirgan. Sahifani yangilang.");
      for (const t of lv.topics) await tx.topic.update({ where: { id: t.id }, data: { ord: -t.ord } });
      for (const [i, id] of ids.entries()) await tx.topic.update({ where: { id }, data: { ord: i + 1 } });
      return { ok: true };
    });
  }
}
