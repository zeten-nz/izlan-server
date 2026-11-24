import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { TOPUP_MAX, TOPUP_MIN } from './billing.rules';
import { BillingService } from './billing.service';

class BuyDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,80}$/, { message: "Idempotency kaliti noto'g'ri" })
  idempotencyKey!: string;

  /** Foydalanuvchi ko'rgan narx — faqat taqqoslash uchun, yechiladigan summa EMAS. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000) expectedPrice?: number;
}

class TopupRequestDto {
  @Type(() => Number) @IsInt() @Min(TOPUP_MIN) @Max(TOPUP_MAX) amount!: number;
}

/** O'quvchi: balans, saytdan to'ldirish va kurs xaridi. */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class WalletController {
  constructor(private readonly billing: BillingService) {}

  @Get('wallet')
  @Header('Cache-Control', 'no-store')
  wallet(@CurrentUser() u: PublicUser) {
    return this.billing.wallet(u.id);
  }

  /** Noyob summa ajratish: { amount: 50000 } → 50 0XX so'm, karta va 20 daqiqa muddat. */
  @Post('wallet/topups')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestTopup(@CurrentUser() u: PublicUser, @Body() dto: TopupRequestDto) {
    return this.billing.requestTopup(u.id, dto.amount);
  }

  @Get('wallet/topups/:id')
  @Header('Cache-Control', 'no-store')
  topupStatus(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.topupStatus(u.id, id);
  }

  @Post('wallet/topups/:id/cancel')
  @HttpCode(200)
  cancelTopup(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.cancelTopup(u.id, id);
  }

  @Get('courses')
  @Header('Cache-Control', 'no-store')
  courses(@CurrentUser() u: PublicUser) {
    return this.billing.courses(u.id);
  }

  @Post('courses/:directionId/buy')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  buy(@CurrentUser() u: PublicUser, @Param('directionId', ParseUUIDPipe) directionId: string, @Body() dto: BuyDto) {
    return this.billing.buy(u.id, directionId, dto.idempotencyKey, dto.expectedPrice);
  }
}

/** Ommaviy: bosh sahifadagi kurs narxlari (kirishsiz). */
@Controller('public')
export class PublicPricesController {
  constructor(private readonly billing: BillingService) {}

  @Get('prices')
  @Header('Cache-Control', 'public, max-age=60')
  prices() {
    return this.billing.publicPrices();
  }
}

// ───────────── To'lov kuzatuvchisi uchun ichki API ─────────────

@Injectable()
export class BotTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.BOT_INTERNAL_TOKEN ?? '';
    if (expected.length < 32) throw new ServiceUnavailableException('Bot API sozlanmagan');
    const got = String(ctx.switchToHttp().getRequest<FastifyRequest>().headers['x-bot-token'] ?? '');
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}

class IncomeDto {
  /** Manba: masalan "userbot", "admin". */
  @IsString() @Matches(/^[a-z0-9_-]{1,32}$/) source!: string;
  /** Takrorlanmaslik kaliti: masalan "tg:<chatId>:<messageId>" — bir bildirishnoma ikki marta yozilmaydi. */
  @IsString() @Matches(/^[A-Za-z0-9:_.-]{1,120}$/) externalId!: string;
  /** Butun so'm (tiyin tashlab yuborilgan); tiyin bo'lsa hasFraction=true → ko'rib chiqishga. */
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000_000) amount!: number;
  @IsOptional() @IsBoolean() hasFraction?: boolean;
  /** Pul tushgan vaqt (bildirishnoma vaqti), ISO. */
  @IsDateString() receivedAt!: string;
  @IsOptional() @IsString() @MaxLength(4000) rawText?: string;
}

class AssignDto {
  @IsString() @Matches(/^@?[A-Za-z0-9_.]{3,32}$/) username!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(TOPUP_MAX) amount?: number;
  @IsString() @MaxLength(64) by!: string;
}

class IgnoreDto {
  @IsString() @MaxLength(64) by!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * Faqat to'lov kuzatuvchisi (pay-bot, bank bildirishnomalarini o'qiydi) chaqiradi: x-bot-token sarlavhasi = BOT_INTERNAL_TOKEN.
 *  - POST /internal/incomes                 kartaga tushgan pul → MATCH | LATE_MATCH | REVIEW | DUPLICATE
 *  - GET  /internal/incomes?status=REVIEW   ko'rib chiqish navbati (o'xshash so'rovlar bilan)
 *  - POST /internal/incomes/:id/assign      { username, amount?, by } qo'lda biriktirish
 *  - POST /internal/incomes/:id/ignore      { by, note? }
 */
@Controller('internal')
@UseGuards(BotTokenGuard)
@SkipThrottle()
export class InternalBotController {
  constructor(private readonly billing: BillingService) {}

  @Post('incomes')
  @HttpCode(200)
  income(@Body() dto: IncomeDto) {
    const receivedAt = new Date(dto.receivedAt);
    if (receivedAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('receivedAt kelajakda');
    return this.billing.recordIncome({ source: dto.source, externalId: dto.externalId, amount: dto.amount, hasFraction: !!dto.hasFraction, receivedAt, rawText: dto.rawText });
  }

  @Get('incomes')
  @Header('Cache-Control', 'no-store')
  review(@Query('status') status?: string) {
    if (status && status !== 'REVIEW') throw new BadRequestException('Faqat status=REVIEW');
    return this.billing.reviewIncomes();
  }

  @Post('incomes/:id/assign')
  @HttpCode(200)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.billing.assignIncome(id, dto.username, dto.amount, dto.by);
  }

  @Post('incomes/:id/ignore')
  @HttpCode(200)
  ignore(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IgnoreDto) {
    return this.billing.ignoreIncome(id, dto.by, dto.note);
  }
}
