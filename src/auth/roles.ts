import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import type { PublicUser } from './auth.service';

const KEY = 'roles';

/** Endpoint faqat shu rollarga ochiq. SessionGuard'dan KEYIN ishlatiladi: @UseGuards(SessionGuard, RolesGuard) */
export const Roles = (...roles: Role[]) => SetMetadata(KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = (ctx.switchToHttp().getRequest<FastifyRequest>() as FastifyRequest & { user?: PublicUser }).user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException("Bu amal uchun ruxsat yo'q");
    return true;
  }
}
