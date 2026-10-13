import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { MailService, type OtpPurpose } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DUMMY_HASH,
  generateOtp,
  hashOtp,
  hashPassword,
  hashSessionToken,
  newSessionToken,
  safeEqualHex,
  verifyPassword,
} from './crypto.util';
import type { ForgotDto, LoginDto, RegisterDto, ResendDto, ResetPasswordDto, VerifyRegistrationDto } from './dto';

const MAX_OTP_ATTEMPTS = 5;

export type PublicUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  role: User['role'];
};

export type IssuedSession = { token: string; remember: boolean; expiresAt: Date; user: PublicUser };

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  birthYear: u.birthYear,
  role: u.role,
});

/** Maydon darajasidagi xato: klient xabarni to'g'ri inputning tagida ko'rsatadi. */
function fieldError(status: HttpStatus, errors: Record<string, string>, message?: string): HttpException {
  return new HttpException({ message: message ?? Object.values(errors)[0], errors }, status);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {}

  // ───────────── Ro'yxatdan o'tish ─────────────

  async register(dto: RegisterDto): Promise<{ email: string; resendInSeconds: number }> {
    if (dto.password !== dto.confirmPassword) {
      throw fieldError(HttpStatus.BAD_REQUEST, { confirmPassword: 'Parollar mos kelmadi' });
    }

    const [byEmail, byUsername] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { username: dto.username }, select: { id: true } }),
    ]);
    const taken: Record<string, string> = {};
    if (byEmail) taken.email = "Bu email bilan hisob allaqachon bor";
    if (byUsername) taken.username = 'Bu username band';
    if (Object.keys(taken).length) throw fieldError(HttpStatus.CONFLICT, taken);

    const existing = await this.prisma.pendingRegistration.findUnique({ where: { email: dto.email } });
    this.assertCooldown(existing?.lastSentAt);

    const code = generateOtp();
    const now = new Date();
    const data = {
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      birthYear: dto.birthYear,
      passwordHash: await hashPassword(dto.password),
      codeHash: hashOtp(this.config.authSecret, `register:${dto.email}`, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + this.config.otpTtlMs),
      lastSentAt: now,
    };
    await this.prisma.pendingRegistration.upsert({
      where: { email: dto.email },
      create: { email: dto.email, ...data },
      update: data,
    });
    await this.sendOtp(dto.email, code, 'register');
    return { email: dto.email, resendInSeconds: this.config.otpResendMs / 1000 };
  }

  async resendRegistration(dto: ResendDto): Promise<{ resendInSeconds: number }> {
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { email: dto.email } });
    if (!pending) {
      throw fieldError(HttpStatus.BAD_REQUEST, {}, "Ro'yxatdan o'tish so'rovi topilmadi. Qaytadan boshlang");
    }
    this.assertCooldown(pending.lastSentAt);
    const code = generateOtp();
    const now = new Date();
    await this.prisma.pendingRegistration.update({
      where: { email: dto.email },
      data: {
        codeHash: hashOtp(this.config.authSecret, `register:${dto.email}`, code),
        attempts: 0,
        expiresAt: new Date(now.getTime() + this.config.otpTtlMs),
        lastSentAt: now,
      },
    });
    await this.sendOtp(dto.email, code, 'register');
    return { resendInSeconds: this.config.otpResendMs / 1000 };
  }

  async verifyRegistration(dto: VerifyRegistrationDto, userAgent?: string): Promise<IssuedSession> {
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { email: dto.email } });
    if (!pending) {
      throw fieldError(HttpStatus.BAD_REQUEST, { code: "Kod eskirgan yoki so'rov topilmadi. Qaytadan boshlang" });
    }
    await this.checkOtp(
      { attempts: pending.attempts, expiresAt: pending.expiresAt, codeHash: pending.codeHash },
      `register:${dto.email}`,
      dto.code,
      () => this.prisma.pendingRegistration.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } }),
      () => this.prisma.pendingRegistration.delete({ where: { id: pending.id } }),
    );

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: pending.email,
            username: pending.username,
            firstName: pending.firstName,
            lastName: pending.lastName,
            birthYear: pending.birthYear,
            passwordHash: pending.passwordHash,
            emailVerifiedAt: new Date(),
          },
        });
        await tx.pendingRegistration.delete({ where: { id: pending.id } });
        return created;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw fieldError(HttpStatus.CONFLICT, {}, 'Bu username yoki email band bo\'lib qoldi. Qaytadan boshlang');
      }
      throw e;
    }
    // Ro'yxatdan o'tganda avtomatik "eslab qol"
    return this.issueSession(user, true, userAgent);
  }

  // ───────────── Kirish / chiqish ─────────────

  async login(dto: LoginDto, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findFirst({
      where: dto.identifier.includes('@') ? { email: dto.identifier } : { username: dto.identifier },
    });
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Username/email yoki parol noto\'g\'ri');
    return this.issueSession(user, dto.remember === true, userAgent);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }

  /** Cookie tokeni bo'yicha foydalanuvchi; muddati o'tgan bo'lsa null. */
  async userFromToken(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt <= new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return toPublicUser(session.user);
  }

  // ───────────── Parolni tiklash ─────────────

  /** Email topilmasa aniq xato qaytariladi (foydalanuvchi so'rovi). Ro'yxatdan o'tishda ham email bandligi ko'rsatiladi. */
  async forgot(dto: ForgotDto): Promise<{ resendInSeconds: number }> {
    const resendInSeconds = this.config.otpResendMs / 1000;
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw fieldError(HttpStatus.NOT_FOUND, { email: "Bu email bilan hisob topilmadi" });

    const existing = await this.prisma.passwordReset.findUnique({ where: { userId: user.id } });
    if (existing && Date.now() - existing.lastSentAt.getTime() < this.config.otpResendMs) {
      return { resendInSeconds }; // sukut bilan: kod allaqachon yuborilgan
    }
    const code = generateOtp();
    const now = new Date();
    const data = {
      codeHash: hashOtp(this.config.authSecret, `reset:${dto.email}`, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + this.config.otpTtlMs),
      lastSentAt: now,
    };
    await this.prisma.passwordReset.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    await this.sendOtp(dto.email, code, 'reset');
    return { resendInSeconds };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw fieldError(HttpStatus.BAD_REQUEST, { confirmPassword: 'Parollar mos kelmadi' });
    }
    const invalid = () => fieldError(HttpStatus.BAD_REQUEST, { code: "Kod noto'g'ri yoki eskirgan" });

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const reset = user ? await this.prisma.passwordReset.findUnique({ where: { userId: user.id } }) : null;
    if (!user || !reset) throw invalid();

    await this.checkOtp(
      reset,
      `reset:${dto.email}`,
      dto.code,
      () => this.prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } }),
      () => this.prisma.passwordReset.delete({ where: { id: reset.id } }),
    );

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.passwordReset.delete({ where: { id: reset.id } }),
      // Parol almashganda barcha qurilmalardan chiqariladi
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
  }

  // ───────────── Ichki yordamchilar ─────────────

  private async issueSession(user: User, remember: boolean, userAgent?: string): Promise<IssuedSession> {
    const { token, hash } = newSessionToken();
    const ttl = remember ? this.config.sessionRememberMs : this.config.sessionShortMs;
    const expiresAt = new Date(Date.now() + ttl);
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: hash, remember, expiresAt, userAgent: userAgent?.slice(0, 250) },
    });
    // Eskirgan sessiyalarni vaqti-vaqti bilan tozalash (har kirishda arzon)
    void this.prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }).catch(() => undefined);
    return { token, remember, expiresAt, user: toPublicUser(user) };
  }

  private assertCooldown(lastSentAt: Date | undefined) {
    if (!lastSentAt) return;
    const wait = this.config.otpResendMs - (Date.now() - lastSentAt.getTime());
    if (wait > 0) {
      const seconds = Math.ceil(wait / 1000);
      throw new HttpException(
        { message: `Yangi kodni ${seconds} soniyadan keyin so'rang`, retryAfterSeconds: seconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async sendOtp(email: string, code: string, purpose: OtpPurpose) {
    try {
      await this.mail.sendOtp(email, code, purpose, this.config.otpTtlMs / 60_000);
    } catch {
      throw new HttpException(
        { message: "Email yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring" },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Muddat, urinishlar soni va kodni tekshiradi. Noto'g'ri bo'lsa urinishni hisoblaydi. */
  private async checkOtp(
    rec: { attempts: number; expiresAt: Date; codeHash: string },
    scope: string,
    code: string,
    bumpAttempts: () => Promise<unknown>,
    destroy: () => Promise<unknown>,
  ) {
    if (rec.expiresAt <= new Date()) {
      await destroy().catch(() => undefined);
      throw fieldError(HttpStatus.BAD_REQUEST, { code: 'Kod muddati tugagan. Yangi kod so\'rang' });
    }
    if (rec.attempts >= MAX_OTP_ATTEMPTS) {
      await destroy().catch(() => undefined);
      throw fieldError(HttpStatus.BAD_REQUEST, { code: "Juda ko'p noto'g'ri urinish. Yangi kod so'rang" });
    }
    if (!safeEqualHex(rec.codeHash, hashOtp(this.config.authSecret, scope, code))) {
      await bumpAttempts();
      const left = MAX_OTP_ATTEMPTS - rec.attempts - 1;
      throw fieldError(HttpStatus.BAD_REQUEST, {
        code: left > 0 ? `Kod noto'g'ri (${left} ta urinish qoldi)` : "Kod noto'g'ri. Yangi kod so'rang",
      });
    }
  }
}

