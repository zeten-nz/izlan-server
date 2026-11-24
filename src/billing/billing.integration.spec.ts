/**
 * Balans, saytdan to'ldirish (noyob summa), kurs xaridi va pullik mavzular: PostgreSQL integratsion testlari (faqat DEVELOPMENT bazasi).
 *   RUN_DB_TESTS=1 node --test dist/billing/billing.integration.spec.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { LearningService } from '../learning/learning.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

const RUN = process.env.RUN_DB_TESTS === '1';
const tag = `bil${Date.now().toString(36)}`;
const key = () => `k-${randomUUID()}`;

describe('Balans va kurs xaridi (PostgreSQL)', { skip: !RUN }, () => {
  const prisma = new PrismaService();
  const billing = new BillingService(prisma);
  const learning = new LearningService(prisma);
  process.env.TOPUP_CARD_NUMBER = '8600 0000 0000 0001';
  process.env.TOPUP_CARD_HOLDER = 'TEST HOLDER';

  const userIds: string[] = [];
  let directionId = '';
  let topic1 = '';
  let topic2 = '';
  let n = 0;
  const incomeIds: string[] = [];
  let ext = 0;
  /** Kartaga pul tushdi (kuzatuvchi yuborgandek) */
  const income = async (amount: number, o: { receivedAt?: Date; externalId?: string; hasFraction?: boolean } = {}) => {
    const r = await billing.recordIncome({ source: 'test', externalId: o.externalId ?? `${tag}:${ext++}`, amount, hasFraction: !!o.hasFraction, receivedAt: o.receivedAt ?? new Date() });
    incomeIds.push(r.incomeId);
    return r;
  };

  const mkUser = async () => {
    const u = await prisma.user.create({
      data: { username: `${tag}${n++}`, email: `${tag}${n}@test.invalid`, firstName: 'Test', lastName: 'User', birthYear: 2008, passwordHash: 'x', role: 'STUDENT', emailVerifiedAt: new Date() },
    });
    userIds.push(u.id);
    return u;
  };
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'OK';
    } catch (e) {
      const r = (e as { getResponse?: () => unknown }).getResponse?.() as { code?: string } | undefined;
      return r?.code ?? (e as Error).message;
    }
  };
  /** Yangi o'quvchi; amount berilsa — saytdan so'rov + kartaga to'lov orqali to'ldiriladi */
  const funded = async (amount = 0) => {
    const u = await mkUser();
    if (amount) {
      const r = await billing.requestTopup(u.id, amount);
      await income(r.amount);
    }
    return { u };
  };

  before(async () => {
    const d = await prisma.direction.create({ data: { slug: `${tag}-d`, kind: 'LANGUAGE', title: `Kurs ${tag}`, description: 'x', active: true, monthlyPriceUzs: 29_000 } });
    directionId = d.id;
    const l = await prisma.level.create({ data: { directionId, code: 'A1', ord: 1, title: 'A1', summary: 'x', canDo: [], vocabHint: 'x' } });
    topic1 = (await prisma.topic.create({ data: { levelId: l.id, ord: 1, title: 'T1' } })).id;
    topic2 = (await prisma.topic.create({ data: { levelId: l.id, ord: 2, title: 'T2' } })).id;
  });

  after(async () => {
    await prisma.bankIncome.deleteMany({ where: { id: { in: incomeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.direction.deleteMany({ where: { id: directionId } });
    await prisma.$disconnect();
  });

  test("so'rov: noyob summa, bitta faol so'rov; o'sha summa qayta — o'sha so'rov, boshqa summa — eskisi bekor", async () => {
    const u = await mkUser();
    const a = await billing.requestTopup(u.id, 4_321_000);
    assert.ok(a.amount > 4_321_000 && a.amount < 4_321_100);
    assert.equal(a.card?.number, '8600 0000 0000 0001');
    const again = await billing.requestTopup(u.id, 4_321_000);
    assert.equal(again.id, a.id);
    const other = await mkUser();
    const b = await billing.requestTopup(other.id, 4_321_000);
    assert.notEqual(b.amount, a.amount, 'bir vaqtda ikki kishiga bir xil summa berilmaydi');
    const c = await billing.requestTopup(u.id, 4_322_000);
    assert.equal((await billing.topupStatus(u.id, a.id)).status, 'CANCELLED');
    assert.equal(await code(billing.topupStatus(other.id, c.id)), "So'rov topilmadi", 'begona so\'rov ko\'rinmaydi');
    assert.equal(await code(billing.requestTopup(u.id, 4_500)), 'BAD_AMOUNT');
    const w = await billing.wallet(u.id);
    assert.equal(w.topup.pending?.id, c.id);
  });

  test("parallel so'rovlar bir xil summani ikki kishiga bermaydi", async () => {
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => mkUser()));
    const rs = await Promise.all(users.map((u) => billing.requestTopup(u.id, 4_323_000)));
    assert.equal(new Set(rs.map((r) => r.amount)).size, 5);
  });

  test("kirim: mos so'rov → balans +asosiy summa; qayta yuborilsa DUPLICATE; takroriy o'tkazma REVIEW", async () => {
    const u = await mkUser();
    const r = await billing.requestTopup(u.id, 50_000);
    const ext = `${tag}:dup`;
    const first = await income(r.amount, { externalId: ext });
    assert.equal(first.result, 'MATCH');
    assert.equal((first as { credited: number }).credited, 50_000);
    const dup = await billing.recordIncome({ source: 'test', externalId: ext, amount: r.amount, hasFraction: false, receivedAt: new Date() });
    assert.equal(dup.result, 'DUPLICATE');
    const second = await income(r.amount);
    assert.equal(second.result, 'REVIEW');
    const st = await billing.topupStatus(u.id, r.id);
    assert.deepEqual([st.status, st.balanceUzs], ['PAID', 50_000]);
    const w = await billing.wallet(u.id);
    assert.equal(w.history.length, 1);
    assert.equal(w.topup.pending, null);
  });

  test("kechikkan to'lov: muddat o'tgan, summa qayta berilmagan → egasiga (LATE_MATCH)", async () => {
    const u = await mkUser();
    const r = await billing.requestTopup(u.id, 4_324_000);
    await prisma.topupRequest.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 10 * 60_000) } });
    const res = await income(r.amount);
    assert.equal(res.result, 'LATE_MATCH');
    assert.equal((await billing.topupStatus(u.id, r.id)).balanceUzs, 4_324_000);
  });

  test("noto'g'ri summa REVIEW → admin username bo'yicha biriktiradi (asosiy summa), keyin qayta biriktirib bo'lmaydi", async () => {
    const u = await mkUser();
    const res = await income(4_325_077);
    assert.equal(res.result, 'REVIEW');
    const queue = await billing.reviewIncomes(500);
    assert.ok(queue.some((q) => q.id === res.incomeId && q.suggestedCredit === 4_325_000));
    const a = await billing.assignIncome(res.incomeId, `@${u.username}`, undefined, 'admin-test');
    assert.deepEqual([a.credited, a.balanceUzs], [4_325_000, 4_325_000]);
    assert.equal(await code(billing.assignIncome(res.incomeId, u.username, undefined, 'admin-test')), 'NOT_IN_REVIEW');
    const ig = await income(4_325_078);
    assert.equal((await billing.ignoreIncome(ig.incomeId, 'admin-test')).status, 'IGNORED');
  });

  test('xarid: balans yetmasa INSUFFICIENT_FUNDS; yetsa 30 kun ochiladi, qayta xarid uzaytiradi', async () => {
    const { u } = await funded(20_000);
    assert.equal(await code(billing.buy(u.id, directionId, key())), 'INSUFFICIENT_FUNDS');
    await income((await billing.requestTopup(u.id, 50_000)).amount);
    const k = key();
    const first = await billing.buy(u.id, directionId, k, 29_000);
    assert.equal(first.balanceUzs, 41_000);
    const replay = await billing.buy(u.id, directionId, k, 29_000);
    assert.equal(replay.replay, true);
    assert.equal(replay.balanceUzs, 41_000);
    const second = await billing.buy(u.id, directionId, key());
    assert.equal(second.balanceUzs, 12_000);
    const days = (second.endsAt!.getTime() - first.endsAt!.getTime()) / 86_400_000;
    assert.equal(Math.round(days), 30);
    assert.equal(await code(billing.buy(u.id, directionId, key(), 1)), 'PRICE_CHANGED');
  });

  test("xarid: bitta kalit boshqa kursga — KEY_REUSED; bepul kurs — FREE_COURSE; pul yechilmaydi", async () => {
    const { u } = await funded(30_000);
    const k = key();
    await billing.buy(u.id, directionId, k);
    const free = await prisma.direction.create({ data: { slug: `${tag}-free`, kind: 'LANGUAGE', title: `Bepul ${tag}`, description: 'x', active: true, monthlyPriceUzs: null } });
    try {
      assert.equal(await code(billing.buy(u.id, free.id, k)), 'KEY_REUSED');
      assert.equal(await code(billing.buy(u.id, free.id, key())), 'FREE_COURSE');
      const w = await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } });
      assert.equal(w.balanceUzs, 1_000);
    } finally {
      await prisma.direction.delete({ where: { id: free.id } });
    }
  });

  test("bekor qilish: begona so'rovni bekor qilib bo'lmaydi; bekor qilingan so'rovga kelgan pul REVIEW", async () => {
    const owner = await mkUser();
    const stranger = await mkUser();
    const r = await billing.requestTopup(owner.id, 4_324_000);
    assert.equal(await code(billing.cancelTopup(stranger.id, r.id)), "So'rov topilmadi");
    assert.equal((await billing.cancelTopup(owner.id, r.id)).status, 'CANCELLED');
    const inc = await income(r.amount);
    assert.equal(inc.result, 'REVIEW');
    assert.equal((inc as { reason?: string }).reason, 'CANCELLED');
    const w = await prisma.wallet.findUnique({ where: { userId: owner.id } });
    assert.equal(w?.balanceUzs ?? 0, 0);
  });

  test('parallel xaridlar balansni manfiyga tushirmaydi', async () => {
    const { u } = await funded(30_000);
    const results = await Promise.all([1, 2, 3].map(() => code(billing.buy(u.id, directionId, key()))));
    assert.equal(results.filter((r) => r === 'OK').length, 1);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(w.balanceUzs, 1_000);
  });

  test('pullik mavzu: 1-mavzu ochiq, 2-mavzu obunasiz PAYMENT_REQUIRED, xariddan keyin ochiladi', async () => {
    const { u } = await funded(29_000);
    await prisma.userDirection.create({ data: { userId: u.id, directionId, currentLevelOrd: 1, levelAccess: 'OPEN', placedBy: 'ZERO' } });
    assert.equal(await code(learning.topic(u.id, topic1)), 'OK');
    assert.equal(await code(learning.topic(u.id, topic2)), 'PAYMENT_REQUIRED');
    const ov = await learning.overview(u.id);
    const d = ov.directions.find((x) => x.directionId === directionId)!;
    assert.deepEqual(d.levels[0].topics.map((t) => t.paywalled), [false, true]);
    await billing.buy(u.id, directionId, key());
    assert.equal(await code(learning.topic(u.id, topic2)), 'OK');
  });

  test('pul tarixi append-only: UPDATE taqiqlangan', async () => {
    const { u } = await funded(5_000);
    const row = await prisma.moneyLedger.findFirstOrThrow({ where: { userId: u.id } });
    await assert.rejects(prisma.moneyLedger.update({ where: { id: row.id }, data: { note: 'x' } }), /append-only/);
  });
});
