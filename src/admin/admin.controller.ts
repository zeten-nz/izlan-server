import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegisterDto } from '../auth/dto';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { AdminService } from './admin.service';

/** Admin: hozircha faqat ustoz qo'shish. */
@Controller('admin')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('teachers')
  @HttpCode(200)
  createTeacher(@Body() dto: RegisterDto) {
    return this.admin.createTeacher(dto);
  }
}
