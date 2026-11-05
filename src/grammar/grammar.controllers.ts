import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { GrammarContentService } from './content.service';
import { GrammarReleaseService } from './release.service';

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ message: 'So‘rov noto‘g‘ri', issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return r.data;
};
const actor = (u: PublicUser) => ({ id: u.id, role: u.role });

const levelZ = z.object({ system: z.string().max(10), value: z.string().max(10), confirmed: z.boolean().optional() }).nullable();
const createZ = z.object({
  lang: z.string().regex(/^[a-z]{2,3}$/),
  explanationLang: z.string().regex(/^[a-z]{2,3}$/).optional(),
  slug: z.string().max(60),
  category: z.string().max(60),
  level: levelZ.optional(),
  provenance: z.string().optional(),
  content: z.unknown().refine((v) => v !== undefined, "content majburiy"),
});
const saveZ = z.object({
  rev: z.number().int().min(1),
  content: z.unknown().refine((v) => v !== undefined, "content majburiy"),
  provenance: z.string().optional(),
  meta: z.object({ slug: z.string().max(60).optional(), category: z.string().max(60).optional(), level: levelZ.optional() }).optional(),
});
const reasonZ = z.object({ reason: z.string().trim().min(3).max(500) });
const noteZ = z.object({ note: z.string().trim().min(1).max(1000) });
const approveZ = z.object({ contentHash: z.string().min(8).max(64), checks: z.record(z.string(), z.boolean()).optional(), note: z.string().max(1000).optional() });
const retireZ = z.object({ reason: z.string().trim().min(3).max(500), replacedById: z.string().regex(/^gr_[a-z]{2,3}_\d{6}$/).nullable().optional(), acknowledgeUsage: z.boolean().optional() });
const pinsZ = z.object({ pins: z.record(z.string(), z.string()).optional(), note: z.string().max(500).optional() });
const revertZ = z.object({ revisionId: z.string().uuid(), note: z.string().max(500).optional() });

/** Teacher + Admin: qoidalarni yaratish/o'qish/tahrirlash/topshirish. Ruxsatlar servisda (permissions.ts). */
@Controller('staff/grammar')
@UseGuards(SessionGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class StaffGrammarContentController {
  constructor(private readonly svc: GrammarContentService) {}

  @Get('languages')
  languages(@CurrentUser() u: PublicUser) {
    return this.svc.languages(actor(u));
  }

  @Get('manage/rules')
  list(@CurrentUser() u: PublicUser, @Query('lang') lang?: string, @Query('status') status?: string, @Query('mine') mine?: string, @Query('q') q?: string) {
    return this.svc.listRules(actor(u), { lang, status, mine: mine === '1' || mine === 'true', search: q?.slice(0, 60) });
  }

  @Get('manage/rules/:id')
  get(@CurrentUser() u: PublicUser, @Param('id') id: string) {
    return this.svc.getRule(actor(u), id);
  }

  @Post('manage/rules')
  create(@CurrentUser() u: PublicUser, @Body() body: unknown) {
    return this.svc.createRule(actor(u), parse(createZ, body));
  }

  @Put('manage/revisions/:id')
  save(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.saveDraft(actor(u), id, parse(saveZ, body));
  }

  @Post('manage/revisions/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.submit(actor(u), id);
  }

  @Post('manage/revisions/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.withdraw(actor(u), id);
  }

  @Delete('manage/rules/:id')
  remove(@CurrentUser() u: PublicUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.softDelete(actor(u), id, parse(reasonZ, body).reason);
  }
}

/** Faqat Admin. */
@Controller('admin/grammar')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminGrammarController {
  constructor(
    private readonly svc: GrammarContentService,
    private readonly releases: GrammarReleaseService,
  ) {}

  @Get('queue')
  queue(@CurrentUser() u: PublicUser) {
    return this.svc.listRules(actor(u), { status: 'IN_REVIEW' });
  }

  @Get('rules/:id/usage')
  usage(@Param('id') id: string) {
    return this.svc.usage(id);
  }

  @Get('rules/:id/history')
  history(@CurrentUser() u: PublicUser, @Param('id') id: string) {
    return this.svc.history(actor(u), id);
  }

  @Post('revisions/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.approve(actor(u), id, parse(approveZ, body));
  }

  @Post('revisions/:id/request-changes')
  @HttpCode(200)
  requestChanges(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.requestChanges(actor(u), id, parse(noteZ, body).note);
  }

  @Post('revisions/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.reject(actor(u), id, parse(noteZ, body).note);
  }

  @Post('rules/:id/revisions')
  newRevision(@CurrentUser() u: PublicUser, @Param('id') id: string) {
    return this.svc.newRevision(actor(u), id);
  }

  @Post('rules/:id/hide')
  @HttpCode(200)
  hide(@CurrentUser() u: PublicUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.setHidden(actor(u), id, true, parse(reasonZ, body).reason);
  }

  @Post('rules/:id/unhide')
  @HttpCode(200)
  unhide(@CurrentUser() u: PublicUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.setHidden(actor(u), id, false, parse(reasonZ, body).reason);
  }

  @Post('rules/:id/retire')
  @HttpCode(200)
  retire(@CurrentUser() u: PublicUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.retire(actor(u), id, parse(retireZ, body));
  }

  // ── release (faqat nomzod; aktivlash HTTP orqali MUMKIN EMAS — D2) ──

  @Get('releases')
  listReleases() {
    return this.releases.listReleases();
  }

  @Get('release-status')
  status() {
    return this.releases.status();
  }

  @Get('activations')
  activations() {
    return this.releases.activations();
  }

  @Post('releases/preview')
  @HttpCode(200)
  preview(@CurrentUser() u: PublicUser, @Body() body: unknown) {
    return this.releases.preview(actor(u), parse(pinsZ, body ?? {}).pins ?? {});
  }

  @Post('releases/candidate')
  candidate(@CurrentUser() u: PublicUser, @Body() body: unknown) {
    const b = parse(pinsZ, body ?? {});
    return this.releases.createCandidate(actor(u), { pins: b.pins, note: b.note });
  }

  @Post('rules/:id/revert-candidate')
  revert(@CurrentUser() u: PublicUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(revertZ, body);
    return this.releases.createRuleRevertCandidate(actor(u), id, b.revisionId, b.note);
  }
}

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.GRAMMAR_INTERNAL_TOKEN ?? '';
    if (expected.length < 16) throw new ServiceUnavailableException('Ichki grammatika API sozlanmagan');
    const got = String(ctx.switchToHttp().getRequest<FastifyRequest>().headers['x-grammar-internal'] ?? '');
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}

/** Client (Next.js server) uchun runtime xizmati. Faqat ichki token bilan; brauzerga ochiq emas. */
@Controller('internal/grammar')
@UseGuards(InternalTokenGuard)
@SkipThrottle()
export class InternalGrammarController {
  constructor(
    private readonly releases: GrammarReleaseService,
    private readonly svc: GrammarContentService,
  ) {}

  @Get('active')
  @Header('Cache-Control', 'no-store')
  async active() {
    const act = await this.releases.activeRow();
    if (!act) throw new NotFoundException('Aktiv release yo‘q');
    const st = await this.releases.status();
    return { releaseId: act.releaseId, seq: st.active?.seq ?? 0, snapshotHash: st.active?.snapshotHash ?? '', contentSchemaVersion: 1 };
  }

  @Get('overlay')
  @Header('Cache-Control', 'no-store')
  overlay() {
    return this.svc.overlay();
  }

  @Get('releases/:id/bundle')
  @Header('Cache-Control', 'private, max-age=3600, immutable')
  async bundle(@Param('id', ParseUUIDPipe) id: string) {
    return this.releases.bundle(id);
  }
}
