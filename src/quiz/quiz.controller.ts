import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { QuizService } from './quiz.service';

class SaveQuizDto {
  @IsString() @MinLength(1, { message: 'Test nomi kiritilmagan' }) @MaxLength(120) title!: string;
  @IsArray({ message: "Savollar ro'yxati noto'g'ri" }) questions!: unknown[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rev?: number;
}

class SubmitQuizDto {
  @IsObject({ message: "Javoblar noto'g'ri" }) answers!: Record<string, unknown>;
}

/** O'quvchi: mavzu testi. Ball/XP miqdori so'rovdan olinmaydi: faqat javoblar yuboriladi, natijani backend hisoblaydi. */
@Controller('learning')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class StudentQuizController {
  constructor(private readonly quiz: QuizService) {}

  @Get('topics/:topicId/quiz')
  view(@CurrentUser() user: PublicUser, @Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.quiz.studentView(user.id, topicId);
  }

  @Post('topics/:topicId/quiz/submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  submit(@CurrentUser() user: PublicUser, @Param('topicId', ParseUUIDPipe) topicId: string, @Body() dto: SubmitQuizDto) {
    return this.quiz.submit(user.id, topicId, dto.answers);
  }
}

/** Ustoz/admin: faqat o'z vakolatidagi mavzular testi (server tekshiradi). */
@Controller('staff/quizzes')
@UseGuards(SessionGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class StaffQuizController {
  constructor(private readonly quiz: QuizService) {}

  @Get('topic/:topicId')
  get(@CurrentUser() user: PublicUser, @Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.quiz.staffGet(user, topicId);
  }

  @Put('topic/:topicId')
  save(@CurrentUser() user: PublicUser, @Param('topicId', ParseUUIDPipe) topicId: string, @Body() dto: SaveQuizDto) {
    return this.quiz.staffSaveDraft(user, topicId, dto);
  }

  @Post('topic/:topicId/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: PublicUser, @Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.quiz.staffPublish(user, topicId);
  }
}
