import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PublicUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from './assets.service';
import { emptyDoc, isInteractive, parseDoc, publishIssues, type LessonDoc } from './doc.schema';
import { collectMediaRefs, mediaIssues } from './media-check';
import { checkAnswer, projectPage } from './player';

@Injectable()
export class StaffLessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
  ) {}

  private invalid(issues: { path: string; message: string }[]): UnprocessableEntityException {
    return new UnprocessableEntityException({ message: issues[0]?.message ?? "Dars hujjati noto'g'ri", issues });
  }

  /** Dars egasi yoki ADMIN. */
  private async own(user: PublicUser, id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Dars topilmadi');
    if (lesson.authorId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException("Bu dars sizniki emas");
    return lesson;
  }

  private async draftOf(lessonId: string) {
    const draft = await this.prisma.lessonVersion.findFirst({ where: { lessonId, status: 'DRAFT' } });
    if (!draft) throw new NotFoundException('Qoralama topilmadi');
    return draft;
  }

  /** Mavzu tanlash uchun: yo'nalish → daraja → mavzu. */
  async catalog() {
    const directions = await this.prisma.direction.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { levels: { orderBy: { ord: 'asc' }, include: { topics: { orderBy: { ord: 'asc' } } } } },
    });
    return {
      directions: directions.map((d) => ({
        id: d.id,
        title: d.title,
        levels: d.levels.map((l) => ({
          id: l.id,
          code: l.code,
          title: l.title,
          topics: l.topics.map((t) => ({ id: t.id, ord: t.ord, title: t.title })),
        })),
      })),
    };
  }

  async list(user: PublicUser) {
    const lessons = await this.prisma.lesson.findMany({
      where: user.role === 'ADMIN' ? {} : { authorId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { topic: { include: { level: { include: { direction: true } } } }, published: { select: { rev: true, publishedAt: true } } },
    });
    return {
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        updatedAt: l.updatedAt,
        published: l.published ? { rev: l.published.rev, at: l.published.publishedAt } : null,
        topic: { id: l.topic.id, title: l.topic.title, levelCode: l.topic.level.code, directionTitle: l.topic.level.direction.title },
      })),
    };
  }

  /**
   * Darsni mavzu oxiriga qo'shadi: sortOrder = MAX + 100. Mavzu qatori qulflanadi, shuning uchun parallel
   * yaratishda bir xil qiymat chiqmaydi (chiqsa ham, tartib createdAt, id bo'yicha deterministik).
   */
  private createInTopic(topicId: string, data: Omit<Prisma.LessonUncheckedCreateInput, 'topicId' | 'sortOrder'>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Topic" WHERE id = ${topicId} FOR UPDATE`;
      const last = await tx.lesson.aggregate({ where: { topicId }, _max: { sortOrder: true } });
      return tx.lesson.create({ data: { ...data, topicId, sortOrder: (last._max.sortOrder ?? 0) + 100 } });
    });
  }

  async create(user: PublicUser, topicId: string, title: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException('Mavzu topilmadi');
    const lesson = await this.createInTopic(topicId, {
      authorId: user.id,
      title: title.trim(),
      versions: { create: { status: 'DRAFT', doc: emptyDoc() as unknown as Prisma.InputJsonValue } },
    });
    return { id: lesson.id };
  }

  async get(user: PublicUser, id: string) {
    const lesson = await this.own(user, id);
    const draft = await this.draftOf(id);
    const published = lesson.publishedVersionId
      ? await this.prisma.lessonVersion.findUnique({ where: { id: lesson.publishedVersionId } })
      : null;
    return {
      id: lesson.id,
      topicId: lesson.topicId,
      title: lesson.title,
      draft: { rev: draft.rev, doc: draft.doc },
      published: published ? { rev: published.rev, at: published.publishedAt } : null,
      /** Qoralamada nashr qilinmagan o'zgarish bormi */
      dirty: !published || published.rev !== draft.rev,
    };
  }

  async saveDraft(user: PublicUser, id: string, rev: number, title: string | undefined, input: unknown) {
    await this.own(user, id);
    const parsed = parseDoc(input);
    if (!parsed.ok) throw this.invalid(parsed.issues);
    const draft = await this.draftOf(id);
    // Optimistic lock: faqat mijoz ko'rgan rev bilan yoziladi
    const res = await this.prisma.lessonVersion.updateMany({
      where: { id: draft.id, rev },
      data: { doc: parsed.doc as unknown as Prisma.InputJsonValue, rev: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new ConflictException({ message: "Dars boshqa joyda o'zgartirilgan. Sahifani yangilang.", currentRev: draft.rev });
    }
    await this.prisma.lesson.update({ where: { id }, data: title ? { title: title.trim() } : { updatedAt: new Date() } });
    return { rev: rev + 1 };
  }

  async publish(user: PublicUser, id: string) {
    const lesson = await this.own(user, id);
    const draft = await this.draftOf(id);
    const parsed = parseDoc(draft.doc);
    if (!parsed.ok) throw this.invalid(parsed.issues);
    const issues = publishIssues(parsed.doc);
    // Media: asset DB'da bormi, turi mosmi, fayl diskda bormi (publishIssues sof/sinxron bo'lib qoladi)
    const refs = collectMediaRefs(parsed.doc);
    if (refs.length) {
      const { assets, files } = await this.assets.inspect(refs.map((r) => r.assetId));
      issues.push(...mediaIssues(refs, assets, files));
    }
    if (issues.length) throw this.invalid(issues);

    return this.prisma.$transaction(async (tx) => {
      if (lesson.publishedVersionId) {
        const cur = await tx.lessonVersion.findUnique({ where: { id: lesson.publishedVersionId } });
        if (cur && cur.rev === draft.rev) return { rev: cur.rev, unchanged: true };
      }
      const version = await tx.lessonVersion.create({
        data: { lessonId: id, status: 'PUBLISHED', rev: draft.rev, doc: draft.doc as Prisma.InputJsonValue, publishedAt: new Date() },
      });
      await tx.lesson.update({ where: { id }, data: { publishedVersionId: version.id } });
      return { rev: version.rev, unchanged: false };
    });
  }

  async unpublish(user: PublicUser, id: string) {
    await this.own(user, id);
    await this.prisma.lesson.update({ where: { id }, data: { publishedVersionId: null } });
    return { ok: true };
  }

  async duplicate(user: PublicUser, id: string, title?: string, topicId?: string) {
    const src = await this.own(user, id);
    if (topicId && !(await this.prisma.topic.findUnique({ where: { id: topicId } }))) throw new NotFoundException('Mavzu topilmadi');
    const draft = await this.draftOf(id);
    const copy = await this.createInTopic(topicId ?? src.topicId, {
      authorId: user.id,
      title: (title ?? `${src.title} (nusxa)`).trim().slice(0, 120),
      versions: { create: { status: 'DRAFT', doc: draft.doc as Prisma.InputJsonValue } },
    });
    return { id: copy.id };
  }

  /** O'quvchi faolligi bo'lmasa o'chiriladi; bo'lsa nashrdan olib tashlash tavsiya etiladi. */
  async remove(user: PublicUser, id: string) {
    await this.own(user, id);
    const used = await this.prisma.lessonProgress.count({ where: { version: { lessonId: id } } });
    if (used > 0) {
      throw new ConflictException("Bu darsni o'quvchilar boshlagan: o'chirib bo'lmaydi. Uni nashrdan oling.");
    }
    await this.prisma.lesson.delete({ where: { id } });
    return { ok: true };
  }

  // ───────────── Preview (o'quvchi ko'rinishi, saqlanmaydi) ─────────────

  async preview(user: PublicUser, id: string) {
    await this.own(user, id);
    const draft = await this.draftOf(id);
    const parsed = parseDoc(draft.doc);
    if (!parsed.ok) throw this.invalid(parsed.issues);
    return { pages: parsed.doc.pages.map(projectPage) };
  }

  async previewAnswer(user: PublicUser, id: string, blockId: string, payload: unknown) {
    await this.own(user, id);
    const draft = await this.draftOf(id);
    const parsed = parseDoc(draft.doc);
    if (!parsed.ok) throw this.invalid(parsed.issues);
    const block = (parsed.doc as LessonDoc).pages.flatMap((p) => p.blocks).find((b) => b.id === blockId);
    if (!block || !isInteractive(block)) throw new NotFoundException('Savol bloki topilmadi');
    const result = checkAnswer(block, payload);
    if (!result) throw new UnprocessableEntityException("Javob formati noto'g'ri");
    return result;
  }
}
