import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import {
  CreateNoteDto,
  CreateVocabularyDto,
  ListQueryDto,
  MistakesQueryDto,
  SaveMaterialDto,
  SavedListQueryDto,
  SavedStatusQueryDto,
  UpdateNoteDto,
  UpdateVocabularyDto,
} from './dto';
import { NotebookService } from './notebook.service';

/** Daftar: faqat o'quvchining o'z yozuvlari (har so'rovda userId sessiyadan olinadi, so'rovdan emas). */
@Controller('notebook')
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class NotebookController {
  constructor(private readonly notebook: NotebookService) {}

  @Get('summary')
  summary(@CurrentUser() user: PublicUser) {
    return this.notebook.summary(user.id);
  }

  // Lug'at
  @Get('vocabulary')
  vocabulary(@CurrentUser() user: PublicUser, @Query() q: ListQueryDto) {
    return this.notebook.listVocabulary(user.id, q);
  }

  @Post('vocabulary')
  @HttpCode(200)
  addVocabulary(@CurrentUser() user: PublicUser, @Body() dto: CreateVocabularyDto) {
    return this.notebook.createVocabulary(user.id, dto);
  }

  @Patch('vocabulary/:id')
  editVocabulary(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVocabularyDto) {
    return this.notebook.updateVocabulary(user.id, id, dto);
  }

  @Delete('vocabulary/:id')
  removeVocabulary(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notebook.deleteVocabulary(user.id, id);
  }

  // Eslatmalar
  @Get('notes')
  notes(@CurrentUser() user: PublicUser, @Query() q: ListQueryDto) {
    return this.notebook.listNotes(user.id, q);
  }

  @Post('notes')
  @HttpCode(200)
  addNote(@CurrentUser() user: PublicUser, @Body() dto: CreateNoteDto) {
    return this.notebook.createNote(user.id, dto);
  }

  @Patch('notes/:id')
  editNote(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNoteDto) {
    return this.notebook.updateNote(user.id, id, dto);
  }

  @Delete('notes/:id')
  removeNote(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notebook.deleteNote(user.id, id);
  }

  // Saqlanganlar
  @Get('saved')
  saved(@CurrentUser() user: PublicUser, @Query() q: SavedListQueryDto) {
    return this.notebook.listSaved(user.id, q);
  }

  @Get('saved/status')
  savedStatus(@CurrentUser() user: PublicUser, @Query() q: SavedStatusQueryDto) {
    return this.notebook.savedStatus(user.id, q.lessonId);
  }

  @Post('saved')
  @HttpCode(200)
  save(@CurrentUser() user: PublicUser, @Body() dto: SaveMaterialDto) {
    return this.notebook.save(user.id, dto.lessonId, dto.pageId);
  }

  @Delete('saved/:id')
  removeSaved(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notebook.removeSaved(user.id, id);
  }

  // Xatolarim (dars bloklari). Mashq/placement xatolari: mavjud GET /learning/mistakes.
  @Get('lesson-mistakes')
  lessonMistakes(@CurrentUser() user: PublicUser, @Query() q: MistakesQueryDto) {
    return this.notebook.lessonMistakes(user.id, q);
  }
}
