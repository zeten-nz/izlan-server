/**
 * XP do'koni va achievement: PostgreSQL integratsion testlari (faqat DEVELOPMENT bazasi).
 *   RUN_DB_TESTS=1 node --test dist/shop/shop.integration.spec.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { AchievementsService } from '../achievements/achievements.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { XpService } from '../xp/xp.service';
import { ShopService } from './shop.service';
import type { PublicUser } from '../auth/auth.service';

const RUN = process.env.RUN_DB_TESTS === '1';
const tag = `shp${Date.now().toString(36)}`;
const key = () => `k-${randomUUID()}`;

describe('XP do‘koni + achievement (PostgreSQL)', { skip: !RUN }, () => {
  const prisma = new PrismaService();
  const xp = new XpService(prisma);
  const shop = new ShopService(prisma, xp);
  const ach = new AchievementsService(prisma);
  const profile = new ProfileService(prisma);

  const userIds: string[] = [];
  const itemIds: string[] = [];
  let n = 0;
  let direction = '';
  let level = '';
  let teacher = '';

  const mkUser = async (role: 'STUDENT' | 'TEACHER' = 'STUDENT') => {
    const u = await prisma.user.create({
      data: { username: `${tag}${n++}`, email: `${tag}${n}@test.invalid`, firstName: 'Test', lastName: 'User', birthYear: 2008, passwordHash: 'x', role, emailVerifiedAt: new Date() },
    });
    userIds.push(u.id);
    return u;
  };
  const withXp = async (balance: number, total = balance, izl = 0) => {
    const u = await mkUser();
    await prisma.wallet.create({ data: { userId: u.id, xpBalance: balance, totalXpEarned: total, izlBalance: izl } });
    return u;
  };
  const mkItem = async (price: number | null, status: 'ACTIVE' | 'DISABLED' | 'DRAFT' = 'ACTIVE', rarity: 'COMMON' | 'RARE' = 'COMMON') => {
    const i = await prisma.cosmeticItem.create({
      data: { slug: `${tag}-i${++n}`, kind: 'FRAME', rarity, name: `Bezak ${n}`, priceXp: price, status, preview: { key: 'ramka-neon' } },
    });
    itemIds.push(i.id);
    return i;
  };
  const wallet = (id: string) => prisma.wallet.findUniqueOrThrow({ where: { userId: id } });
  const mkTopic = async () => prisma.topic.create({ data: { levelId: level, ord: ++n + 100, title: `T${n}` } });
  const completedLesson = async (userId: string, topicId: string, at = new Date()) => {
    const l = await prisma.lesson.create({ data: { topicId, authorId: teacher, title: `L${++n}` } });
    const v = await prisma.lessonVersion.create({ data: { lessonId: l.id, status: 'PUBLISHED', doc: { schemaVersion: 1, pages: [] }, publishedAt: new Date() } });
    await prisma.lesson.update({ where: { id: l.id }, data: { publishedVersionId: v.id } });
    await prisma.lessonProgress.create({ data: { userId, versionId: v.id, completedAt: at } });
    return l;
  };
  const pu = (u: { id: string; username: string }) => ({ id: u.id, username: u.username, firstName: 'T', lastName: 'U', role: 'STUDENT' }) as unknown as PublicUser;
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'OK';
    } catch (e) {
      const r = (e as { getResponse?: () => { code?: string } }).getResponse?.();
      return r?.code ?? (e as Error).message;
    }
  };

  before(async () => {
    await prisma.$connect();
    teacher = (await mkUser('TEACHER')).id;
    direction = (await prisma.direction.create({ data: { slug: tag, kind: 'SUBJECT', title: tag, description: '', active: true, sortOrder: 0 } })).id;
    level = (await prisma.level.create({ data: { directionId: direction, ord: 1, code: 'S1', title: 'S', summary: '', canDo: [], vocabHint: '' } })).id;
  });

  after(async () => {
    await prisma.direction.delete({ where: { id: direction } }).catch((e) => console.error('cleanup direction', e.message));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch((e) => console.error('cleanup users', e.message));
    await prisma.cosmeticItem.deleteMany({ where: { id: { in: itemIds } } }).catch((e) => console.error('cleanup items', e.message));
    await prisma.$disconnect();
  });

  test('yetarli XP: yechiladi, total o‘zgarmaydi, SPEND ledger va egalik yoziladi, IZL o‘zgarmaydi', async () => {
    const u = await withXp(500, 1000, 7);
    const item = await mkItem(200);
    const r = await shop.purchase(u.id, item.id, { idempotencyKey: key(), expectedPrice: 200 });
    assert.equal(r.pricePaid, 200);
    assert.equal(r.balanceAfter, 300);
    const w = await wallet(u.id);
    assert.equal(w.xpBalance, 300);
    assert.equal(w.totalXpEarned, 1000, 'jami XP kamaymaydi');
    assert.equal(w.izlBalance, 7, 'IZL o‘zgarmaydi');
    const row = await prisma.xpLedger.findFirstOrThrow({ where: { userId: u.id, kind: 'SPEND' } });
    assert.equal(row.grantedXp, -200);
    assert.equal(row.pricePaid, 200);
    assert.equal(row.cosmeticItemId, item.id);
    assert.equal(row.balanceAfter, 300);
    assert.equal(row.totalAfter, 1000);
    assert.equal(await prisma.cosmeticOwnership.count({ where: { userId: u.id, itemId: item.id, source: 'PURCHASE' } }), 1);
  });

  test('XP yetarli emas, narxsiz, DISABLED/DRAFT mahsulot: rad etiladi va hech narsa o‘zgarmaydi', async () => {
    const u = await withXp(100);
    const dear = await mkItem(500);
    const noPrice = await mkItem(null);
    const off = await mkItem(50, 'DISABLED');
    const draft = await mkItem(50, 'DRAFT');
    assert.equal(await code(shop.purchase(u.id, dear.id, { idempotencyKey: key() })), 'INSUFFICIENT_XP');
    assert.equal(await code(shop.purchase(u.id, noPrice.id, { idempotencyKey: key() })), 'NO_PRICE');
    assert.equal(await code(shop.purchase(u.id, off.id, { idempotencyKey: key() })), 'NOT_AVAILABLE');
    assert.equal(await code(shop.purchase(u.id, draft.id, { idempotencyKey: key() })), 'NOT_AVAILABLE');
    assert.equal((await wallet(u.id)).xpBalance, 100);
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id } }), 0);
    assert.equal(await prisma.cosmeticOwnership.count({ where: { userId: u.id } }), 0);
  });

  test('takroriy xarid, idempotency replay va boshqa mahsulot bilan bir xil kalit', async () => {
    const u = await withXp(1000);
    const a = await mkItem(100);
    const b = await mkItem(100);
    const k = key();
    const first = await shop.purchase(u.id, a.id, { idempotencyKey: k });
    const replay = await shop.purchase(u.id, a.id, { idempotencyKey: k });
    assert.equal(replay.replay, true);
    assert.equal(replay.purchaseId, first.purchaseId);
    assert.equal(replay.balanceAfter, first.balanceAfter);
    assert.equal((await wallet(u.id)).xpBalance, 900, 'replay XP ni qayta yechmaydi');
    assert.equal(await code(shop.purchase(u.id, b.id, { idempotencyKey: k })), 'KEY_REUSED');
    assert.equal(await code(shop.purchase(u.id, a.id, { idempotencyKey: key() })), 'ALREADY_OWNED');
    assert.equal((await wallet(u.id)).xpBalance, 900);
  });

  test('boshqa foydalanuvchi kalitidan foydalana olmaydi (kalit foydalanuvchiga bog‘liq)', async () => {
    const u1 = await withXp(500);
    const u2 = await withXp(500);
    const item = await mkItem(100);
    const k = key();
    await shop.purchase(u1.id, item.id, { idempotencyKey: k });
    const r = await shop.purchase(u2.id, item.id, { idempotencyKey: k });
    assert.equal(r.replay, false);
    assert.equal((await wallet(u1.id)).xpBalance, 400);
    assert.equal((await wallet(u2.id)).xpBalance, 400);
  });

  test('parallel: bitta bezak 8 ta so‘rov bilan — faqat bittasi muvaffaqiyatli, XP bir marta yechiladi', async () => {
    const u = await withXp(1000);
    const item = await mkItem(300);
    const res = await Promise.all(Array.from({ length: 8 }, () => code(shop.purchase(u.id, item.id, { idempotencyKey: key() }))));
    assert.equal(res.filter((r) => r === 'OK').length, 1);
    assert.equal((await wallet(u.id)).xpBalance, 700);
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id, kind: 'SPEND' } }), 1);
    assert.equal(await prisma.cosmeticOwnership.count({ where: { userId: u.id } }), 1);
  });

  test('parallel: bir nechta mahsulot — balans manfiyga tushmaydi', async () => {
    const u = await withXp(250);
    const items = await Promise.all([mkItem(100), mkItem(100), mkItem(100), mkItem(100)]);
    const res = await Promise.all(items.map((i) => code(shop.purchase(u.id, i.id, { idempotencyKey: key() }))));
    assert.equal(res.filter((r) => r === 'OK').length, 2, '250 XP bilan 100 XP lik 2 ta');
    assert.equal(res.filter((r) => r === 'INSUFFICIENT_XP').length, 2);
    assert.equal((await wallet(u.id)).xpBalance, 50);
  });

  test('narx o‘zgarishi: eski narx ko‘rgan mijoz PRICE_CHANGED oladi; avvalgi xarid tarixi eski narxni saqlaydi', async () => {
    const u = await withXp(1000);
    const item = await mkItem(200);
    await prisma.cosmeticItem.update({ where: { id: item.id }, data: { priceXp: 350 } });
    assert.equal(await code(shop.purchase(u.id, item.id, { idempotencyKey: key(), expectedPrice: 200 })), 'PRICE_CHANGED');
    assert.equal((await wallet(u.id)).xpBalance, 1000);
    const r = await shop.purchase(u.id, item.id, { idempotencyKey: key(), expectedPrice: 350 });
    assert.equal(r.pricePaid, 350);
    // keyin admin narxni o'zgartiradi: tarix snapshot'i o'zgarmaydi, egalik qayta sotib olishni talab qilmaydi
    await prisma.cosmeticItem.update({ where: { id: item.id }, data: { priceXp: 999 } });
    const h = await shop.history(u.id, 1, 10);
    assert.equal(h.items[0].pricePaid, 350);
    assert.equal(await code(shop.purchase(u.id, item.id, { idempotencyKey: key() })), 'ALREADY_OWNED');
    // DISABLED qilingach ham egalik saqlanadi
    await prisma.cosmeticItem.update({ where: { id: item.id }, data: { status: 'DISABLED' } });
    assert.equal(await prisma.cosmeticOwnership.count({ where: { userId: u.id, itemId: item.id } }), 1);
  });

  test('xarid tarixi: pagination va faqat o‘zining xaridlari', async () => {
    const u = await withXp(10_000);
    const other = await withXp(10_000);
    for (let i = 0; i < 5; i++) await shop.purchase(u.id, (await mkItem(10)).id, { idempotencyKey: key() });
    await shop.purchase(other.id, (await mkItem(10)).id, { idempotencyKey: key() });
    const p1 = await shop.history(u.id, 1, 2);
    const p3 = await shop.history(u.id, 3, 2);
    assert.equal(p1.total, 5);
    assert.equal(p1.items.length, 2);
    assert.equal(p3.items.length, 1);
    assert.ok(p1.items.every((x) => x.status === 'COMPLETED'));
  });

  test('ledger: UPDATE/DELETE taqiqlangan; SPEND shakli CHECK bilan himoyalangan; total XP va daraja o‘zgarmagan', async () => {
    const u = await withXp(500, 1000);
    const item = await mkItem(100);
    await shop.purchase(u.id, item.id, { idempotencyKey: key() });
    await assert.rejects(prisma.$executeRaw`UPDATE "XpLedger" SET "grantedXp" = 0 WHERE "userId" = ${u.id}`, /append-only/);
    await assert.rejects(prisma.$executeRaw`DELETE FROM "XpLedger" WHERE "userId" = ${u.id}`, /append-only/);
    await assert.rejects(
      prisma.xpLedger.create({
        data: { userId: u.id, kind: 'SPEND', eventType: 'PURCHASE', sourceId: 'x', baseXp: 0, multiplierBp: 0, grantedXp: -5, dedupeKey: `bad:${u.id}`, policyVersion: 'x', dayKey: '2026-01-01', balanceAfter: 0, totalAfter: 0 },
      }),
      /spend_shape|check/i,
    );
    const w = await wallet(u.id);
    assert.equal(w.totalXpEarned, 1000);
    const me = await profile.me({ id: u.id, username: 'x', firstName: 'T', lastName: 'U', role: 'STUDENT' } as unknown as PublicUser);
    assert.equal(me.xp.level.level, 4, '1000 jami XP = 4-daraja, xariddan keyin ham');
  });

  test('atomiklik: ownership yaratish xato bersa XP yechilmaydi', async () => {
    const u = await withXp(500);
    const item = await mkItem(100);
    // Egalikni oldindan (ledger'siz) yaratib qo'yamiz: xarid ALREADY_OWNED bilan to'xtaydi, XP tegilmaydi
    await prisma.cosmeticOwnership.create({ data: { userId: u.id, itemId: item.id, source: 'ADMIN_GRANT' } });
    assert.equal(await code(shop.purchase(u.id, item.id, { idempotencyKey: key() })), 'ALREADY_OWNED');
    assert.equal((await wallet(u.id)).xpBalance, 500);
    assert.equal(await prisma.xpLedger.count({ where: { userId: u.id } }), 0);
  });

  test('katalog holati: narxsiz = NO_PRICE, narxli = AVAILABLE, sotib olingan = OWNED', async () => {
    const u = await withXp(500);
    const a = await mkItem(100);
    const b = await mkItem(null);
    await shop.purchase(u.id, a.id, { idempotencyKey: key() });
    const cat = await profile.catalog(u.id, {});
    const byId = new Map(cat.items.map((i) => [i.id, i.status]));
    assert.equal(byId.get(a.id), 'OWNED');
    assert.equal(byId.get(b.id), 'NO_PRICE');
    assert.equal(cat.purchasesEnabled, true);
  });

  describe('achievement', () => {
    test('birinchi dars: badge beriladi, qayta chaqirilganda takrorlanmaydi, XP/IZL/bezak berilmaydi', async () => {
      const u = await withXp(0, 0);
      const t = await mkTopic();
      await completedLesson(u.id, t.id);
      const first = await prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 'lesson-complete'));
      assert.deepEqual(first.map((x) => x.slug), ['birinchi-qadam']);
      const again = await prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 'lesson-complete'));
      assert.deepEqual(again, []);
      assert.equal(await prisma.userAchievement.count({ where: { userId: u.id } }), 1);
      const row = await prisma.userAchievement.findFirstOrThrow({ where: { userId: u.id } });
      assert.equal(row.ruleVersion, 'ach-v1');
      assert.equal((row.reason as { metric: string }).metric, 'completedLessons');
      const w = await wallet(u.id);
      assert.equal(w.xpBalance, 0);
      assert.equal(w.totalXpEarned, 0);
      assert.equal(w.izlBalance, 0);
      assert.equal(await prisma.cosmeticOwnership.count({ where: { userId: u.id } }), 0);
      assert.equal(await prisma.xpLedger.count({ where: { userId: u.id } }), 0);
    });

    test('parallel baholash: badge bir marta', async () => {
      const u = await withXp(0, 0);
      const t = await mkTopic();
      await completedLesson(u.id, t.id);
      await Promise.all(Array.from({ length: 8 }, () => prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 'race'))));
      assert.equal(await prisma.userAchievement.count({ where: { userId: u.id } }), 1);
    });

    test('bilim yo‘lida: 9 ta mavzu yetmaydi, 10 ta beradi; intizomli: 7 xil kun', async () => {
      const u = await withXp(0, 0);
      for (let i = 0; i < 9; i++) {
        const t = await mkTopic();
        await prisma.topicCompletion.create({ data: { userId: u.id, topicId: t.id, source: 'LESSONS' } });
      }
      let got = (await prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 't'))).map((x) => x.slug);
      assert.equal(got.includes('bilim-yolida'), false);
      const t10 = await mkTopic();
      await prisma.topicCompletion.create({ data: { userId: u.id, topicId: t10.id, source: 'LESSONS' } });
      got = (await prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 't'))).map((x) => x.slug);
      assert.ok(got.includes('bilim-yolida'));

      // 7 xil kun (Asia/Tashkent): 6 kun yetmaydi
      const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 0, 10 + i, 7, 0, 0)));
      const topic = await mkTopic();
      for (const d of days.slice(0, 6)) await completedLesson(u.id, topic.id, d);
      assert.equal((await ach.metrics(prisma, u.id)).activeDays, 6);
      assert.equal((await prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 't'))).some((x) => x.slug === 'intizomli'), false);
      await completedLesson(u.id, topic.id, days[6]);
      assert.equal((await prisma.$transaction((tx) => ach.evaluateInTx(tx, u.id, 't'))).some((x) => x.slug === 'intizomli'), true);
    });

    test('lokal kun chegarasi: bir Toshkent kunida ikki faoliyat = 1 kun', async () => {
      const u = await withXp(0, 0);
      const t = await mkTopic();
      await completedLesson(u.id, t.id, new Date('2026-03-01T01:00:00Z')); // 06:00 Toshkent
      await completedLesson(u.id, t.id, new Date('2026-03-01T18:30:00Z')); // 23:30 Toshkent, shu kun
      await completedLesson(u.id, t.id, new Date('2026-03-01T19:30:00Z')); // 00:30 keyingi kun
      assert.equal((await ach.metrics(prisma, u.id)).activeDays, 2);
    });

    test('nofaol ta’rif berilmaydi; reconcile idempotent va XP bermaydi', async () => {
      const u = await withXp(0, 0);
      const t = await mkTopic();
      await completedLesson(u.id, t.id);
      await prisma.achievementDefinition.update({ where: { slug: 'birinchi-qadam' }, data: { active: false } });
      try {
        assert.deepEqual(await ach.reconcileUser(u.id), []);
      } finally {
        await prisma.achievementDefinition.update({ where: { slug: 'birinchi-qadam' }, data: { active: true } });
      }
      const first = await ach.reconcileUser(u.id);
      assert.deepEqual(first.map((x) => x.slug), ['birinchi-qadam']);
      assert.deepEqual(await ach.reconcileUser(u.id), []);
      assert.equal((await wallet(u.id)).totalXpEarned, 0);
    });

    test('showcase: faqat o‘zi olgan badge, ko‘pi bilan 3 ta; boshqa foydalanuvchining badge’i taqiqlanadi', async () => {
      const u = await withXp(0, 0);
      const other = await withXp(0, 0);
      const t = await mkTopic();
      await completedLesson(u.id, t.id);
      await ach.reconcileUser(u.id);
      assert.deepEqual(await ach.setShowcase(u.id, ['birinchi-qadam']), { showcase: ['birinchi-qadam'] });
      // olinmagan badge
      await assert.rejects(ach.setShowcase(u.id, ['ilm-fidoyisi']), /o'zingiz olgan/);
      // boshqa foydalanuvchida bu badge yo'q
      await assert.rejects(ach.setShowcase(other.id, ['birinchi-qadam']), /o'zingiz olgan/);
      await assert.rejects(ach.setShowcase(u.id, ['a', 'b', 'c', 'd']));
      await assert.rejects(ach.setShowcase(u.id, ['birinchi-qadam', 'birinchi-qadam']));
      const list = await ach.listForUser(u.id);
      assert.equal(list.items.find((i) => i.slug === 'birinchi-qadam')?.showcaseOrder, 1);
      assert.deepEqual(await ach.setShowcase(u.id, []), { showcase: [] });
    });

    test('ommaviy profil: badge faqat showAchievements ruxsat berganda; balans/IZL/email oshkor emas', async () => {
      const u = await withXp(321, 654, 9);
      const viewer = await mkUser();
      const t = await mkTopic();
      await completedLesson(u.id, t.id);
      await ach.reconcileUser(u.id);
      await prisma.profile.create({ data: { userId: u.id, isPublic: true, showAchievements: false, showStats: false } });
      let p = (await profile.publicByUsername(pu(viewer), u.username)) as Record<string, unknown>;
      assert.equal(p.achievements, null);
      await prisma.profile.update({ where: { userId: u.id }, data: { showAchievements: true } });
      p = (await profile.publicByUsername(pu(viewer), u.username)) as Record<string, unknown>;
      assert.equal((p.achievements as unknown[]).length, 1);
      const s = JSON.stringify(p).toLowerCase();
      for (const bad of ['xpbalance', 'totalxp', 'izlbalance', 'email', '321', '654']) assert.equal(s.includes(bad), false, bad);
    });
  });
});
