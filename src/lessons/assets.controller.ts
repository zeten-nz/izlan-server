import { BadRequestException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { LearningService } from '../learning/learning.service';
import { AssetsService } from './assets.service';
import { MAX_AUDIO_BYTES } from './media';
import { parseRange } from './range';

@Controller('assets')
@UseGuards(SessionGuard, RolesGuard)
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly learning: LearningService,
  ) {}

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

  /**
   * Ustoz/admin — istalgan fayl (muharrir, preview). O'quvchi — faqat o'ziga ochiq (mavzu ochilgan va
   * pullik bo'lsa obunasi bor) nashr qilingan darsda ishlatilgan fayl; aks holda 404 (mavjudligi oshkor qilinmaydi).
   * Range (206) qo'llab-quvvatlanadi: iOS Safari audio'ni shusiz ijro etmaydi / o'tkazib bo'lmaydi.
   */
  @Get(':id')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async get(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    if (user.role === 'STUDENT') {
      const topics = await this.assets.topicsUsing(id);
      const open = topics.length ? await this.learning.accessibleTopicIds(user.id, topics) : new Set<string>();
      if (open.size === 0) throw new NotFoundException('Fayl topilmadi');
    }
    const { row, data } = await this.assets.read(id);
    const range = parseRange(req.headers.range, data.length);
    reply
      .header('Content-Type', row.mime)
      .header('Accept-Ranges', 'bytes')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      // Qisqa: obuna tugasa yoki boshqa foydalanuvchi kirsa, brauzer keshi uzoq ochiq qolmasin
      .header('Cache-Control', 'private, max-age=3600');
    if (range.type === 'unsatisfiable') {
      return reply.code(416).header('Content-Range', `bytes */${data.length}`).send();
    }
    if (range.type === 'partial') {
      const part = data.subarray(range.start, range.end + 1);
      return reply
        .code(206)
        .header('Content-Range', `bytes ${range.start}-${range.end}/${data.length}`)
        .header('Content-Length', part.length)
        .send(part);
    }
    return reply.header('Content-Length', data.length).send(data);
  }
}
