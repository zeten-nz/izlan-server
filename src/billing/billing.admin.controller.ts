import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { TOPUP_MAX } from './billing.rules';
import { BillingService } from './billing.service';

class AdminIncomeDto {
  /** Kartaga tushgan summa (butun so'm, bank xabaridagidek). */
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000_000) amount!: number;
  /** Bank xabaridagi vaqt; berilmasa — hozir. */
  @IsOptional() @IsDateString() receivedAt?: string;
  /** Formani bir marta yuborish kaliti: ikki marta bosilsa ham bitta kirim yoziladi. */
  @IsUUID() requestId!: string;
}

class AdminAssignDto {
  @IsString() @Matches(/^@?[A-Za-z0-9_.]{3,32}$/) username!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(TOPUP_MAX) amount?: number;
}

class AdminIgnoreDto {
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * Admin: kartaga tushgan pullarni qo'lda kiritish (pay-bot o'rniga yoki zaxira sifatida).
 * Kiritilgan kirim pay-bot'niki bilan BIR XIL moslash mantiqidan o'tadi (recordIncome):
 * noyob summa kutilayotgan so'rovga mos kelsa — balans avtomatik to'ldiriladi; aks holda — ko'rib chiqishga.
 * Bir pul ikki marta kiritilsa: so'rov allaqachon to'langan → REVIEW (ALREADY_PAID), ikkinchi marta yozilmaydi.
 */
@Controller('admin/incomes')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AdminIncomesController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  overview() {
    return this.billing.incomeOverview();
  }

  @Get('review')
  @Header('Cache-Control', 'no-store')
  review() {
    return this.billing.reviewIncomes(50);
  }

  @Get('report')
  @Header('Cache-Control', 'no-store')
  report(@Query('month') month?: string) {
    return this.billing.incomeReport(month || undefined);
  }

  @Post()
  @HttpCode(200)
  record(@CurrentUser() user: PublicUser, @Body() dto: AdminIncomeDto) {
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('Vaqt kelajakda bo‘lishi mumkin emas');
    return this.billing.recordIncome({
      source: 'admin',
      externalId: `admin:${dto.requestId}`,
      amount: dto.amount,
      hasFraction: false,
      receivedAt,
      rawText: `Qo'lda kiritdi: @${user.username}`,
    });
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminAssignDto) {
    return this.billing.assignIncome(id, dto.username, dto.amount, `admin:@${user.username}`);
  }

  @Post(':id/ignore')
  @HttpCode(200)
  ignore(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminIgnoreDto) {
    return this.billing.ignoreIncome(id, `admin:@${user.username}`, dto.note);
  }
}
