import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';
import { MailService } from './mail.service';
import { MailSendError, type MailMessage, type MailProvider } from './mail.types';
import { classifyResendError } from './providers';
import { renderOtpMail } from './templates';

class FakeQuota {
  used = 0;
  limit = 90;
  released = 0;
  exhausted = 0;
  async reserve(limit: number) {
    if (this.used >= limit) return null;
    this.used++;
    return { day: '2026-10-14' };
  }
  async release() {
    this.released++;
    this.used--;
  }
  async exhaust() {
    this.exhausted++;
  }
  async hasCapacity(limit: number) {
    return this.used < limit;
  }
}

function make(provider: Partial<MailProvider> & { send: MailProvider['send'] }, quota = new FakeQuota()) {
  const p: MailProvider = { metered: true, ...provider };
  const svc = new MailService(p, quota as never, { emailDailyLimit: 90 } as never);
  return { svc, quota };
}

const rejects = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as MailSendError,
  );

test('sendOtp: muvaffaqiyat — kvota band, kalit va matn provayderga uzatiladi', async () => {
  let sent: MailMessage | undefined;
  const { svc, quota } = make({ send: async (m) => void (sent = m) });
  await svc.sendOtp('a@b.uz', '123456', 'register', 10, 'key-1');
  assert.equal(quota.used, 1);
  assert.equal(sent?.idempotencyKey, 'key-1');
  assert.ok(sent?.html.includes('123456') && sent?.text.includes('123456'));
});

test('sendOtp: kvota tugagan — provayder chaqirilmaydi', async () => {
  let called = false;
  const q = new FakeQuota();
  q.used = 90;
  const { svc } = make({ send: async () => void (called = true) }, q);
  const err = await rejects(svc.sendOtp('a@b.uz', '123456', 'reset', 10));
  assert.equal(err?.kind, 'quota');
  assert.equal(called, false);
});

test('sendOtp: aniq rad etilsa kvota qaytariladi', async () => {
  const { svc, quota } = make({
    send: async () => {
      throw new MailSendError('rejected', 'x', 422);
    },
  });
  const err = await rejects(svc.sendOtp('a@b.uz', '123456', 'reset', 10));
  assert.equal(err?.kind, 'rejected');
  assert.equal(quota.released, 1);
  assert.equal(quota.used, 0);
});

test('sendOtp: natija noaniq bo\'lsa kvota saqlanadi (xat ketgan bo\'lishi mumkin)', async () => {
  const { svc, quota } = make({
    send: async () => {
      throw new MailSendError('unknown', 'timeout');
    },
  });
  const err = await rejects(svc.sendOtp('a@b.uz', '123456', 'reset', 10));
  assert.equal(err?.kind, 'unknown');
  assert.equal(quota.released, 0);
  assert.equal(quota.used, 1);
});

test('sendOtp: provayder kvota tugaganini aytsa, bugungi hisoblagich limitga ko\'tariladi', async () => {
  const { svc, quota } = make({
    send: async () => {
      throw new MailSendError('quota', 'x', 429, 'daily_quota_exceeded');
    },
  });
  await rejects(svc.sendOtp('a@b.uz', '123456', 'reset', 10));
  assert.equal(quota.exhausted, 1);
  assert.equal(quota.released, 0);
});

test('sendOtp: SMTP/console (metered=false) kvotaga tegmaydi', async () => {
  const { svc, quota } = make({ metered: false, send: async () => undefined });
  await svc.sendOtp('a@b.uz', '123456', 'register', 10);
  assert.equal(quota.used, 0);
});

test('classifyResendError: aniq-rad va noaniq holatlar ajratiladi', () => {
  const k = (e: Parameters<typeof classifyResendError>[0]) => classifyResendError(e).kind;
  assert.equal(k({ name: 'daily_quota_exceeded', statusCode: 429 }), 'quota');
  assert.equal(k({ name: 'monthly_quota_exceeded', statusCode: 429 }), 'quota');
  assert.equal(k({ name: 'rate_limit_exceeded', statusCode: 429 }), 'rate_limited');
  assert.equal(k({ name: 'invalid_api_key', statusCode: 401 }), 'config');
  assert.equal(k({ name: 'validation_error', statusCode: 403 }), 'config'); // domen tasdiqlanmagan
  assert.equal(k({ name: 'validation_error', statusCode: 422 }), 'rejected');
  assert.equal(k({ name: 'application_error', statusCode: null }), 'unknown'); // tarmoq/timeout
  assert.equal(k({ name: 'internal_server_error', statusCode: 500 }), 'unknown');
  assert.equal(k({ name: 'concurrent_idempotent_requests', statusCode: 409 }), 'unknown');
  assert.equal(classifyResendError({ name: 'x', statusCode: 500 }).definite, false);
  assert.equal(classifyResendError({ name: 'rate_limit_exceeded', statusCode: 429 }).definite, true);
});

test('shablon: kod, muddat va xavfsizlik ogohlantirishi bor', () => {
  const m = renderOtpMail('reset', '042917', 10);
  for (const part of [m.html, m.text]) {
    assert.ok(part.includes('042917'));
    assert.ok(part.includes('10 daqiqa'));
    assert.ok(/e'tiborsiz/.test(part));
  }
  assert.ok(m.html.includes('name="viewport"'));
  assert.ok(!m.html.includes('box-shadow'));
});

// ───────────── Konfiguratsiya ─────────────

const cfg = (env: Record<string, string>) => new AppConfig({ get: (k: string) => env[k] } as unknown as ConfigService);

test('config: productionda console driver taqiqlangan', () => {
  assert.throws(() => cfg({ NODE_ENV: 'production', MAIL_DRIVER: 'console' }).mailDriver, /Productionda/);
  assert.throws(() => cfg({ NODE_ENV: 'production' }).mailDriver, /Productionda/);
});

test('config: resend uchun RESEND_API_KEY majburiy', () => {
  const c = cfg({ MAIL_DRIVER: 'resend' });
  assert.equal(c.mailDriver, 'resend');
  assert.throws(() => c.resendApiKey, /RESEND_API_KEY/);
  assert.equal(cfg({ RESEND_API_KEY: 're_test' }).resendApiKey, 're_test');
});

test('config: kunlik limit standarti 90, noto\'g\'ri qiymat xato', () => {
  assert.equal(cfg({}).emailDailyLimit, 90);
  assert.equal(cfg({ EMAIL_DAILY_LIMIT: '50' }).emailDailyLimit, 50);
  assert.throws(() => cfg({ EMAIL_DAILY_LIMIT: 'abc' }).emailDailyLimit);
});

test('config: noma\'lum driver rad etiladi', () => {
  assert.throws(() => cfg({ MAIL_DRIVER: 'mailgun' }).mailDriver);
});
