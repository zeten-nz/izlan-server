import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, Matches } from 'class-validator';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { AchievementsService } from './achievements.service';

class ShowcaseDto {
  @IsArray()
  @ArrayMaxSize(3, { message: "Ko'pi bilan 3 ta badge" })
  @IsString({ each: true })
  @Matches(/^[a-z0-9-]{1,60}$/, { each: true })
  slugs!: string[];
}

class ActiveDto {
  @IsBoolean() active!: boolean;
}

/** O'quvchi: o'z badge'lari. Badge berish endpointi YO'Q: faqat server o'quv hodisalari orqali beriladi. */
@Controller('achievements')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AchievementsController {
  constructor(private readonly ach: AchievementsService) {}

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.ach.listForUser(user.id);
  }

  @Put('showcase')
  setShowcase(@CurrentUser() user: PublicUser, @Body() dto: ShowcaseDto) {
    return this.ach.setShowcase(user.id, dto.slugs);
  }
}

/** Admin: ro'yxat va faollik (qoidalar serverda, tahrirlanmaydi). */
@Controller('admin/achievements')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AdminAchievementsController {
  constructor(private readonly ach: AchievementsService) {}

  @Get()
  list() {
    return this.ach.adminList();
  }

  @Patch(':id')
  @HttpCode(200)
  setActive(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto) {
    return this.ach.adminSetActive(user.id, id, dto.active);
  }
}
