import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ServiceUnavailableException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { BotTokenGuard } from './billing.controller';

const ctx = (headers: Record<string, string | undefined>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

const prev = process.env.BOT_INTERNAL_TOKEN;
afterEach(() => {
  if (prev === undefined) delete process.env.BOT_INTERNAL_TOKEN;
  else process.env.BOT_INTERNAL_TOKEN = prev;
});

const TOKEN = 'a'.repeat(40);

test("ichki API: token sozlanmagan yoki 32 belgidan qisqa — 503 (ochiq qolmaydi)", () => {
  const guard = new BotTokenGuard();
  delete process.env.BOT_INTERNAL_TOKEN;
  assert.throws(() => guard.canActivate(ctx({ 'x-bot-token': '' })), ServiceUnavailableException);
  process.env.BOT_INTERNAL_TOKEN = 'short';
  assert.throws(() => guard.canActivate(ctx({ 'x-bot-token': 'short' })), ServiceUnavailableException);
});

test("ichki API: sarlavha yo'q, noto'g'ri yoki uzunligi boshqa — 401", () => {
  const guard = new BotTokenGuard();
  process.env.BOT_INTERNAL_TOKEN = TOKEN;
  assert.throws(() => guard.canActivate(ctx({})), UnauthorizedException);
  assert.throws(() => guard.canActivate(ctx({ 'x-bot-token': 'b'.repeat(40) })), UnauthorizedException);
  assert.throws(() => guard.canActivate(ctx({ 'x-bot-token': TOKEN.slice(1) })), UnauthorizedException);
  assert.throws(() => guard.canActivate(ctx({ 'x-bot-token': `${TOKEN}x` })), UnauthorizedException);
});

test("ichki API: to'g'ri token — ruxsat", () => {
  process.env.BOT_INTERNAL_TOKEN = TOKEN;
  assert.equal(new BotTokenGuard().canActivate(ctx({ 'x-bot-token': TOKEN })), true);
});
