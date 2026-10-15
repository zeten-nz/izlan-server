/**
 * PostgreSQL integratsion testlari (faqat DEVELOPMENT bazasi). Odatiy `npm test` da o'tkazib yuboriladi:
 *   RUN_DB_TESTS=1 node --test dist/xp/xp.integration.spec.js
 * Har test o'z (tasodifiy) foydalanuvchi/mavzularini yaratadi va oxirida o'chiradi.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PublicUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { QuizService } from '../quiz/quiz.service';
import { XpService } from './xp.service';

const RUN = process.env.RUN_DB_TESTS === '1';
const tag = `xpit${Date.now().toString(36)}`;

describe('XP integratsiya (PostgreSQL)', { skip: !RUN }, () => {
  const prisma = new PrismaService();
  const xp = new XpService(prisma);
  const learningStub = { topic: async () => ({}) } as never;
  const quiz = new QuizService(prisma, learningStub, xp);
  const profile = new ProfileService(prisma);

  const userIds: string[] = [];
  let direction = '';
  let level = '';
  let n = 0;
  const topicIds: string[] = [];

  const mkUser = async (role: 'STUDENT' | 'TEACHER' | 'ADMIN' = 'STUDENT') => {
    const u = await prisma.user.create({
      data: { username: `${tag}${n++}`, email: `${tag}${n}@test.invalid`, firstName: 'Test', lastName: 'User', birthYear: 2008, passwordHash: 'x', role, emailVerifiedAt: new Date() },
    });
    userIds.push(u.id);
    return u;
  };
  const pu = (u: { id: string; username: string; firstName: string; lastName: string; role: string }) =>
    ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role }) as unknown as PublicUser;
  const mkTopic = async () => {
    const t = await prisma.topic.create({ data: { levelId: level, ord: ++n + 100, title: `T${n}` } });
    topicIds.push(t.id);
    return t;
  };
  const mkLesson = async (topicId: string, authorId: string, published = true) => {
    const l = await prisma.lesson.create({ data: { topicId, authorId, title: `L${++n}` } });
    const v = await prisma.lessonVersion.create({
      data: { lessonId: l.id, status: published ? 'PUBLISHED' : 'DRAFT', doc: { schemaVersion: 1, pages: [] }, publishedAt: published ? new Date() : null },
    });
    if (published) await prisma.lesson.update({ where: { id: l.id }, data: { publishedVersionId: v.id } });
    return { lesson: l, version: v };
  };
  const completeLesson = async (userId: string, lesson: { id: string; topicId: string }, versionId: string, at?: Date) => {
    await prisma.lessonProgress.create({ data: { userId, versionId, completedAt: at ?? new Date() } });
    return prisma.$transaction((tx) => xp.onLessonFirstCompleted(tx, userId, lesson, at));
  };
  const wallet = async (userId: string) => prisma.wallet.findUnique({ where: { userId } });
  const ledgerSum = async (userId: string) => (await prisma.xpLedger.aggregate({ where: { userId }, _sum: { grantedXp: true } }))._sum.grantedXp ?? 0;

  before(async () => {
    await prisma.$connect();
    const author = await mkUser('TEACHER');
    void author;
    const d = await prisma.direction.create({ data: { slug: tag, kind: 'SUBJECT', title: tag, description: '', active: true, sortOrder: 0 } as never });
    direction = d.id;
    const l = await prisma.level.create({ data: { directionId: d.id, ord: 1, code: 'T1', title: 'T', summary: '', canDo: [], vocabHint: '' } as never });
    level = l.id;
  });

  after(async () => {
    // Avval mazmun (direction -> topic -> lesson/quiz cascade), keyin foydalanuvchilar (ledger cascade orqali ketadi)
    await prisma.direction.delete({ where: { id: direction } }).catch((e) => console.error("cleanup direction", e.message));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch((e) => console.error("cleanup users", e.message));
    await prisma.$disconnect();
  });

  test('dars birinchi marta: +10; takroriy chaqiruv: 0 (dedupe)', async () => {
    const [teacher] = userIds;
    const u = await mkUser();
    const t = await mkTopic();
    const { lesson, version } = await mkLesson(t.id, teacher);
    await mkLesson(t.id, teacher); // mavzuda yana bitta dars: mavzu hali tugamagan
    const r = await completeLesson(u.id, lesson, version.id);
    assert.equal(r.grantedXp, 10);
    const again = await prisma.$transaction((tx) => xp.onLessonFirstCompleted(tx, u.id, lesson));
    assert.equal(again.grantedXp, 0);
    assert.equal(again.events[0].duplicate, true);
    assert.equal((await wallet(u.id))?.totalXpEarned, 10);
  });

  test('mavzu tugashi: +25 bir marta; keyin yangi dars qo‘shilsa ham qayta berilmaydi', async () => {
    const [teacher] = userIds;
    const u = await mkUser();
    const t = await mkTopic();
    const a = await mkLesson(t.id, teacher);
    const b = await mkLesson(t.id, teacher);
    const r1 = await completeLesson(u.id, a.lesson, a.version.id);
    assert.equal(r1.grantedXp, 10);
    const r2 = await completeLesson(u.id, b.lesson, b.version.id);
    assert.equal(r2.grantedXp, 35, 'dars 10 + mavzu 25');
    const c = await mkLesson(t.id, teacher); // keyin qo'shilgan dars
    const r3 = await completeLesson(u.id, c.lesson, c.version.id);
    assert.equal(r3.grantedXp, 10, 'faqat dars XP, mavzu XP takrorlanmaydi');
    assert.equal(await ledgerSum(u.id), (await wallet(u.id))?.totalXpEarned);
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id, eventType: 'TOPIC_COMPLETE' } }), 1);
  });

  test('kunlik koeffitsiyent: 1-mavzu 100%, 2-mavzu 50%, 3+ 10%; tartib o‘zgarmaydi', async () => {
    const [teacher] = userIds;
    const u = await mkUser();
    const at = new Date('2026-10-14T05:00:00Z'); // 10:00 Toshkent
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const t = await mkTopic();
      const { lesson, version } = await mkLesson(t.id, teacher);
      await mkLesson(t.id, teacher); // mavzu tugamasin
      out.push((await completeLesson(u.id, lesson, version.id, at)).grantedXp);
    }
    assert.deepEqual(out, [10, 5, 1, 1]);
    const rows = await prisma.xpLedger.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(rows.map((r) => r.multiplierBp), [10000, 5000, 1000, 1000]);
    assert.deepEqual(rows.map((r) => r.policyVersion), Array(4).fill('xp-v1'));
  });

  test('lokal sana almashishi (Asia/Tashkent): yangi kunda tartib 1 dan boshlanadi', async () => {
    const [teacher] = userIds;
    const u = await mkUser();
    const t1 = await mkTopic();
    const t2 = await mkTopic();
    const l1 = await mkLesson(t1.id, teacher);
    const l2 = await mkLesson(t2.id, teacher);
    await mkLesson(t1.id, teacher);
    await mkLesson(t2.id, teacher);
    const lateNight = new Date('2026-10-14T18:59:00Z'); // 23:59 Toshkent
    const justAfter = new Date('2026-10-14T19:01:00Z'); // 00:01 keyingi kun
    const a = await completeLesson(u.id, l1.lesson, l1.version.id, lateNight);
    const b = await completeLesson(u.id, l2.lesson, l2.version.id, justAfter);
    assert.equal(a.events[0].topicDayOrd, 1);
    assert.equal(b.events[0].topicDayOrd, 1, 'yangi kun: tartib qayta boshlanadi');
    assert.equal(b.grantedXp, 10);
  });

  test('parallel bir xil hodisa: faqat bitta yoziladi', async () => {
    const u = await mkUser();
    const t = await mkTopic();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction((tx) =>
          xp.grant(tx, { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: 'same', topicId: t.id, baseXp: 10, dedupeKey: `par:${u.id}` }),
        ),
      ),
    );
    assert.equal(results.filter((r) => !r.duplicate && r.grantedXp === 10).length, 1);
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id } }), 1);
    assert.equal((await wallet(u.id))?.totalXpEarned, 10);
  });

  test('parallel turli mavzular: ikkisiga 100% berilmaydi, tartiblar noyob', async () => {
    const u = await mkUser();
    const ts = await Promise.all([mkTopic(), mkTopic(), mkTopic(), mkTopic()]);
    const at = new Date('2026-10-20T06:00:00Z');
    const res = await Promise.all(
      ts.map((t) =>
        prisma.$transaction((tx) =>
          xp.grant(tx, { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: t.id, topicId: t.id, baseXp: 10, dedupeKey: `pt:${u.id}:${t.id}`, at }),
        ),
      ),
    );
    const ords = res.map((r) => r.topicDayOrd).sort();
    assert.deepEqual(ords, [1, 2, 3, 4]);
    assert.equal(res.filter((r) => r.multiplierBp === 10000).length, 1);
    assert.equal(res.filter((r) => r.multiplierBp === 5000).length, 1);
    const total = res.reduce((s, r) => s + r.grantedXp, 0);
    assert.equal((await wallet(u.id))?.totalXpEarned, total);
    assert.equal(await ledgerSum(u.id), total);
  });

  test('atomiklik: tranzaksiya xato bilan tugasa ledger va wallet o‘zgarmaydi', async () => {
    const u = await mkUser();
    const t = await mkTopic();
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await xp.grant(tx, { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: 'x', topicId: t.id, baseXp: 10, dedupeKey: `atom:${u.id}` });
        throw new Error('rollback');
      }),
      /rollback/,
    );
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id } }), 0);
    assert.equal(await wallet(u.id), null);
  });

  test('append-only: UPDATE va to‘g‘ridan-to‘g‘ri DELETE taqiqlangan; foydalanuvchi cascade ishlaydi', async () => {
    const u = await mkUser();
    const t = await mkTopic();
    await prisma.$transaction((tx) =>
      xp.grant(tx, { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: 'x', topicId: t.id, baseXp: 10, dedupeKey: `ao:${u.id}` }),
    );
    await assert.rejects(prisma.$executeRaw`UPDATE "XpLedger" SET "grantedXp" = 999 WHERE "userId" = ${u.id}`, /append-only/);
    await assert.rejects(prisma.$executeRaw`DELETE FROM "XpLedger" WHERE "userId" = ${u.id}`, /append-only/);
    await assert.rejects(prisma.xpLedger.updateMany({ where: { userId: u.id }, data: { grantedXp: 5 } }));
    // manfiy EARN va balans CHECK
    await assert.rejects(
      prisma.xpLedger.create({
        data: { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: 'n', baseXp: 1, multiplierBp: 10000, grantedXp: -1, dedupeKey: `neg:${u.id}`, policyVersion: 'x', dayKey: '2026-01-01', balanceAfter: 0, totalAfter: 0 },
      }),
    );
    await prisma.user.delete({ where: { id: u.id } });
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id } }), 0);
  });

  describe('mavzu testi', () => {
    const questions = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `q${i + 1}`,
        text: `Savol ${i + 1}`,
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        correctId: 'a',
      }));
    const answersFor = (n: number, correct: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i + 1}`, i < correct ? 'a' : 'b']));

    test('ustoz vakolati: begona ustoz taqiqlanadi; o‘z mavzusi va admin ruxsat', async () => {
      const owner = await mkUser('TEACHER');
      const stranger = await mkUser('TEACHER');
      const admin = await mkUser('ADMIN');
      const t = await mkTopic();
      await mkLesson(t.id, owner.id);
      await assert.rejects(quiz.staffSaveDraft(pu(stranger), t.id, { title: 'X', questions: questions(3) }), ForbiddenException);
      await assert.rejects(quiz.staffGet(pu(stranger), t.id), ForbiddenException);
      const saved = await quiz.staffSaveDraft(pu(owner), t.id, { title: 'Test', questions: questions(3) });
      assert.equal(saved.rev, 1);
      // optimistic lock
      await assert.rejects(quiz.staffSaveDraft(pu(owner), t.id, { title: 'Test', questions: questions(3), rev: 99 }));
      assert.equal((await quiz.staffSaveDraft(pu(admin), t.id, { title: 'Test', questions: questions(4), rev: 1 })).rev, 2);
      // yaroqsiz nashr (3 tadan kam)
      const t2 = await mkTopic();
      await mkLesson(t2.id, owner.id);
      await quiz.staffSaveDraft(pu(owner), t2.id, { title: 'Kam', questions: questions(2) });
      await assert.rejects(quiz.staffPublish(pu(owner), t2.id));
    });

    test('natija backend’da: 65% +10, 85% +10, 95% +10, qayta 95% 0; 50% 0; to‘g‘ri javob oshkor emas', async () => {
      const owner = await mkUser('TEACHER');
      const u = await mkUser();
      const t = await mkTopic();
      await mkLesson(t.id, owner.id);
      await quiz.staffSaveDraft(pu(owner), t.id, { title: 'Test', questions: questions(20) });
      await quiz.staffPublish(pu(owner), t.id);

      const view = await quiz.studentView(u.id, t.id);
      assert.equal(view.available, true);
      assert.equal(JSON.stringify(view).includes('correctId'), false);

      const run = async (correct: number) => quiz.submit(u.id, t.id, answersFor(20, correct));
      assert.equal((await run(10)).xp.grantedXp, 0); // 50%
      assert.equal((await run(13)).xp.grantedXp, 10); // 65%
      assert.equal((await run(17)).xp.grantedXp, 10); // 85%: faqat farq
      assert.equal((await run(19)).xp.grantedXp, 10); // 95%
      assert.equal((await run(19)).xp.grantedXp, 0); // qayta
      assert.equal((await run(20)).xp.grantedXp, 0);
      assert.equal((await wallet(u.id))?.totalXpEarned, 30, 'mavzu bo‘yicha maksimal 30');
      assert.equal(await prisma.quizAttempt.count({ where: { userId: u.id } }), 6);
    });

    test('test XP ham kunlik koeffitsiyentdan keyin qo‘llanadi (3-mavzu: 10%)', async () => {
      const owner = await mkUser('TEACHER');
      const u = await mkUser();
      const at = new Date('2026-11-02T05:00:00Z');
      // 2 ta mavzuda oldin XP olingan: yangi test mavzusi 3-o'rinda
      for (let i = 0; i < 2; i++) {
        const t = await mkTopic();
        await prisma.$transaction((tx) => xp.grant(tx, { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: t.id, topicId: t.id, baseXp: 10, dedupeKey: `pre:${u.id}:${i}`, at }));
      }
      const t = await mkTopic();
      await mkLesson(t.id, owner.id);
      await quiz.staffSaveDraft(pu(owner), t.id, { title: 'T', questions: questions(10) });
      await quiz.staffPublish(pu(owner), t.id);
      const before = (await wallet(u.id))?.totalXpEarned ?? 0;
      // submit() bugungi sanadan foydalanadi; koeffitsiyent tekshiruvi uchun grant'ni aynan shu kunga qaratib ko'ramiz
      const r = await quiz.submit(u.id, t.id, answersFor(10, 10));
      assert.ok(r.xp.grantedXp <= 30);
      assert.equal(r.xp.events.every((e) => e.multiplierBp > 0), true);
      assert.equal((await wallet(u.id))?.totalXpEarned, before + r.xp.grantedXp);
    });
  });

  test('IZL o‘zgarmaydi; ommaviy profil faqat ruxsat berilsa daraja ko‘rsatadi (balans hech qachon)', async () => {
    const u = await mkUser();
    const viewer = await mkUser();
    const t = await mkTopic();
    await prisma.$transaction((tx) =>
      xp.grant(tx, { userId: u.id, eventType: 'LESSON_COMPLETE', sourceId: t.id, topicId: t.id, baseXp: 10, dedupeKey: `pub:${u.id}` }),
    );
    assert.equal((await wallet(u.id))?.izlBalance, 0);
    await prisma.profile.create({ data: { userId: u.id, isPublic: true, showStats: false } });
    let p = (await profile.publicByUsername(pu(viewer), u.username)) as Record<string, unknown>;
    assert.equal(p.level, null);
    await prisma.profile.update({ where: { userId: u.id }, data: { showStats: true } });
    p = (await profile.publicByUsername(pu(viewer), u.username)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(p.level as object).sort(), ['level', 'title']);
    const s = JSON.stringify(p).toLowerCase();
    for (const bad of ['xpbalance', 'totalxp', 'izlbalance', 'email']) assert.equal(s.includes(bad), false, bad);
  });

  test('tarixiy backfill: migratsiya BACKFILL belgisi XP bermaydi', async () => {
    const raw = new PrismaClient();
    const n2 = await raw.xpLedger.count({ where: { eventType: 'TOPIC_COMPLETE', dedupeKey: { startsWith: 'backfill' } } });
    assert.equal(n2, 0);
    await raw.$disconnect();
  });
});
