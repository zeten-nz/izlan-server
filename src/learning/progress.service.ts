import { Injectable } from '@nestjs/common';
import { parseDoc } from '../lessons/doc.schema';
import { reviewProgress } from '../lessons/player';
import { PrismaService } from '../prisma/prisma.service';
import { LearningService } from './learning.service';
import { summarizeActivity } from './progress';

const NEXT_LIMIT = 5;

/**
 * O'quvchi progressining o'qish ko'rinishlari (Asosiy, Jarayon). Hisob-kitoblar LearningService.overview() va
 * mavjud dars holatlariga tayanadi — alohida completion algoritmi yo'q.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: LearningService,
  ) {}

  /** Davom ettirish + keyingi darslar (DailyPlan o'rniga): faqat ochiq mavzulardagi nashr qilingan darslar. */
  async nextLessons(userId: string) {
    const ov = await this.learning.overview(userId);
    const hasDirections = ov.directions.length > 0;

    type Meta = {
      topicId: string;
      topicTitle: string;
      topicOrd: number;
      directionId: string;
      directionTitle: string;
      levelCode: string;
      lessons: { total: number; completed: number };
    };
    const metas: Meta[] = [];
    let pendingLevel = false;
    for (const d of ov.directions) {
      const cur = d.levels.find((l) => l.state === 'current');
      if (!cur) {
        pendingLevel = true;
        continue;
      }
      for (const t of cur.topics) {
        if (t.state !== 'open' && t.state !== 'current') continue;
        metas.push({
          topicId: t.id,
          topicTitle: t.title,
          topicOrd: t.ord,
          directionId: d.directionId,
          directionTitle: d.title,
          levelCode: cur.code,
          lessons: { total: t.lessons?.total ?? 0, completed: t.lessons?.completed ?? 0 },
        });
      }
    }
    const metaByTopic = new Map(metas.map((m) => [m.topicId, m]));
    const topicIds = metas.map((m) => m.topicId);

    const lessons = topicIds.length
      ? await this.prisma.lesson.findMany({
          where: { topicId: { in: topicIds }, publishedVersionId: { not: null } },
          include: { published: { select: { doc: true } } },
        })
      : [];
    // Mavzu tartibi, so'ng sortOrder, createdAt, id
    lessons.sort(
      (a, b) =>
        metaByTopic.get(a.topicId)!.topicOrd - metaByTopic.get(b.topicId)!.topicOrd ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : 1),
    );
    const lessonIds = lessons.map((l) => l.id);
    const progress = lessonIds.length
      ? await this.prisma.lessonProgress.findMany({
          where: { userId, version: { lessonId: { in: lessonIds } } },
          include: { version: { select: { lessonId: true, doc: true } } },
          orderBy: { startedAt: 'desc' },
        })
      : [];
    const done = new Set(progress.filter((p) => p.completedAt).map((p) => p.version.lessonId));
    // Tugatilmagan, boshlangan darslar (eng yangisi birinchi); sticky tugatilgan dars hisobga olinmaydi
    const ongoing = new Map<string, (typeof progress)[number]>();
    for (const p of progress) {
      if (p.completedAt || done.has(p.version.lessonId) || ongoing.has(p.version.lessonId)) continue;
      ongoing.set(p.version.lessonId, p);
    }

    const item = (l: (typeof lessons)[number]) => {
      const m = metaByTopic.get(l.topicId)!;
      const p = ongoing.get(l.id);
      const parsed = parseDoc(p ? p.version.doc : l.published?.doc);
      const pages = parsed.ok ? parsed.doc.pages.length : 0;
      const review = p && parsed.ok ? reviewProgress(parsed.doc, p.visitedPageIds) : { total: pages, seen: 0, pct: 0 };
      return {
        lessonId: l.id,
        title: l.title,
        pages,
        status: p ? ('continue' as const) : ('start' as const),
        reviewPct: review.pct,
        lastPageIndex: p?.lastPageIndex ?? null,
        topic: { id: m.topicId, title: m.topicTitle, ord: m.topicOrd, lessons: m.lessons },
        direction: { id: m.directionId, title: m.directionTitle },
        levelCode: m.levelCode,
      };
    };

    const open = lessons.filter((l) => !done.has(l.id));
    const continuing = open
      .filter((l) => ongoing.has(l.id))
      .sort((a, b) => ongoing.get(b.id)!.startedAt.getTime() - ongoing.get(a.id)!.startedAt.getTime());
    const fresh = open.filter((l) => !ongoing.has(l.id));
    const ordered = [...continuing, ...fresh].slice(0, NEXT_LIMIT).map(item);

    return {
      hasDirections,
      /** Yo'nalish bor, lekin daraja hali aniqlanmagan */
      pendingLevel,
      /** Ochiq mavzular bor, lekin ularda nashr qilingan dars yo'q */
      contentPreparing: metas.length > 0 && lessons.length === 0,
      /** Ochiq mavzulardagi hamma dars tugatilgan */
      allDone: lessons.length > 0 && open.length === 0,
      continue: ordered.find((x) => x.status === 'continue') ?? null,
      next: ordered,
    };
  }

  /** Jarayon sahifasi: faqat haqiqiy ma'lumot (XP/IZL/reyting/o'zlashtirish yo'q). */
  async summary(userId: string) {
    const ov = await this.learning.overview(userId);
    const directions = ov.directions.map((d) => {
      const cur = d.levels.find((l) => l.state === 'current') ?? null;
      const topics = (cur?.topics ?? []).map((t) => ({
        id: t.id,
        ord: t.ord,
        title: t.title,
        state: t.state,
        lessons: t.lessons,
      }));
      return {
        directionId: d.directionId,
        title: d.title,
        levelCode: cur?.code ?? null,
        topicsTotal: topics.length,
        topicsCompleted: topics.filter((t) => t.lessons?.topicCompleted).length,
        lessonsTotal: topics.reduce((s, t) => s + (t.lessons?.total ?? 0), 0),
        lessonsCompleted: topics.reduce((s, t) => s + (t.lessons?.completed ?? 0), 0),
        topics,
      };
    });

    const since = new Date(Date.now() - 40 * 86_400_000);
    const [attempts, progress] = await Promise.all([
      this.prisma.lessonBlockAttempt.findMany({ where: { userId, updatedAt: { gte: since } }, select: { updatedAt: true } }),
      this.prisma.lessonProgress.findMany({ where: { userId }, select: { startedAt: true, completedAt: true, version: { select: { lessonId: true } } } }),
    ]);
    const events: Date[] = [
      ...attempts.map((a) => a.updatedAt),
      ...progress.flatMap((p) => [p.startedAt, ...(p.completedAt ? [p.completedAt] : [])]),
    ].filter((d) => d >= since);

    return {
      directions,
      totals: { lessonsCompleted: new Set(progress.filter((p) => p.completedAt).map((p) => p.version.lessonId)).size },
      activity: summarizeActivity(events, new Date()),
    };
  }
}
