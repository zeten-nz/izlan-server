import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LearningService } from '../learning/learning.service';
import { parseDoc, type LessonDoc } from '../lessons/doc.schema';
import { StudentLessonsService } from '../lessons/student-lessons.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateNoteDto,
  CreateVocabularyDto,
  ListQueryDto,
  MistakesQueryDto,
  SavedListQueryDto,
  UpdateNoteDto,
  UpdateVocabularyDto,
} from './dto';
import { normKey, plainQuestion, projectLessonMistake, tidy, tidyBlock } from './notebook.util';

interface ResolvedSource {
  lessonId: string | null;
  pageId: string | null;
  topicId: string | null;
  directionId: string | null;
  sourceTitle: string;
}

interface SourceRow {
  lessonId: string | null;
  pageId: string | null;
  topicId: string | null;
  directionId: string | null;
  sourceTitle: string;
}

/** Manba holati: ok = ochish mumkin; locked = mavzu hali yopiq; unpublished/missing = dars endi mavjud emas. */
export type SourceState = 'none' | 'ok' | 'locked' | 'unpublished' | 'missing';

const paging = (q: { page?: number; limit?: number }, def = 20) => {
  const limit = q.limit ?? def;
  const page = q.page ?? 1;
  return { page, limit, skip: (page - 1) * limit };
};

@Injectable()
export class NotebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: LearningService,
    private readonly lessons: StudentLessonsService,
  ) {}

  // ───────────── Umumiy: manba va ko'rinish ─────────────

  /**
   * Yozuv manbasini tekshiradi va normallashtiradi. Dars berilsa mavjud kirish qoidalari qo'llanadi
   * (yopiq mavzu/nashr qilinmagan dars manbaga aylana olmaydi: sarlavha ham oshkor bo'lmaydi).
   */
  private async resolveSource(userId: string, dto: { lessonId?: string; pageId?: string; directionId?: string; topicId?: string }): Promise<ResolvedSource> {
    const none: ResolvedSource = { lessonId: null, pageId: null, topicId: null, directionId: null, sourceTitle: '' };
    if (dto.pageId && !dto.lessonId) throw new UnprocessableEntityException("Sahifa uchun dars ko'rsatilishi kerak");
    if (dto.lessonId) {
      const loc = await this.lessons.locate(userId, dto.lessonId, dto.pageId);
      return {
        lessonId: loc.lesson.id,
        pageId: loc.page?.id ?? null,
        topicId: loc.lesson.topicId,
        directionId: loc.lesson.directionId,
        sourceTitle: loc.lesson.title,
      };
    }
    if (dto.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId }, include: { level: true } });
      if (!topic) throw new NotFoundException('Mavzu topilmadi');
      if (dto.directionId && dto.directionId !== topic.level.directionId) {
        throw new UnprocessableEntityException("Mavzu tanlangan yo'nalishga tegishli emas");
      }
      await this.learning.topic(userId, topic.id); // yopiq mavzu → 403
      return { ...none, topicId: topic.id, directionId: topic.level.directionId, sourceTitle: topic.title };
    }
    if (dto.directionId) {
      const ud = await this.prisma.userDirection.findUnique({ where: { userId_directionId: { userId, directionId: dto.directionId } } });
      if (!ud) throw new ForbiddenException("Bu yo'nalish tanlanmagan");
      return { ...none, directionId: dto.directionId };
    }
    return none;
  }

  /** Bir nechta yozuv uchun manba holatini ommaviy hisoblaydi (N+1 yo'q). */
  private async sourceViews(userId: string, rows: SourceRow[]) {
    const lessonIds = [...new Set(rows.map((r) => r.lessonId).filter((x): x is string => !!x))];
    const lessons = lessonIds.length
      ? await this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, topicId: true, publishedVersionId: true } })
      : [];
    const lessonById = new Map(lessons.map((l) => [l.id, l]));
    const topicIds = [...new Set([...rows.map((r) => r.topicId), ...lessons.map((l) => l.topicId)].filter((x): x is string => !!x))];
    const topics = topicIds.length
      ? await this.prisma.topic.findMany({ where: { id: { in: topicIds } }, include: { level: { include: { direction: true } } } })
      : [];
    const topicById = new Map(topics.map((t) => [t.id, t]));
    const dirIds = [...new Set(rows.map((r) => r.directionId).filter((x): x is string => !!x))];
    const dirs = dirIds.length ? await this.prisma.direction.findMany({ where: { id: { in: dirIds } }, select: { id: true, title: true } }) : [];
    const dirTitle = new Map(dirs.map((d) => [d.id, d.title]));
    const accessible = await this.learning.accessibleTopicIds(userId, topicIds);

    return (r: SourceRow) => {
      const lesson = r.lessonId ? lessonById.get(r.lessonId) : undefined;
      const topicId = lesson?.topicId ?? r.topicId;
      const topic = topicId ? topicById.get(topicId) : undefined;
      let state: SourceState = 'none';
      if (r.lessonId) {
        state = !lesson ? 'missing' : !lesson.publishedVersionId ? 'unpublished' : topicId && accessible.has(topicId) ? 'ok' : 'locked';
      }
      const directionId = topic?.level.directionId ?? r.directionId;
      return {
        state,
        lessonId: r.lessonId,
        pageId: r.pageId,
        lessonTitle: lesson?.title ?? (r.lessonId ? r.sourceTitle : ''),
        topicId: topic ? topic.id : null,
        topicTitle: topic?.title ?? (!r.lessonId ? r.sourceTitle : ''),
        directionId: directionId ?? null,
        directionTitle: directionId ? (topic?.level.direction.title ?? dirTitle.get(directionId) ?? '') : '',
      };
    };
  }

  // ───────────── Umumiy ko'rsatkichlar ─────────────

  async summary(userId: string) {
    const [vocabulary, notes, saved, practice, lesson] = await Promise.all([
      this.prisma.vocabularyEntry.count({ where: { userId } }),
      this.prisma.studentNote.count({ where: { userId } }),
      this.prisma.savedMaterial.count({ where: { userId } }),
      this.prisma.userMistake.count({ where: { userId } }),
      this.prisma.lessonBlockAttempt.count({ where: { userId, wrongTries: { gt: 0 } } }),
    ]);
    return { vocabulary, notes, saved, mistakes: practice + lesson };
  }

  // ───────────── Lug'at ─────────────

  private vocabWhere(userId: string, q: ListQueryDto): Prisma.VocabularyEntryWhereInput {
    const text = tidy(q.q);
    return {
      userId,
      ...(q.directionId ? { directionId: q.directionId } : {}),
      ...(q.topicId ? { topicId: q.topicId } : {}),
      ...(text
        ? {
            OR: [
              { termKey: { contains: normKey(text) } },
              { meaning: { contains: text, mode: 'insensitive' } },
              { example: { contains: text, mode: 'insensitive' } },
              { note: { contains: text, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async listVocabulary(userId: string, q: ListQueryDto) {
    const { page, limit, skip } = paging(q);
    const where = this.vocabWhere(userId, q);
    const orderBy: Prisma.VocabularyEntryOrderByWithRelationInput[] =
      q.sort === 'az' ? [{ termKey: 'asc' }, { createdAt: 'desc' }] : [{ createdAt: q.sort === 'old' ? 'asc' : 'desc' }, { id: 'asc' }];
    const [total, rows] = await Promise.all([
      this.prisma.vocabularyEntry.count({ where }),
      this.prisma.vocabularyEntry.findMany({ where, orderBy, skip, take: limit }),
    ]);
    const view = await this.sourceViews(userId, rows);
    return { total, page, limit, items: rows.map((r) => this.vocabItem(r, view(r))) };
  }

  private vocabItem(r: Prisma.VocabularyEntryGetPayload<object>, source: unknown) {
    return {
      id: r.id,
      term: r.term,
      meaning: r.meaning,
      example: r.example,
      note: r.note,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      source,
    };
  }

  async createVocabulary(userId: string, dto: CreateVocabularyDto) {
    const term = tidy(dto.term);
    if (!term) throw new UnprocessableEntityException({ message: "So'z yoki atamani yozing", errors: { term: "So'z yoki atamani yozing" } });
    const meaning = tidy(dto.meaning);
    const termKey = normKey(term);
    const meaningKey = normKey(meaning);
    const source = await this.resolveSource(userId, dto);

    const same = await this.prisma.vocabularyEntry.findUnique({ where: { userId_termKey_meaningKey: { userId, termKey, meaningKey } } });
    if (same) return this.vocabResult(userId, same, false);

    if (!dto.force) {
      const others = await this.prisma.vocabularyEntry.findMany({ where: { userId, termKey }, orderBy: { createdAt: 'desc' }, take: 5 });
      if (others.length) {
        const view = await this.sourceViews(userId, others);
        throw new ConflictException({
          message: `«${term}» lug'atingizda bor. Boshqa ma'noda qo'shmoqchimisiz?`,
          code: 'DUPLICATE_TERM',
          existing: others.map((o) => this.vocabItem(o, view(o))),
        });
      }
    }
    try {
      const row = await this.prisma.vocabularyEntry.create({
        data: { userId, term, termKey, meaning, meaningKey, example: tidy(dto.example), note: tidyBlock(dto.note), ...this.sourceData(source) },
      });
      return this.vocabResult(userId, row, true);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Ikki bir xil so'rov bir vaqtda keldi: mavjudini qaytaramiz
        const row = await this.prisma.vocabularyEntry.findUnique({ where: { userId_termKey_meaningKey: { userId, termKey, meaningKey } } });
        if (row) return this.vocabResult(userId, row, false);
      }
      throw e;
    }
  }

  private async vocabResult(userId: string, row: Prisma.VocabularyEntryGetPayload<object>, created: boolean) {
    const view = await this.sourceViews(userId, [row]);
    return { created, entry: this.vocabItem(row, view(row)) };
  }

  private sourceData(s: ResolvedSource) {
    return { lessonId: s.lessonId, pageId: s.pageId, topicId: s.topicId, directionId: s.directionId, sourceTitle: s.sourceTitle };
  }

  async updateVocabulary(userId: string, id: string, dto: UpdateVocabularyDto) {
    const cur = await this.prisma.vocabularyEntry.findFirst({ where: { id, userId } });
    if (!cur) throw new NotFoundException("So'z topilmadi");
    const term = dto.term !== undefined ? tidy(dto.term) : cur.term;
    if (!term) throw new UnprocessableEntityException({ message: "So'z yoki atamani yozing", errors: { term: "So'z yoki atamani yozing" } });
    const meaning = dto.meaning !== undefined ? tidy(dto.meaning) : cur.meaning;
    const termKey = normKey(term);
    const meaningKey = normKey(meaning);
    try {
      const row = await this.prisma.vocabularyEntry.update({
        where: { id },
        data: {
          term,
          termKey,
          meaning,
          meaningKey,
          ...(dto.example !== undefined ? { example: tidy(dto.example) } : {}),
          ...(dto.note !== undefined ? { note: tidyBlock(dto.note) } : {}),
        },
      });
      return this.vocabResult(userId, row, false);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ message: "Bunday so'z va ma'no lug'atda allaqachon bor", errors: { term: "Bunday so'z va ma'no allaqachon bor" } });
      }
      throw e;
    }
  }

  async deleteVocabulary(userId: string, id: string) {
    const r = await this.prisma.vocabularyEntry.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException("So'z topilmadi");
    return { deleted: true };
  }

  // ───────────── Eslatmalar ─────────────

  async listNotes(userId: string, q: ListQueryDto) {
    const { page, limit, skip } = paging(q);
    const text = tidy(q.q);
    const where: Prisma.StudentNoteWhereInput = {
      userId,
      ...(q.directionId ? { directionId: q.directionId } : {}),
      ...(q.topicId ? { topicId: q.topicId } : {}),
      ...(text ? { OR: [{ title: { contains: text, mode: 'insensitive' } }, { body: { contains: text, mode: 'insensitive' } }] } : {}),
    };
    const orderBy: Prisma.StudentNoteOrderByWithRelationInput[] =
      q.sort === 'az' ? [{ title: 'asc' }, { updatedAt: 'desc' }] : [{ updatedAt: q.sort === 'old' ? 'asc' : 'desc' }, { id: 'asc' }];
    const [total, rows] = await Promise.all([
      this.prisma.studentNote.count({ where }),
      this.prisma.studentNote.findMany({ where, orderBy, skip, take: limit }),
    ]);
    const view = await this.sourceViews(userId, rows);
    return { total, page, limit, items: rows.map((r) => this.noteItem(r, view(r))) };
  }

  private noteItem(r: Prisma.StudentNoteGetPayload<object>, source: unknown) {
    return { id: r.id, title: r.title, body: r.body, createdAt: r.createdAt, updatedAt: r.updatedAt, source };
  }

  async createNote(userId: string, dto: CreateNoteDto) {
    const body = tidyBlock(dto.body);
    if (!body) throw new UnprocessableEntityException({ message: 'Eslatma matnini yozing', errors: { body: 'Eslatma matnini yozing' } });
    const source = await this.resolveSource(userId, dto);
    const row = await this.prisma.studentNote.create({ data: { userId, title: tidy(dto.title), body, ...this.sourceData(source) } });
    const view = await this.sourceViews(userId, [row]);
    return { created: true, note: this.noteItem(row, view(row)) };
  }

  async updateNote(userId: string, id: string, dto: UpdateNoteDto) {
    const cur = await this.prisma.studentNote.findFirst({ where: { id, userId } });
    if (!cur) throw new NotFoundException('Eslatma topilmadi');
    const body = dto.body !== undefined ? tidyBlock(dto.body) : undefined;
    if (body !== undefined && !body) throw new UnprocessableEntityException({ message: 'Eslatma matnini yozing', errors: { body: 'Eslatma matnini yozing' } });
    const row = await this.prisma.studentNote.update({
      where: { id },
      data: { ...(dto.title !== undefined ? { title: tidy(dto.title) } : {}), ...(body !== undefined ? { body } : {}) },
    });
    const view = await this.sourceViews(userId, [row]);
    return { created: false, note: this.noteItem(row, view(row)) };
  }

  async deleteNote(userId: string, id: string) {
    const r = await this.prisma.studentNote.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Eslatma topilmadi');
    return { deleted: true };
  }

  // ───────────── Saqlanganlar ─────────────

  /** Idempotent: (o'quvchi, dars, sahifa) bo'yicha bitta yozuv. Takroriy saqlash dublikat yaratmaydi. */
  async save(userId: string, lessonId: string, pageId?: string) {
    const loc = await this.lessons.locate(userId, lessonId, pageId);
    const key = { userId, lessonId: loc.lesson.id, pageId: loc.page?.id ?? '' };
    const data = {
      ...key,
      directionId: loc.lesson.directionId,
      topicId: loc.lesson.topicId,
      lessonTitle: loc.lesson.title,
      pageTitle: loc.page?.title ?? '',
    };
    let created = true;
    let row;
    try {
      row = await this.prisma.savedMaterial.create({ data });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      created = false;
      row = await this.prisma.savedMaterial.findUniqueOrThrow({ where: { userId_lessonId_pageId: key } });
    }
    return { created, saved: { id: row.id, lessonId: row.lessonId, pageId: row.pageId || null } };
  }

  async removeSaved(userId: string, id: string) {
    const r = await this.prisma.savedMaterial.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Saqlangan material topilmadi');
    return { deleted: true };
  }

  /** Player uchun: shu dars va uning sahifalaridan qaysilari saqlangan. */
  async savedStatus(userId: string, lessonId: string) {
    const rows = await this.prisma.savedMaterial.findMany({ where: { userId, lessonId }, select: { id: true, pageId: true } });
    const pages: Record<string, string> = {};
    let lesson: string | null = null;
    for (const r of rows) {
      if (r.pageId === '') lesson = r.id;
      else pages[r.pageId] = r.id;
    }
    return { lesson, pages };
  }

  async listSaved(userId: string, q: SavedListQueryDto) {
    const { page, limit, skip } = paging(q);
    const where: Prisma.SavedMaterialWhereInput = {
      userId,
      ...(q.directionId ? { directionId: q.directionId } : {}),
      ...(q.topicId ? { topicId: q.topicId } : {}),
      ...(q.kind === 'lesson' ? { pageId: '' } : q.kind === 'page' ? { pageId: { not: '' } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.savedMaterial.count({ where }),
      this.prisma.savedMaterial.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take: limit }),
    ]);
    const view = await this.sourceViews(userId, rows.map((r) => ({ lessonId: r.lessonId, pageId: r.pageId || null, topicId: r.topicId, directionId: r.directionId, sourceTitle: r.lessonTitle })));
    // Sahifa hozirgi nashrda hali mavjudmi (dars keyinroq tahrirlangan bo'lishi mumkin)
    const pageLessonIds = [...new Set(rows.filter((r) => r.pageId).map((r) => r.lessonId))];
    const pub = pageLessonIds.length
      ? await this.prisma.lesson.findMany({ where: { id: { in: pageLessonIds } }, select: { id: true, published: { select: { doc: true } } } })
      : [];
    const pageIdsByLesson = new Map<string, Set<string>>();
    for (const l of pub) {
      const parsed = l.published ? parseDoc(l.published.doc) : null;
      if (parsed?.ok) pageIdsByLesson.set(l.id, new Set((parsed.doc as LessonDoc).pages.map((p) => p.id)));
    }
    return {
      total,
      page,
      limit,
      items: rows.map((r) => {
        const src = view({ lessonId: r.lessonId, pageId: r.pageId || null, topicId: r.topicId, directionId: r.directionId, sourceTitle: r.lessonTitle });
        const known = pageIdsByLesson.get(r.lessonId);
        return {
          id: r.id,
          kind: r.pageId ? 'page' : 'lesson',
          title: src.lessonTitle || r.lessonTitle,
          pageId: r.pageId || null,
          pageTitle: r.pageTitle,
          createdAt: r.createdAt,
          // Sahifa o'chirilgan/almashgan bo'lsa ham dars havolasi ishlaydi; foydalanuvchiga aniq aytiladi
          pageMissing: !!r.pageId && src.state === 'ok' && !!known && !known.has(r.pageId),
          source: { ...src, lessonTitle: src.lessonTitle || r.lessonTitle },
        };
      }),
    };
  }

  // ───────────── Xatolarim: dars bloklaridagi xatolar ─────────────

  /**
   * Dars blokidagi noto'g'ri urinishlar. Manba — mavjud `LessonBlockAttempt` (server baholashi o'zgarmagan).
   * To'g'ri javob faqat blok keyin to'g'ri bajarilgan bo'lsa ochiladi. Qoida (Rule) bilan bog'lanish YO'Q:
   * dars bloklari qoidaga bog'lanmagan va tarixiy ma'lumotni taxmin qilmaymiz.
   */
  async lessonMistakes(userId: string, q: MistakesQueryDto) {
    const { page, limit, skip } = paging(q);
    const where: Prisma.LessonBlockAttemptWhereInput = {
      userId,
      wrongTries: { gt: 0 },
      ...(q.unresolvedOnly ? { everCorrect: false } : {}),
      ...(q.topicId ? { version: { lesson: { topicId: q.topicId } } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.lessonBlockAttempt.count({ where }),
      this.prisma.lessonBlockAttempt.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip,
        take: limit,
        include: { version: { select: { id: true, doc: true, lesson: { select: { id: true, title: true, topicId: true, publishedVersionId: true } } } } },
      }),
    ]);
    const topicIds = [...new Set(rows.map((r) => r.version.lesson.topicId))];
    const topics = topicIds.length ? await this.prisma.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, title: true } }) : [];
    const topicTitle = new Map(topics.map((t) => [t.id, t.title]));
    const accessible = await this.learning.accessibleTopicIds(userId, topicIds);

    const docs = new Map<string, LessonDoc | null>();
    const docOf = (versionId: string, raw: unknown) => {
      if (!docs.has(versionId)) {
        const p = parseDoc(raw);
        docs.set(versionId, p.ok ? p.doc : null);
      }
      return docs.get(versionId)!;
    };

    const items = rows.flatMap((r) => {
      const doc = docOf(r.version.id, r.version.doc);
      if (!doc) return [];
      const pageIndex = doc.pages.findIndex((p) => p.blocks.some((b) => b.id === r.blockId));
      if (pageIndex < 0) return [];
      const pg = doc.pages[pageIndex];
      const block = pg.blocks.find((b) => b.id === r.blockId)!;
      const core = projectLessonMistake(block, r.response, r.everCorrect);
      if (!core) return [];
      const lesson = r.version.lesson;
      return [
        {
          id: r.id,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          topic: { id: lesson.topicId, title: topicTitle.get(lesson.topicId) ?? '', accessible: accessible.has(lesson.topicId) && !!lesson.publishedVersionId },
          pageId: pg.id,
          pageIndex,
          pageTitle: pg.title,
          blockId: r.blockId,
          ...core,
          questionText: plainQuestion(core),
          tries: r.tries,
          wrongTries: r.wrongTries,
          /** true = o'quvchi keyinroq shu blokni to'g'ri bajargan */
          resolved: r.everCorrect,
          /** dars keyin qayta nashr qilingan bo'lsa, bu xato eski versiyadan */
          fromCurrentVersion: lesson.publishedVersionId === r.version.id,
          lastAt: r.updatedAt,
        },
      ];
    });
    return { total, page, limit, items };
  }
}
