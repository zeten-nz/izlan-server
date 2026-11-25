/**
 * HTTP: admin "Kirimlar" (qo'lda kiritish) — haqiqiy NestJS ilovasi, guard/pipe'lar bilan, DEVELOPMENT DB.
 *   RUN_DB_TESTS=1 node --test dist/billing/billing.admin.http.spec.js
 * Faqat o'zi yaratgan qatorlarni (foydalanuvchilar — id bo'yicha, kirimlar — id bo'yicha) o'chiradi.
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
const tag = `inc${Date.now().toString(36)}`;

function toFieldErrors(errors: ValidationError[]): UnprocessableEntityException {
  const map: Record<string, string> = {};
  for (const e of errors) {
    const first = e.constraints ? Object.values(e.constraints)[0] : undefined;
    if (first) map[e.property] = first;
  }
  return new UnprocessableEntityException({ message: Object.values(map)[0] ?? "Ma'lumot noto'g'ri", errors: map });
}

describe("HTTP: admin kirimlarni qo'lda kiritadi", { skip: !RUN }, () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let cookieName = '';
  const userIds: string[] = [];
  const incomeIds: string[] = [];

  const mkUser = async (name: string, role: 'STUDENT' | 'ADMIN') => {
    const u = await prisma.user.create({
      data: { username: `${tag}${name}`, email: `${tag}${name}@test.invalid`, firstName: 'Kirim', lastName: 'Test', birthYear: 2008, passwordHash: 'x', role, emailVerifiedAt: new Date() },
    });
    userIds.push(u.id);
    const t = newSessionToken();
    await prisma.session.create({ data: { userId: u.id, tokenHash: t.hash, remember: false, expiresAt: new Date(Date.now() + 3600e3) } });
    return { id: u.id, username: u.username, token: t.token };
  };

  const call = async (method: 'GET' | 'POST', url: string, token?: string, body?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { ...(token ? { cookie: `${cookieName}=${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      payload: body ? JSON.stringify(body) : undefined,
    });
    let json: Record<string, unknown> | null = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    if (json && typeof json.incomeId === 'string' && !incomeIds.includes(json.incomeId)) incomeIds.push(json.incomeId);
    return { status: res.statusCode, json: json as Record<string, any> | null };
  };

  before(async () => {
    process.env.MAIL_DRIVER = 'console';
    process.env.TOPUP_CARD_NUMBER = '8600 0000 0000 0001';
    process.env.TOPUP_CARD_HOLDER = 'TEST HOLDER';
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), { logger: false });
    await app.register(fastifyCookie);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true, exceptionFactory: toFieldErrors }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    cookieName = app.get(AppConfig).cookieName;
  });

  after(async () => {
    if (!prisma) return;
    await prisma.bankIncome.deleteMany({ where: { id: { in: incomeIds } } }).catch((e) => console.error('cleanup incomes', e.message));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch((e) => console.error('cleanup users', e.message));
    await app?.close();
  });

  test("rol: faqat ADMIN; o'quvchi 403, mehmon 401", async () => {
    const s = await mkUser('s0', 'STUDENT');
    assert.equal((await call('GET', '/api/admin/incomes')).status, 401);
    assert.equal((await call('GET', '/api/admin/incomes', s.token)).status, 403);
    assert.equal((await call('POST', '/api/admin/incomes', s.token, { amount: 5_001, requestId: randomUUID() })).status, 403);
    assert.equal((await call('GET', '/api/admin/incomes/report', s.token)).status, 403);
  });

  test("oqim: kutilayotgan so'rov ko'rinadi → admin summani kiritadi → balans to'ladi; takror kiritish ikki marta yozmaydi", async () => {
    const admin = await mkUser('a1', 'ADMIN');
    const s = await mkUser('s1', 'STUDENT');
    const req = await call('POST', '/api/wallet/topups', s.token, { amount: 3_217_000 });
    assert.equal(req.status, 200, JSON.stringify(req.json));
    const amount = req.json!.amount as number;

    const ov = await call('GET', '/api/admin/incomes', admin.token);
    assert.equal(ov.status, 200);
    const p = (ov.json!.pending as Array<{ username: string; amount: number }>).find((x) => x.username === s.username);
    assert.ok(p, 'kutilayotgan so‘rov ro‘yxatda');
    assert.equal(p.amount, amount);

    const requestId = randomUUID();
    const r1 = await call('POST', '/api/admin/incomes', admin.token, { amount, requestId });
    assert.equal(r1.status, 200, JSON.stringify(r1.json));
    assert.equal(r1.json!.result, 'MATCH');
    assert.equal(r1.json!.credited, 3_217_000);
    assert.equal(r1.json!.username, s.username);

    // Tugma ikki marta bosildi (bir xil requestId) → DUPLICATE
    const r2 = await call('POST', '/api/admin/incomes', admin.token, { amount, requestId });
    assert.equal(r2.json!.result, 'DUPLICATE');

    // Xuddi shu pul yana kiritildi (yangi requestId) → ko'rib chiqishga, balansga qayta yozilmaydi
    const r3 = await call('POST', '/api/admin/incomes', admin.token, { amount, requestId: randomUUID() });
    assert.equal(r3.json!.result, 'REVIEW');
    const wallet = await call('GET', '/api/wallet', s.token);
    assert.equal(wallet.json!.balanceUzs, 3_217_000);

    const rev = await call('GET', '/api/admin/incomes/review', admin.token);
    assert.ok((rev.json as unknown as Array<{ id: string }>).some((x) => x.id === r3.json!.incomeId));
    const ig = await call('POST', `/api/admin/incomes/${r3.json!.incomeId}/ignore`, admin.token, { note: 'takror' });
    assert.equal(ig.status, 200);
    assert.equal(ig.json!.status, 'IGNORED');

    const ov2 = await call('GET', '/api/admin/incomes', admin.token);
    const mine = (ov2.json!.recent as Array<{ id: string; status: string; username: string | null }>).find((x) => x.id === r1.json!.incomeId);
    assert.equal(mine?.status, 'MATCHED');
    assert.equal(mine?.username, s.username);
    assert.ok(!(ov2.json!.pending as Array<{ username: string }>).some((x) => x.username === s.username), "to'langan so'rov kutilayotganlardan chiqdi");
  });

  test("qo'lda biriktirish: mos kelmagan kirim username bo'yicha yoziladi", async () => {
    const admin = await mkUser('a2', 'ADMIN');
    const s = await mkUser('s2', 'STUDENT');
    const r = await call('POST', '/api/admin/incomes', admin.token, { amount: 4_441_077, requestId: randomUUID() });
    assert.equal(r.json!.result, 'REVIEW');
    const bad = await call('POST', `/api/admin/incomes/${r.json!.incomeId}/assign`, admin.token, { username: `${tag}nobody` });
    assert.equal(bad.status, 404);
    const ok = await call('POST', `/api/admin/incomes/${r.json!.incomeId}/assign`, admin.token, { username: s.username });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json!.credited, 4_441_000);
    const again = await call('POST', `/api/admin/incomes/${r.json!.incomeId}/assign`, admin.token, { username: s.username });
    assert.equal(again.status, 409);
  });

  test('validatsiya: summa, requestId va kelajak vaqti', async () => {
    const admin = await mkUser('a3', 'ADMIN');
    assert.equal((await call('POST', '/api/admin/incomes', admin.token, { amount: 0, requestId: randomUUID() })).status, 422);
    assert.equal((await call('POST', '/api/admin/incomes', admin.token, { amount: 5_000, requestId: 'x' })).status, 422);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    assert.equal((await call('POST', '/api/admin/incomes', admin.token, { amount: 5_000, requestId: randomUUID(), receivedAt: future })).status, 400);
    const rep = await call('GET', '/api/admin/incomes/report?month=2026-11', admin.token);
    assert.equal(rep.status, 200);
    assert.equal(rep.json!.month, '2026-11');
    assert.equal((await call('GET', '/api/admin/incomes/report?month=bad', admin.token)).status, 400);
  });
});
