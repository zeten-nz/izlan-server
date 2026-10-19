import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { GrammarService } from './grammar.service';

/** Ustoz muharriri uchun: tanlash mumkin bo'lgan qoidalar (faqat RELEASE qilingan/approved va faol til). Manba — serverning o'z reyestri. */
@Controller('staff/grammar')
@UseGuards(SessionGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class StaffGrammarController {
  constructor(private readonly grammar: GrammarService) {}

  @Get('rules')
  async rules() {
    const reg = await this.grammar.getRegistry();
    return { registryVersion: reg?.version ?? null, ok: reg !== null, rules: reg ? reg.listSelectable() : [] };
  }
}
