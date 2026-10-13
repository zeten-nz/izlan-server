import { BadRequestException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { AssetsService } from './assets.service';
import { MAX_AUDIO_BYTES } from './media';

@Controller('assets')
@UseGuards(SessionGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  /** Ustoz rasm/audio yuklaydi (multipart, bitta fayl). */
  @Post()
  @HttpCode(200)
  @Roles('TEACHER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async upload(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest) {
    if (!req.isMultipart()) throw new BadRequestException('Fayl yuboring');
    const file = await req.file({ limits: { fileSize: MAX_AUDIO_BYTES + 1, files: 1 } });
    if (!file) throw new BadRequestException('Fayl yuboring');
    const buf = await file.toBuffer();
    if (file.file.truncated) throw new BadRequestException('Fayl juda katta');
    return this.assets.save(user.id, file.filename || 'fayl', buf);
  }

  /** Kirgan har bir foydalanuvchi ko'ra oladi (ID taxmin qilib bo'lmaydi). */
  @Get(':id')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() reply: FastifyReply) {
    const { row, data } = await this.assets.read(id);
    reply
      .header('Content-Type', row.mime)
      .header('Content-Length', data.length)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(data);
  }
}
