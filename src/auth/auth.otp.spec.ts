import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MailSendError } from '../mail/mail.types';
import { AuthService } from './auth.service';
import type { ForgotDto, RegisterDto, ResendDto, ResetPasswordDto, VerifyRegistrationDto } from './dto';

// ───────────── Xotiradagi soxta Prisma: bitta op = bitta atomik qadam (haqiqiy DB'dagi shartli UPDATE kabi) ─────────────

type Row = Record<string, unknown> & { id: string };
const known = (code: string) => new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: 'test' });

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, w]) => {
    const v = row[k];
    if (w instanceof Date) return v instanceof Date && v.getTime() === w.getTime();
    if (w && typeof w === 'object') {
      const c = w as { lt?: number | Date; gt?: number | Date };
      if (c.lt !== undefined) return (v as number | Date) < c.lt;
      if (c.gt !== undefined) return (v as number | Date) > c.gt;
    }
    return v === w;
  });
}

function patch(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
      row[k] = (row[k] as number) + (v as { increment: number }).increment;
    } else row[k] = v;
  }
}

class Table {
  rows: Row[] = [];
  private seq = 0;
  constructor(private readonly unique: string[] = []) {}

  async findUnique({ where }: { where: Record<string, unknown> }) {
    const r = this.rows.find((x) => matches(x, where));
    return r ? { ...r } : null;
  }
  async findFirst({ where }: { where: Record<string, unknown> }) {
    return this.findUnique({ where });
  }
  async create({ data }: { data: Record<string, unknown> }) {
    for (const u of this.unique) if (this.rows.some((r) => r[u] === data[u])) throw known('P2002');
    const row = { id: `id${++this.seq}`, createdAt: new Date(), ...data } as Row;
    this.rows.push(row);
    return { ...row };
  }
  async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
    const hit = this.rows.filter((r) => matches(r, where));
    hit.forEach((r) => patch(r, data));
    return { count: hit.length };
  }
  async update({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
    const r = this.rows.find((x) => matches(x, where));
    if (!r) throw known('P2025');
    patch(r, data);
    return { ...r };
  }
  async deleteMany({ where }: { where: Record<string, unknown> }) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  }
}

class FakeMail {
  calls: { to: string; code: string; purpose: string; key?: string }[] = [];
  failWith: MailSendError | null = null;
  capacityError: MailSendError | null = null;
  async assertCapacity() {
    if (this.capacityError) throw this.capacityError;
  }
  async sendOtp(to: string, code: string, purpose: string, _ttl: number, key?: string) {
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    this.calls.push({ to, code, purpose, key });
  }
  get last() {
    return this.calls[this.calls.length - 1];
  }
}

function setup() {
  const prisma = {
    user: new Table(['email', 'username']),
    pendingRegistration: new Table(['email']),
    passwordReset: new Table(['userId']),
    session: new Table(),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const config = {
    authSecret: 'x'.repeat(40),
    otpTtlMs: 600_000,
    otpResendMs: 60_000,
    sessionShortMs: 86_400_000,
    sessionRememberMs: 86_400_000 * 30,
  };
  const mail = new FakeMail();
  const auth = new AuthService(prisma as never, config as never, mail as never);
  return { prisma, mail, auth };
}

const EMAIL = 'ali@example.com';
const reg = (over: Partial<RegisterDto> = {}) =>
  ({
    email: EMAIL,
    username: 'ali',
    firstName: 'Ali',
    lastName: 'Valiyev',
    birthYear: 2005,
    password: 'Abcdef12',
    confirmPassword: 'Abcdef12',
    ...over,
  }) as RegisterDto;
const verify = (code: string) => ({ email: EMAIL, code }) as VerifyRegistrationDto;

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof HttpException) return e.getStatus();
    throw e;
  }
}

// ───────────── Ro'yxatdan o'tish ─────────────

test('register: kod yuboriladi va bazada ochiq matn saqlanmaydi', async () => {
  const { prisma, mail, auth } = setup();
  const r = await auth.register(reg());
  assert.equal(r.resendInSeconds, 60);
  assert.equal(mail.calls.length, 1);
  assert.match(mail.last.code, /^\d{6}$/);
  assert.ok(!JSON.stringify(prisma.pendingRegistration.rows).includes(mail.last.code));
  assert.ok(mail.last.key && mail.last.key.length === 64);
});

test('register: cooldown ichida ikkinchi so\'rov 429, xat ikki marta ketmaydi', async () => {
  const { mail, auth } = setup();
  await auth.register(reg());
  assert.equal(await status(auth.register(reg())), 429);
  assert.equal(await status(auth.resendRegistration({ email: EMAIL } as ResendDto)), 429);
  assert.equal(mail.calls.length, 1);
});

test('register: parallel so\'rovlarda faqat bittasi xat yuboradi', async () => {
  const { mail, auth } = setup();
  const results = await Promise.all([1, 2, 3, 4].map(() => status(auth.register(reg()))));
  assert.equal(results.filter((s) => s === 200).length, 1);
  assert.equal(mail.calls.length, 1);
});

test("register: xat aniq rad etilsa holat tiklanadi va 'yuborildi' deyilmaydi, qayta urinish mumkin", async () => {
  const { prisma, mail, auth } = setup();
  mail.failWith = new MailSendError('rejected', 'x', 422, 'validation_error');
  assert.equal(await status(auth.register(reg())), 502);
  assert.equal(prisma.pendingRegistration.rows.length, 0);
  mail.failWith = null;
  assert.equal(await status(auth.register(reg())), 200); // cooldown yo'q: yuborilmagan edi
});

test('register: natija noaniq (timeout) bo\'lsa kod saqlanadi, javob xato + retryAfter', async () => {
  const { mail, auth } = setup();
  mail.failWith = new MailSendError('unknown', 'timeout');
  const err = await auth.register(reg()).then(
    () => null,
    (e: HttpException) => e,
  );
  assert.equal(err?.getStatus(), 502);
  assert.equal((err?.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds, 60);
  // xat kelgan bo'lishi mumkin: cooldown saqlangan
  mail.failWith = null;
  assert.equal(await status(auth.register(reg())), 429);
});

test('register: Resend kvotasi tugagan bo\'lsa 503 va hech narsa yozilmaydi', async () => {
  const { prisma, mail, auth } = setup();
  mail.capacityError = new MailSendError('quota', 'limit');
  assert.equal(await status(auth.register(reg())), 503);
  assert.equal(prisma.pendingRegistration.rows.length, 0);
  assert.equal(mail.calls.length, 0);
});

test('register: provayder 429 (rate_limited) → 429, holat tiklanadi', async () => {
  const { prisma, mail, auth } = setup();
  mail.failWith = new MailSendError('rate_limited', 'x', 429, 'rate_limit_exceeded');
  assert.equal(await status(auth.register(reg())), 429);
  assert.equal(prisma.pendingRegistration.rows.length, 0);
});

// ───────────── Kodni tekshirish ─────────────

test('verify: to\'g\'ri kod hisob yaratadi; kod qayta ishlatilmaydi', async () => {
  const { prisma, mail, auth } = setup();
  await auth.register(reg());
  const code = mail.last.code;
  const s = await auth.verifyRegistration(verify(code));
  assert.equal(s.user.email, EMAIL);
  assert.equal(prisma.user.rows.length, 1);
  assert.equal(await status(auth.verifyRegistration(verify(code))), 400);
  assert.equal(prisma.user.rows.length, 1);
});

test('verify: bir vaqtda kelgan ikki so\'rovdan faqat bittasi o\'tadi', async () => {
  const { prisma, mail, auth } = setup();
  await auth.register(reg());
  const code = mail.last.code;
  const res = await Promise.all([auth.verifyRegistration(verify(code)), auth.verifyRegistration(verify(code))].map(status));
  assert.deepEqual([...res].sort(), [200, 400]);
  assert.equal(prisma.user.rows.length, 1);
});

test('verify: noto\'g\'ri kod urinishlari cheklanadi (parallel ham aylanib o\'tmaydi)', async () => {
  const { prisma, mail, auth } = setup();
  await auth.register(reg());
  const right = mail.last.code;
  const wrong = right === '000000' ? '111111' : '000000';
  await Promise.all(Array.from({ length: 20 }, () => status(auth.verifyRegistration(verify(wrong)))));
  const attempts = prisma.pendingRegistration.rows[0]?.attempts as number | undefined;
  assert.ok(attempts === undefined || attempts <= 5);
  // limit tugadi: to'g'ri kod ham o'tmaydi
  assert.equal(await status(auth.verifyRegistration(verify(right))), 400);
  assert.equal(prisma.user.rows.length, 0);
});

test('verify: eskirgan kod rad etiladi', async () => {
  const { prisma, mail, auth } = setup();
  await auth.register(reg());
  prisma.pendingRegistration.rows[0].expiresAt = new Date(Date.now() - 1000);
  assert.equal(await status(auth.verifyRegistration(verify(mail.last.code))), 400);
  assert.equal(prisma.user.rows.length, 0);
});

// ───────────── Parolni tiklash ─────────────

async function withUser() {
  const ctx = setup();
  await ctx.prisma.user.create({
    data: { email: EMAIL, username: 'ali', passwordHash: 'old', role: 'STUDENT' },
  });
  await ctx.prisma.session.create({ data: { userId: ctx.prisma.user.rows[0].id, tokenHash: 't' } });
  return ctx;
}
const forgot = (email: string) => ({ email }) as ForgotDto;
const resetDto = (code: string, password = 'Newpass12') =>
  ({ email: EMAIL, code, password, confirmPassword: password }) as ResetPasswordDto;

test('forgot: mavjud va mavjud bo\'lmagan email uchun javob bir xil, mavjud bo\'lmaganga xat ketmaydi', async () => {
  const { mail, auth } = await withUser();
  const known = await auth.forgot(forgot(EMAIL));
  const unknown = await auth.forgot(forgot('nobody@example.com'));
  await auth.idle();
  assert.deepEqual(known, unknown);
  assert.equal(mail.calls.length, 1);
  assert.equal(mail.last.to, EMAIL);
});

test('forgot: yuborish xatosi foydalanuvchiga oshkor bo\'lmaydi (bir xil javob), holat tiklanadi', async () => {
  const { prisma, mail, auth } = await withUser();
  mail.failWith = new MailSendError('rejected', 'x', 422);
  const r = await auth.forgot(forgot(EMAIL));
  await auth.idle();
  assert.equal(r.resendInSeconds, 60);
  assert.equal(prisma.passwordReset.rows.length, 0);
});

test('forgot: cooldown ichida qayta so\'rov yangi xat yubormaydi', async () => {
  const { mail, auth } = await withUser();
  await auth.forgot(forgot(EMAIL));
  await auth.idle();
  await auth.forgot(forgot(EMAIL));
  await auth.idle();
  assert.equal(mail.calls.length, 1);
});

test('reset: kod bir martalik, parallel so\'rovlardan bittasi o\'tadi, sessiyalar o\'chadi', async () => {
  const { prisma, mail, auth } = await withUser();
  await auth.forgot(forgot(EMAIL));
  await auth.idle();
  const code = mail.last.code;
  const res = await Promise.all([auth.resetPassword(resetDto(code, 'Newpass12')), auth.resetPassword(resetDto(code, 'Other1234'))].map(status));
  assert.deepEqual([...res].sort(), [200, 400]);
  assert.equal(prisma.session.rows.length, 0);
  assert.notEqual(prisma.user.rows[0].passwordHash, 'old');
  assert.equal(await status(auth.resetPassword(resetDto(code))), 400);
});

test('reset: noto\'g\'ri kod parolni o\'zgartirmaydi', async () => {
  const { prisma, mail, auth } = await withUser();
  await auth.forgot(forgot(EMAIL));
  await auth.idle();
  const wrong = mail.last.code === '000000' ? '111111' : '000000';
  assert.equal(await status(auth.resetPassword(resetDto(wrong))), 400);
  assert.equal(prisma.user.rows[0].passwordHash, 'old');
  assert.equal(prisma.session.rows.length, 1);
});
