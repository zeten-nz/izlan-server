import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../auth/auth.service';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { CatalogQueryDto, EquipDto, UpdateProfileDto, UsernameParamDto } from './dto';
import { ProfileService } from './profile.service';

/** Profil, mukofotlar katalogi va kolleksiya. userId har doim sessiyadan olinadi. Xarid/redeem endpointlari YO'Q. */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
@Roles('STUDENT')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('profile/me')
  me(@CurrentUser() user: PublicUser) {
    return this.profile.me(user);
  }

  @Patch('profile/me')
  update(@CurrentUser() user: PublicUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }

  @Get('profile/u/:username')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  publicProfile(@CurrentUser() user: PublicUser, @Param() p: UsernameParamDto) {
    return this.profile.publicByUsername(user, p.username);
  }

  @Get('rewards/cosmetics')
  catalog(@CurrentUser() user: PublicUser, @Query() q: CatalogQueryDto) {
    return this.profile.catalog(user.id, q);
  }

  @Get('rewards/izl')
  izl() {
    return this.profile.izlCatalog();
  }

  @Get('collection')
  collection(@CurrentUser() user: PublicUser) {
    return this.profile.collection(user.id);
  }

  @Put('collection/equip')
  equip(@CurrentUser() user: PublicUser, @Body() dto: EquipDto) {
    return this.profile.equip(user.id, dto);
  }
}
