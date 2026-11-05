import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { XpService } from './xp.service';

class HistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

/** Shaxsiy XP ma'lumotlari: faqat o'qish. XP berish endpointi YO'Q (faqat server hodisalari beradi). */
@Controller('xp')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class XpController {
  constructor(private readonly xp: XpService) {}

  @Get('summary')
  summary(@CurrentUser() user: PublicUser) {
    return this.xp.summary(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: PublicUser, @Query() q: HistoryQueryDto) {
    return this.xp.history(user.id, q.page ?? 1, q.limit ?? 20);
  }
}
