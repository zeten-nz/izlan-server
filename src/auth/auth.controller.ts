import '@fastify/cookie';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppConfig } from '../config/app-config';
import { AuthService, type IssuedSession } from './auth.service';
import {
  ForgotDto,
  LoginDto,
  RegisterDto,
  ResendDto,
  ResetPasswordDto,
  VerifyRegistrationDto,
} from './dto';

/** Auth endpointlari uchun qattiqroq limit: IP boshiga daqiqasiga 10 ta. */
const STRICT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Xat yuboradigan endpointlar: IP boshiga SOATIGA cheklov. Kunlik email kvotasi (EMAIL_DAILY_LIMIT) umumiy —
 * bitta manba uni tugatib, boshqalarning ro'yxatdan o'tishini to'xtatmasligi uchun.
 * Murosa: bitta NAT ortidagi sinf/ofis ham shu limitni bo'lishadi, shuning uchun juda past emas.
 */
const MAIL_HOURLY = (limit: number) => ({ default: { limit, ttl: 3_600_000 } });

const REG_COOKIE = 'izlan_reg';
const REG_COOKIE_PATH = '/api/auth/register';
/** OTP TTL (10 daq) + bir necha resend uchun yetarli; qator o'zi baribir TTL bilan tugaydi. */
const REG_COOKIE_MAX_AGE_S = 2 * 3600;

@Controller('auth')
@Throttle(STRICT)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  private setSessionCookie(reply: FastifyReply, s: IssuedSession) {
    reply.setCookie(this.config.cookieName, s.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProd,
      path: '/',
      // remember=false → sessiya cookie'si (brauzer yopilganda o'chadi), serverda baribir 24 soatda tugaydi
      ...(s.remember ? { expires: s.expiresAt } : {}),
    });
  }

  private clearSessionCookie(reply: FastifyReply) {
    reply.clearCookie(this.config.cookieName, { path: '/' });
  }

  /**
   * Ro'yxatdan o'tish so'rovini boshlagan brauzer tokeni (S-01). Faqat /api/auth/register* yo'llariga yuboriladi.
   * Brauzer yo'li Next rewrite orqali ham /api/auth/register… bo'lgani uchun path bir xil ishlaydi.
   */
  private setRegCookie(reply: FastifyReply, token: string) {
    reply.setCookie(REG_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: this.config.isProd, path: REG_COOKIE_PATH, maxAge: REG_COOKIE_MAX_AGE_S });
  }

  private token(req: FastifyRequest): string | undefined {
    return req.cookies?.[this.config.cookieName];
  }

  @Post('register')
  @HttpCode(200)
  @Throttle(MAIL_HOURLY(15))
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const { clientToken, ...res } = await this.auth.register(dto);
    this.setRegCookie(reply, clientToken);
    return res;
  }

  @Post('register/resend')
  @HttpCode(200)
  @Throttle(MAIL_HOURLY(15))
  resendRegistration(@Body() dto: ResendDto, @Req() req: FastifyRequest) {
    return this.auth.resendRegistration(dto, req.cookies?.[REG_COOKIE]);
  }

  @Post('register/verify')
  @HttpCode(200)
  async verifyRegistration(
    @Body() dto: VerifyRegistrationDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.auth.verifyRegistration(dto, req.cookies?.[REG_COOKIE], req.headers['user-agent']);
    this.setSessionCookie(reply, session);
    reply.clearCookie(REG_COOKIE, { path: REG_COOKIE_PATH });
    return { user: session.user };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.auth.login(dto, req.headers['user-agent']);
    this.setSessionCookie(reply, session);
    return { user: session.user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(this.token(req));
    this.clearSessionCookie(reply);
    return { ok: true };
  }

  @Get('me')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async me(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const user = await this.auth.userFromToken(this.token(req));
    if (!user) {
      this.clearSessionCookie(reply);
      throw new UnauthorizedException('Kirish talab qilinadi');
    }
    return { user };
  }

  @Post('forgot')
  @HttpCode(200)
  @Throttle(MAIL_HOURLY(10))
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto);
  }

  @Post('reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { ok: true };
  }
}
