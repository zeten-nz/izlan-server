import '@fastify/cookie';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppConfig } from '../config/app-config';
import { AuthService, type PublicUser } from './auth.service';

type AuthedRequest = FastifyRequest & { user?: PublicUser };

/** Cookie'dagi sessiyani tekshiradi va foydalanuvchini so'rovga biriktiradi. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.auth.userFromToken(req.cookies?.[this.config.cookieName]);
    if (!user) throw new UnauthorizedException('Kirish talab qilinadi');
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): PublicUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user as PublicUser;
});
