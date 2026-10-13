import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { AnswerDto, SelectDirectionsDto, StartPlacementDto } from './dto';
import { LearningService } from './learning.service';
import { ProgressService } from './progress.service';

@Controller('learning')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly progress: ProgressService,
  ) {}

  @Get('catalog')
  catalog() {
    return this.learning.catalog();
  }

  @Get('overview')
  overview(@CurrentUser() user: PublicUser) {
    return this.learning.overview(user.id);
  }

  /** Davom ettirish + keyingi darslar (DailyPlan o'rniga) */
  @Get('next-lessons')
  nextLessons(@CurrentUser() user: PublicUser) {
    return this.progress.nextLessons(user.id);
  }

  /** Jarayon: faqat haqiqiy o'quv ma'lumotlari */
  @Get('progress')
  summary(@CurrentUser() user: PublicUser) {
    return this.progress.summary(user.id);
  }

  @Post('directions')
  @HttpCode(200)
  select(@CurrentUser() user: PublicUser, @Body() dto: SelectDirectionsDto) {
    return this.learning.selectDirections(user.id, dto.directionIds);
  }

  @Post('directions/dismiss-prompt')
  @HttpCode(200)
  dismiss(@CurrentUser() user: PublicUser) {
    return this.learning.dismissPrompt(user.id);
  }

  @Post('directions/:id/start-from-zero')
  @HttpCode(200)
  startFromZero(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.startFromZero(user.id, id);
  }

  @Post('directions/:id/placement')
  @HttpCode(200)
  startPlacement(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartPlacementDto) {
    return this.learning.startPlacement(user.id, id, dto.mode, dto.levelOrd);
  }

  @Get('placements/:id')
  placement(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.getPlacement(user.id, id);
  }

  @Post('placements/:id/answer')
  @HttpCode(200)
  answer(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) {
    return this.learning.answer(user.id, id, dto.questionId, dto.choice);
  }

  @Get('mistakes')
  mistakes(@CurrentUser() user: PublicUser) {
    return this.learning.mistakes(user.id);
  }

  @Get('topics/:id')
  topic(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.topic(user.id, id);
  }
}
