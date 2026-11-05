import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { CosmeticDto, UpdateCosmeticDto } from '../profile/dto';
import { CosmeticsAdminService } from './cosmetics.service';

/** Admin: bezaklar katalogi. Faqat ADMIN. Sotish, XP/IZL yechish yoki berish endpointlari YO'Q. */
@Controller('admin/cosmetics')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class CosmeticsAdminController {
  constructor(private readonly cosmetics: CosmeticsAdminService) {}

  @Get()
  list() {
    return this.cosmetics.list();
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: PublicUser, @Body() dto: CosmeticDto) {
    return this.cosmetics.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCosmeticDto) {
    return this.cosmetics.update(user.id, id, dto);
  }
}
