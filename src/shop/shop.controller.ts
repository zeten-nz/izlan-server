import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ShopService } from './shop.service';

class PurchaseDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,80}$/, { message: "Idempotency kaliti noto'g'ri" })
  idempotencyKey!: string;

  /** Foydalanuvchi tasdiqlagan narx: faqat taqqoslash uchun (o'zgargan bo'lsa qayta tasdiq). Yechiladigan summa EMAS. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) expectedPrice?: number;
}

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

/**
 * XP do'koni (faqat o'quvchi). userId sessiyadan; XP miqdori so'rovda YO'Q.
 *
 * `POST /rewards/cosmetics/:id/purchase` kontrakti (idempotent):
 *  - `idempotencyKey` har xarid NIYATI uchun; (foydalanuvchi, kalit) bo'yicha noyob.
 *  - Kalit avval ISHLATILGAN bo'lsa: shu bezak uchun avvalgi natija qaytadi (`replay: true`, 200), XP qayta yechilmaydi.
 *    Bunda `expectedPrice`, joriy narx, bezak holati (DISABLED) va balans QAYTA TEKSHIRILMAYDI: replay allaqachon
 *    yakunlangan xarid. Boshqa bezak bilan kalit → 409 `KEY_REUSED`.
 *  - Birinchi bajarilishda tartib: bezak bor → ACTIVE (`NOT_AVAILABLE`) → narx bor (`NO_PRICE`) → egalik yo'q
 *    (`ALREADY_OWNED`) → `expectedPrice` mos (`PRICE_CHANGED`, javobda joriy `price`) → balans (`INSUFFICIENT_XP`).
 *  - `expectedPrice` yechiladigan summa EMAS; yechiladigan narx faqat serverdagi `priceXp`.
 */
@Controller('rewards')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Post('cosmetics/:id/purchase')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  purchase(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PurchaseDto) {
    return this.shop.purchase(user.id, id, { idempotencyKey: dto.idempotencyKey, expectedPrice: dto.expectedPrice });
  }

  @Get('purchases')
  history(@CurrentUser() user: PublicUser, @Query() q: PageDto) {
    return this.shop.history(user.id, q.page ?? 1, q.limit ?? 10);
  }
}
