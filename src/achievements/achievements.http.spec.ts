/**
 * HTTP darajasidagi integratsion test (haqiqiy NestJS ilovasi, Fastify `inject`, guard va pipe'lar bilan, DEVELOPMENT DB).
 *   RUN_DB_TESTS=1 node --test dist/achievements/achievements.http.spec.js
 *
 * Qamrab oladi: admin achievement faollashtirish (matnli id), rol tekshiruvi, 404/validatsiya, AuditLog;
 * XP xarid replay kontrakti (HTTP).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import { UnprocessableEntityException, ValidationPipe, type ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { after, before, describe, test } from 'node:test';
import { AppModule } from '../app.module';
import { newSessionToken } from '../auth/crypto.util';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

const RUN = process.env.RUN_DB_TESTS === '1';
const tag = `http${Date.now().toString(36)}`;

function toFieldErrors(errors: ValidationError[]): UnprocessableEntityException {
  const map: Record<string, string> = {};
  for (const e of errors) {
    const first = e.constraints ? Object.values(e.constraints)[0] : undefined;
    if (first) map[e.property] = first;
  }
  return new UnprocessableEntityException({ message: Object.values(map)[0] ?? "Ma'lumot noto'g'ri", errors: map });
}

describe('HTTP: achievement admin va XP xarid kontrakti', { skip: !RUN }, () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let cookieName = '';
  const userIds: string[] = [];
  const itemIds: string[] = [];
  let admin = '';
  let student = '';
  let studentId = '';
  let adminId = '';
  let originalActive = true;

  const mkUser = async (name: string, role: 'STUDENT' | 'ADMIN') => {
    const u = await prisma.user.create({
      data: { username: `${tag}${name}`, email: `${tag}${name}@test.invalid`, firstName: 'Http', lastName: 'Test', birthYear: 2008, passwordHash: 'x', role, emailVerifiedAt: new Date() },
    });
    userIds.push(u.id);
    const t = newSessionToken();
    await prisma.session.create({ data: { userId: u.id, tokenHash: t.hash, remember: false, expiresAt: new Date(Date.now() + 3600e3) } });
    return { id: u.id, token: t.token };
  };

  const call = async (method: 'GET' | 'PATCH' | 'POST', url: string, token?: string, body?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { ...(token ? { cookie: `${cookieName}=${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      payload: body ? JSON.stringify(body) : undefined,
    });
    let json: Record<string, unknown> | unknown[] | null = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, json: json as Record<string, unknown> | null };
  };

  before(async () => {
    process.env.MAIL_DRIVER = 'console'; // test hech qachon haqiqiy email yubormasin
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), { logger: false });
    await app.register(fastifyCookie);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true, exceptionFactory: toFieldErrors }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    cookieName = app.get(AppConfig).cookieName;

    const a = await mkUser('a', 'ADMIN');
    const s = await mkUser('s', 'STUDENT');
    admin = a.token;
    adminId = a.id;
    student = s.token;
    studentId = s.id;
    originalActive = (await prisma.achievementDefinition.findUniqueOrThrow({ where: { id: 'ach-first-step' } })).active;
  });

  after(async () => {
    await prisma.achievementDefinition.update({ where: { id: 'ach-first-step' } , data: { active: originalActive } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch((e) => console.error('cleanup users', e.message));
    await prisma.cosmeticItem.deleteMany({ where: { id: { in: itemIds } } }).catch((e) => console.error('cleanup items', e.message));
    await app.close();
  });

  test('admin: matnli id (ach-first-step) bilan faollikni o‘zgartiradi; ro‘yxat yangilanadi; AuditLog yoziladi', async () => {
    const off = await call('PATCH', '/api/admin/achievements/ach-first-step', admin, { active: false });
    assert.equal(off.status, 200);
    assert.deepEqual(off.json, { id: 'ach-first-step', active: false });

    const list = await call('GET', '/api/admin/achievements', admin);
    assert.equal(list.status, 200);
    const row = (list.json as unknown as { items: { id: string; slug: string; active: boolean }[] }).items.find((i) => i.id === 'ach-first-step');
    assert.equal(row?.active, false);

    const logs = await prisma.auditLog.findMany({ where: { actorId: adminId, entity: 'AchievementDefinition', entityId: 'ach-first-step' }, orderBy: { createdAt: 'asc' } });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, 'achievement.active');
    assert.deepEqual(logs[0].meta, { slug: 'birinchi-qadam', from: originalActive, to: false });

    const on = await call('PATCH', '/api/admin/achievements/ach-first-step', admin, { active: true });
    assert.equal(on.status, 200);
    assert.equal(on.json?.active, true);
    assert.equal(await prisma.auditLog.count({ where: { actorId: adminId, entityId: 'ach-first-step' } }), 2);
  });

  test('student: 403, autentifikatsiyasiz: 401, holat o‘zgarmaydi', async () => {
    const before = (await prisma.achievementDefinition.findUniqueOrThrow({ where: { id: 'ach-devoted' } })).active;
    assert.equal((await call('PATCH', '/api/admin/achievements/ach-devoted', student, { active: !before })).status, 403);
    assert.equal((await call('PATCH', '/api/admin/achievements/ach-devoted', undefined, { active: !before })).status, 401);
    assert.equal((await call('GET', '/api/admin/achievements', student)).status, 403);
    assert.equal((await prisma.achievementDefinition.findUniqueOrThrow({ where: { id: 'ach-devoted' } })).active, before);
  });

  test('mavjud bo‘lmagan achievement: 404 (UUID ko‘rinishidagi ham, matnli ham)', async () => {
    assert.equal((await call('PATCH', '/api/admin/achievements/ach-does-not-exist', admin, { active: true })).status, 404);
    assert.equal((await call('PATCH', `/api/admin/achievements/${randomUUID()}`, admin, { active: true })).status, 404);
  });

  test('noto‘g‘ri id shakli va noto‘g‘ri tana: validatsiya xatosi (404 emas)', async () => {
    const tooLong = 'a'.repeat(65);
    assert.equal((await call('PATCH', `/api/admin/achievements/${tooLong}`, admin, { active: true })).status, 422);
    assert.equal((await call('PATCH', '/api/admin/achievements/bad%20id', admin, { active: true })).status, 422);
    assert.equal((await call('PATCH', '/api/admin/achievements/ach-first-step', admin, { active: 'yes' })).status, 422);
  });

  test('kontrakt: bir xil kalit + bir xil bezak, boshqa expectedPrice bilan ham avvalgi natija qaytadi (HTTP)', async () => {
    const item = await prisma.cosmeticItem.create({
      data: { slug: `${tag}-i`, kind: 'FRAME', rarity: 'COMMON', name: 'Http bezak', priceXp: 100, status: 'ACTIVE', preview: { key: 'ramka-neon' } },
    });
    itemIds.push(item.id);
    await prisma.wallet.create({ data: { userId: studentId, xpBalance: 1000, totalXpEarned: 1000 } });
    const key = `k-${randomUUID()}`;

    const first = await call('POST', `/api/rewards/cosmetics/${item.id}/purchase`, student, { idempotencyKey: key, expectedPrice: 100 });
    assert.equal(first.status, 200);
    assert.equal(first.json?.replay, false);
    assert.equal(first.json?.balanceAfter, 900);

    // Narx o'zgargan, mahsulot to'xtatilgan; mijoz boshqa expectedPrice yuboradi: baribir avvalgi natija
    await prisma.cosmeticItem.update({ where: { id: item.id }, data: { priceXp: 500, status: 'DISABLED' } });
    const replay = await call('POST', `/api/rewards/cosmetics/${item.id}/purchase`, student, { idempotencyKey: key, expectedPrice: 999 });
    assert.equal(replay.status, 200);
    assert.equal(replay.json?.replay, true);
    assert.equal(replay.json?.purchaseId, first.json?.purchaseId);
    assert.equal(replay.json?.pricePaid, 100, 'avvalgi narx snapshot\'i qaytadi');
    assert.equal(replay.json?.balanceAfter, 900);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId: studentId } });
    assert.equal(w.xpBalance, 900, 'replay XP ni qayta yechmaydi');

    // Boshqa bezak bilan shu kalit: rad etiladi
    const other = await prisma.cosmeticItem.create({
      data: { slug: `${tag}-j`, kind: 'FRAME', rarity: 'COMMON', name: 'Boshqa', priceXp: 50, status: 'ACTIVE', preview: { key: 'ramka-neon' } },
    });
    itemIds.push(other.id);
    const reuse = await call('POST', `/api/rewards/cosmetics/${other.id}/purchase`, student, { idempotencyKey: key });
    assert.equal(reuse.status, 409);
    assert.equal(reuse.json?.code, 'KEY_REUSED');
  });

  test('expectedPrice nomuvofiq: PRICE_CHANGED (faqat birinchi bajarilishda), hech narsa yechilmaydi', async () => {
    const item = await prisma.cosmeticItem.create({
      data: { slug: `${tag}-k`, kind: 'FRAME', rarity: 'COMMON', name: 'Narx', priceXp: 200, status: 'ACTIVE', preview: { key: 'ramka-neon' } },
    });
    itemIds.push(item.id);
    const stale = await call('POST', `/api/rewards/cosmetics/${item.id}/purchase`, student, { idempotencyKey: `k-${randomUUID()}`, expectedPrice: 150 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json?.code, 'PRICE_CHANGED');
    assert.equal(stale.json?.price, 200);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId: studentId } });
    assert.equal(w.xpBalance, 900, 'PRICE_CHANGED hech narsa yechmaydi');
  });
});
