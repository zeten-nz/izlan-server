import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { CreateDirectionDto, CreateLevelDto, CreateTopicDto, ReorderDto, UpdateDirectionDto, UpdateLevelDto, UpdateTopicDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

/** Admin: ta'lim tuzilmasi (Yo'nalish → Daraja → Mavzu). Faqat ADMIN; ustozlar katalogni faqat o'qiydi (`/staff/catalog`). */
@Controller('admin/catalog')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  tree() {
    return this.catalog.tree();
  }

  // Yo'nalish
  @Post('directions')
  @HttpCode(200)
  createDirection(@Body() dto: CreateDirectionDto) {
    return this.catalog.createDirection(dto);
  }

  @Post('directions/reorder')
  @HttpCode(200)
  reorderDirections(@Body() dto: ReorderDto) {
    return this.catalog.reorderDirections(dto.ids);
  }

  @Patch('directions/:id')
  updateDirection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDirectionDto) {
    return this.catalog.updateDirection(id, dto);
  }

  @Delete('directions/:id')
  deleteDirection(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteDirection(id);
  }

  // Daraja
  @Post('directions/:id/levels')
  @HttpCode(200)
  createLevel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLevelDto) {
    return this.catalog.createLevel(id, dto);
  }

  @Post('directions/:id/levels/reorder')
  @HttpCode(200)
  reorderLevels(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return this.catalog.reorderLevels(id, dto.ids);
  }

  @Patch('levels/:id')
  updateLevel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLevelDto) {
    return this.catalog.updateLevel(id, dto);
  }

  @Delete('levels/:id')
  deleteLevel(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteLevel(id);
  }

  // Mavzu
  @Post('levels/:id/topics')
  @HttpCode(200)
  createTopic(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTopicDto) {
    return this.catalog.createTopic(id, dto);
  }

  @Post('levels/:id/topics/reorder')
  @HttpCode(200)
  reorderTopics(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) {
    return this.catalog.reorderTopics(id, dto.ids);
  }

  @Patch('topics/:id')
  updateTopic(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTopicDto) {
    return this.catalog.updateTopic(id, dto);
  }

  @Delete('topics/:id')
  deleteTopic(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteTopic(id);
  }
}
