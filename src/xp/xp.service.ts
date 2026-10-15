import { Injectable } from '@nestjs/common';
import type { Prisma, XpEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dayKey, grantedFor, levelFor, multiplierBp, type LevelInfo } from './xp.engine';
import { ACTIVE_XP_POLICY } from './xp.policy';

type Tx = Prisma.TransactionClient;

export interface GrantInput {
  userId: string;
  eventType: XpEventType;
  /** Manba id: dars/mavzu */
  sourceId: string;
  topicId: string;
  baseXp: number;
  /** Takroriy hodisani bloklaydi */
  dedupeKey: string;
  at?: Date;
  meta?: Prisma.InputJsonValue;
}

export interface GrantResult {
  /** true: bu hodisa avval berilgan (yoki o'chirilgan) — hech narsa o'zgarmadi */
  duplicate: boolean;
  disabled: boolean;
  eventType: XpEventType;
  baseXp: number;
  multiplierBp: number;
  grantedXp: number;
  topicDayOrd: number | null;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
}

const NONE = (eventType: XpEventType, level: number, patch: Partial<GrantResult> = {}): GrantResult => ({
  duplicate: false,
  disabled: false,
  eventType,
  baseXp: 0,
  multiplierBp: 0,
  grantedXp: 0,
  topicDayOrd: null,
  levelBefore: level,
  levelAfter: level,
  leveledUp: false,
  ...patch,
});

export interface XpAward {
  grantedXp: number;
  events: GrantResult[];
  leveledUp: boolean;
  level: LevelInfo;
}

/**
 * XP berishning YAGONA nuqtasi. Faqat server hodisalari chaqiradi (dars/mavzu tugashi, test natijasi); HTTP orqali
 * `amount` qabul qiladigan endpoint yo'q. Hammasi chaqiruvchining tranzaksiyasida: ledger + wallet + mavzu tartibi
 * birga yoziladi yoki birga qaytariladi.
 */
@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Foydalanuvchi bo'yicha ketma-ketlashtirish: parallel so'rovlar mavzu tartibini, koeffitsiyentni va balansni
   * bir-biriga to'qnashtirmaydi. Tranzaksiya tugagach qulf o'zi bo'shaydi.
   */
  async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'xp:' + userId}, 0))`;
  }

  private async currentTotals(tx: Tx, userId: string) {
    const w = await tx.wallet.findUnique({ where: { userId } });
    return { balance: w?.xpBalance ?? 0, total: w?.totalXpEarned ?? 0 };
  }

  /** Bitta hodisa uchun XP. Chaqiruvchi `lockUser` ni oldin chaqirgan bo'lishi kerak (yoki shu metod chaqiradi). */
  async grant(tx: Tx, input: GrantInput): Promise<GrantResult> {
    const policy = ACTIVE_XP_POLICY;
    await this.lockUser(tx, input.userId);
    const { balance, total } = await this.currentTotals(tx, input.userId);
    const before = levelFor(total, policy);

    if (!policy.events[input.eventType].enabled) return NONE(input.eventType, before.level, { disabled: true });
    if (!Number.isInteger(input.baseXp) || input.baseXp <= 0) return NONE(input.eventType, before.level);

    const dup = await tx.xpLedger.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
    if (dup) return NONE(input.eventType, before.level, { duplicate: true });

    const day = dayKey(input.at ?? new Date(), policy);

    // Mavzuning kundagi tartibi: birinchi haqiqiy XP hodisasida belgilanadi va keyin o'zgarmaydi
    let order = await tx.xpTopicDay.findUnique({
      where: { userId_dayKey_topicId: { userId: input.userId, dayKey: day, topicId: input.topicId } },
    });
    if (!order) {
      const agg = await tx.xpTopicDay.aggregate({ where: { userId: input.userId, dayKey: day }, _max: { ord: true } });
      order = await tx.xpTopicDay.create({
        data: { userId: input.userId, dayKey: day, topicId: input.topicId, ord: (agg._max.ord ?? 0) + 1 },
      });
    }
    const bp = multiplierBp(order.ord, policy);

    // Yig'ma yaxlitlash: shu mavzu/kunda oldin berilgan bazaviy XP yig'indisi
    const sum = await tx.xpLedger.aggregate({
      where: { userId: input.userId, dayKey: day, topicId: input.topicId, kind: 'EARN' },
      _sum: { baseXp: true },
    });
    const granted = grantedFor(sum._sum.baseXp ?? 0, input.baseXp, bp);

    const newBalance = balance + granted;
    const newTotal = total + granted;
    await tx.xpLedger.create({
      data: {
        userId: input.userId,
        kind: 'EARN',
        eventType: input.eventType,
        sourceId: input.sourceId,
        topicId: input.topicId,
        baseXp: input.baseXp,
        multiplierBp: bp,
        grantedXp: granted,
        dedupeKey: input.dedupeKey,
        policyVersion: policy.version,
        dayKey: day,
        topicDayOrd: order.ord,
        balanceAfter: newBalance,
        totalAfter: newTotal,
        meta: input.meta ?? {},
      },
    });
    await tx.wallet.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, xpBalance: newBalance, totalXpEarned: newTotal },
      update: { xpBalance: newBalance, totalXpEarned: newTotal },
    });

    const after = levelFor(newTotal, policy);
    return {
      duplicate: false,
      disabled: false,
      eventType: input.eventType,
      baseXp: input.baseXp,
      multiplierBp: bp,
      grantedXp: granted,
      topicDayOrd: order.ord,
      levelBefore: before.level,
      levelAfter: after.level,
      leveledUp: after.level > before.level,
    };
  }

  /**
   * Dars BIRINCHI marta tugaganda (chaqiruvchi `firstTime: true` ni tasdiqlagan, o'z tranzaksiyasida):
   * dars XP + (mavzu birinchi marta tugagan bo'lsa) mavzu XP. Mavzu belgisi `TopicCompletion` ga yoziladi:
   * keyin yangi dars qo'shilsa ham mavzu XP qayta berilmaydi.
   */
  async onLessonFirstCompleted(tx: Tx, userId: string, lesson: { id: string; topicId: string }, at = new Date()): Promise<XpAward> {
    const policy = ACTIVE_XP_POLICY;
    await this.lockUser(tx, userId);
    const events: GrantResult[] = [];

    events.push(
      await this.grant(tx, {
        userId,
        eventType: 'LESSON_COMPLETE',
        sourceId: lesson.id,
        topicId: lesson.topicId,
        baseXp: policy.events.LESSON_COMPLETE.baseXp,
        dedupeKey: `lesson:${userId}:${lesson.id}`,
        at,
      }),
    );

    const marked = await tx.topicCompletion.findUnique({
      where: { userId_topicId: { userId, topicId: lesson.topicId } },
      select: { userId: true },
    });
    if (!marked && (await this.topicIsComplete(tx, userId, lesson.topicId))) {
      await tx.topicCompletion.create({ data: { userId, topicId: lesson.topicId, completedAt: at, source: 'LESSONS' } });
      events.push(
        await this.grant(tx, {
          userId,
          eventType: 'TOPIC_COMPLETE',
          sourceId: lesson.topicId,
          topicId: lesson.topicId,
          baseXp: policy.events.TOPIC_COMPLETE.baseXp,
          dedupeKey: `topic:${userId}:${lesson.topicId}`,
          at,
        }),
      );
    }
    return this.award(tx, userId, events);
  }

  /** Mavzu tugagan: nashr qilingan darslar bor va hammasi (istalgan versiyada) tugatilgan. */
  private async topicIsComplete(tx: Tx, userId: string, topicId: string): Promise<boolean> {
    const lessons = await tx.lesson.findMany({ where: { topicId, publishedVersionId: { not: null } }, select: { id: true } });
    if (lessons.length === 0) return false;
    const done = await tx.lessonProgress.findMany({
      where: { userId, completedAt: { not: null }, version: { lessonId: { in: lessons.map((l) => l.id) } } },
      select: { version: { select: { lessonId: true } } },
    });
    const ids = new Set(done.map((d) => d.version.lessonId));
    return lessons.every((l) => ids.has(l.id));
  }

  async award(tx: Tx, userId: string, events: GrantResult[]): Promise<XpAward> {
    const { total } = await this.currentTotals(tx, userId);
    return {
      grantedXp: events.reduce((s, e) => s + e.grantedXp, 0),
      events,
      leveledUp: events.some((e) => e.leveledUp),
      level: levelFor(total),
    };
  }

  // ───── O'qish ─────

  async summary(userId: string) {
    const [w, recent] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.xpLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    const total = w?.totalXpEarned ?? 0;
    return {
      xpBalance: w?.xpBalance ?? 0,
      totalXpEarned: total,
      level: levelFor(total),
      recent: recent.map(entryView),
    };
  }

  async history(userId: string, page: number, limit: number) {
    const [items, count] = await Promise.all([
      this.prisma.xpLedger.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.xpLedger.count({ where: { userId } }),
    ]);
    return { page, limit, total: count, items: items.map(entryView) };
  }
}

const entryView = (e: {
  id: string;
  eventType: XpEventType;
  kind: string;
  baseXp: number;
  multiplierBp: number;
  grantedXp: number;
  createdAt: Date;
  topicId: string | null;
  meta: Prisma.JsonValue;
}) => ({
  id: e.id,
  eventType: e.eventType,
  kind: e.kind,
  baseXp: e.baseXp,
  multiplierPct: Math.round(e.multiplierBp / 100),
  grantedXp: e.grantedXp,
  topicId: e.topicId,
  label: (e.meta as { label?: string } | null)?.label ?? null,
  createdAt: e.createdAt,
});
