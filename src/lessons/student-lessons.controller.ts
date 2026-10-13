import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { LessonAnswerDto, LessonVisitDto } from './dto';
import { StudentLessonsService } from './student-lessons.service';

/** O'quvchi: nashr qilingan darslarni o'tish. */
@Controller('learning')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class StudentLessonsController {
  constructor(private readonly lessons: StudentLessonsService) {}

  @Get('topics/:topicId/lessons')
  forTopic(@CurrentUser() user: PublicUser, @Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.lessons.listForTopic(user.id, topicId);
  }

  @Get('lessons/:id')
  view(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.view(user.id, id);
  }

  @Post('lessons/:id/answer')
  @HttpCode(200)
  answer(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LessonAnswerDto) {
    return this.lessons.answer(user.id, id, dto.blockId, dto.payload);
  }

  @Post('lessons/:id/visit')
  @HttpCode(200)
  visit(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LessonVisitDto) {
    return this.lessons.visit(user.id, id, dto.pageId);
  }

  @Post('lessons/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.complete(user.id, id);
  }
}
