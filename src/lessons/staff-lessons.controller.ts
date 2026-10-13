import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { CreateLessonDto, DuplicateLessonDto, PreviewAnswerDto, SaveDraftDto } from './dto';
import { StaffLessonsService } from './staff-lessons.service';

/** Ustoz muhiti (Studio): darslarni yaratish, tahrirlash, nashr qilish. */
@Controller('staff')
@UseGuards(SessionGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
@Throttle({ default: { limit: 240, ttl: 60_000 } })
export class StaffLessonsController {
  constructor(private readonly lessons: StaffLessonsService) {}

  @Get('catalog')
  catalog() {
    return this.lessons.catalog();
  }

  @Get('lessons')
  list(@CurrentUser() user: PublicUser) {
    return this.lessons.list(user);
  }

  @Post('lessons')
  @HttpCode(200)
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateLessonDto) {
    return this.lessons.create(user, dto.topicId, dto.title);
  }

  @Get('lessons/:id')
  get(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.get(user, id);
  }

  @Put('lessons/:id/draft')
  saveDraft(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDraftDto) {
    return this.lessons.saveDraft(user, id, dto.rev, dto.title, dto.doc);
  }

  @Post('lessons/:id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.publish(user, id);
  }

  @Post('lessons/:id/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.unpublish(user, id);
  }

  @Post('lessons/:id/duplicate')
  @HttpCode(200)
  duplicate(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DuplicateLessonDto) {
    return this.lessons.duplicate(user, id, dto.title, dto.topicId);
  }

  @Delete('lessons/:id')
  remove(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.remove(user, id);
  }

  @Get('lessons/:id/preview')
  preview(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.preview(user, id);
  }

  @Post('lessons/:id/preview/answer')
  @HttpCode(200)
  previewAnswer(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewAnswerDto) {
    return this.lessons.previewAnswer(user, id, dto.blockId, dto.payload);
  }
}
