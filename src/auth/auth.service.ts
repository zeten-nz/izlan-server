import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { MailSendError, MailService, type OtpPurpose } from '../mail/mail.service';
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

type OtpRow = { id: string; codeHash: string; attempts: number; expiresAt: Date };

const isNotFound = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

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
  private readonly log = new Logger(AuthService.name);
  /** Forgot: javob darrov qaytadi (email mavjudligi vaqt bilan ham sezilmasin), xat fonda yuboriladi. */
  private readonly inflight = new Set<Promise<unknown>>();

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

    await this.assertMailCapacity();
    const existing = await this.prisma.pendingRegistration.findUnique({ where: { email: dto.email } });
    this.assertCooldown(existing?.lastSentAt);

    const code = generateOtp();
    const now = new Date();
    const otp = {
      codeHash: hashOtp(this.config.authSecret, `register:${dto.email}`, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + this.config.otpTtlMs),
      lastSentAt: now,
    };
    const data = {
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      birthYear: dto.birthYear,
      passwordHash: await hashPassword(dto.password),
      ...otp,
    };

    // Atomik: cooldown poygasida faqat bitta parallel so'rov g'olib bo'ladi
    if (existing) {
      const won = await this.prisma.pendingRegistration.updateMany({
        where: { id: existing.id, lastSentAt: existing.lastSentAt },
        data,
      });
      if (won.count !== 1) throw this.cooldownError(this.config.otpResendMs / 1000);
    } else {
      try {
        await this.prisma.pendingRegistration.create({ data: { email: dto.email, ...data } });
      } catch (e) {
        if (isUnique(e)) throw this.cooldownError(this.config.otpResendMs / 1000);
        throw e;
      }
    }

    // Xat aniq ketmasa avvalgi holat tiklanadi (kod ham, cooldown ham): "yuborildi" yolg'on bo'lmasin
    const rollback = async () => {
      if (existing) {
        const { id: _id, email: _email, createdAt: _created, ...prev } = existing;
        await this.prisma.pendingRegistration.updateMany({
          where: { email: dto.email, codeHash: otp.codeHash },
          data: prev,
        });
      } else {
        await this.prisma.pendingRegistration.deleteMany({ where: { email: dto.email, codeHash: otp.codeHash } });
      }
    };
    await this.deliver(dto.email, code, 'register', otp, rollback);
    return { email: dto.email, resendInSeconds: this.config.otpResendMs / 1000 };
  }

  async resendRegistration(dto: ResendDto): Promise<{ resendInSeconds: number }> {
    await this.assertMailCapacity();
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { email: dto.email } });
    if (!pending) {
      throw fieldError(HttpStatus.BAD_REQUEST, {}, "Ro'yxatdan o'tish so'rovi topilmadi. Qaytadan boshlang");
    }
    this.assertCooldown(pending.lastSentAt);
    const code = generateOtp();
    const now = new Date();
    const otp = {
      codeHash: hashOtp(this.config.authSecret, `register:${dto.email}`, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + this.config.otpTtlMs),
      lastSentAt: now,
    };
    const won = await this.prisma.pendingRegistration.updateMany({
      where: { id: pending.id, lastSentAt: pending.lastSentAt },
      data: otp,
    });
    if (won.count !== 1) throw this.cooldownError(this.config.otpResendMs / 1000);

    const rollback = () =>
      this.prisma.pendingRegistration.updateMany({
        where: { id: pending.id, codeHash: otp.codeHash },
        data: {
          codeHash: pending.codeHash,
          attempts: pending.attempts,
          expiresAt: pending.expiresAt,
          lastSentAt: pending.lastSentAt,
        },
      });
    await this.deliver(dto.email, code, 'register', otp, rollback);
    return { resendInSeconds: this.config.otpResendMs / 1000 };
  }

  async verifyRegistration(dto: VerifyRegistrationDto, userAgent?: string): Promise<IssuedSession> {
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { email: dto.email } });
    if (!pending) {
      throw fieldError(HttpStatus.BAD_REQUEST, { code: "Kod eskirgan yoki so'rov topilmadi. Qaytadan boshlang" });
    }
    const row = await this.verifyOtp(
      pending,
      `register:${dto.email}`,
      dto.code,
      (now) =>
        this.claimAttempt(
          this.prisma.pendingRegistration.update({
            where: {
              id: pending.id,
              codeHash: pending.codeHash,
              attempts: { lt: MAX_OTP_ATTEMPTS },
              expiresAt: { gt: now },
            },
            data: { attempts: { increment: 1 } },
          }),
        ),
      () => this.prisma.pendingRegistration.deleteMany({ where: { id: pending.id, codeHash: pending.codeHash } }),
    );

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // Bir martalik: faqat bitta parallel so'rov kodni iste'mol qila oladi
        const used = await tx.pendingRegistration.deleteMany({ where: { id: row.id, codeHash: row.codeHash } });
        if (used.count !== 1) throw fieldError(HttpStatus.BAD_REQUEST, { code: "Kod noto'g'ri yoki eskirgan" });
        return tx.user.create({
          data: {
            email: row.email,
            username: row.username,
            firstName: row.firstName,
            lastName: row.lastName,
            birthYear: row.birthYear,
            passwordHash: row.passwordHash,
            emailVerifiedAt: new Date(),
          },
        });
      });
    } catch (e) {
      if (isUnique(e)) {
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

  /**
   * Email mavjudligi oshkor qilinmaydi: mavjud va mavjud bo'lmagan email uchun bir xil javob va bir xil vaqt
   * (xat fonda yuboriladi). Yuborish xatosi faqat server logiga yoziladi.
   * Ro'yxatdan o'tishda esa email bandligi ko'rsatiladi (OTP oqimida buning iloji yo'q).
   */
  async forgot(dto: ForgotDto): Promise<{ resendInSeconds: number }> {
    const resendInSeconds = this.config.otpResendMs / 1000;
    // Email'ga bog'liq emas, shuning uchun hech narsani oshkor qilmaydi
    await this.assertMailCapacity();
    const job = this.dispatchReset(dto.email).catch((e: unknown) => {
      // Faqat tur: xabar/qiymatlar yozilmaydi (email, kod, kalit bo'lishi mumkin)
      this.log.error(`Parol tiklash xati yuborilmadi: ${e instanceof Error ? e.name : "noma'lum"}`);
    });
    this.inflight.add(job);
    void job.finally(() => this.inflight.delete(job));
    return { resendInSeconds };
  }

  /** Fon ishlarini kutish (testlar va graceful shutdown uchun). */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
  }

  private async dispatchReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const existing = await this.prisma.passwordReset.findUnique({ where: { userId: user.id } });
    if (existing && Date.now() - existing.lastSentAt.getTime() < this.config.otpResendMs) return; // kod allaqachon yuborilgan

    const code = generateOtp();
    const now = new Date();
    const otp = {
      codeHash: hashOtp(this.config.authSecret, `reset:${email}`, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + this.config.otpTtlMs),
      lastSentAt: now,
    };
    if (existing) {
      const won = await this.prisma.passwordReset.updateMany({
        where: { id: existing.id, lastSentAt: existing.lastSentAt },
        data: otp,
      });
      if (won.count !== 1) return; // parallel so'rov g'olib bo'ldi
    } else {
      try {
        await this.prisma.passwordReset.create({ data: { userId: user.id, ...otp } });
      } catch (e) {
        if (isUnique(e)) return;
        throw e;
      }
    }

    const rollback = async () => {
      if (existing) {
        await this.prisma.passwordReset.updateMany({
          where: { userId: user.id, codeHash: otp.codeHash },
          data: {
            codeHash: existing.codeHash,
            attempts: existing.attempts,
            expiresAt: existing.expiresAt,
            lastSentAt: existing.lastSentAt,
          },
        });
      } else {
        await this.prisma.passwordReset.deleteMany({ where: { userId: user.id, codeHash: otp.codeHash } });
      }
    };
    await this.deliver(email, code, 'reset', otp, rollback);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw fieldError(HttpStatus.BAD_REQUEST, { confirmPassword: 'Parollar mos kelmadi' });
    }
    const invalid = () => fieldError(HttpStatus.BAD_REQUEST, { code: "Kod noto'g'ri yoki eskirgan" });

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const reset = user ? await this.prisma.passwordReset.findUnique({ where: { userId: user.id } }) : null;
    if (!user || !reset) throw invalid();

    const row = await this.verifyOtp(
      reset,
      `reset:${dto.email}`,
      dto.code,
      (now) =>
        this.claimAttempt(
          this.prisma.passwordReset.update({
            where: {
              id: reset.id,
              codeHash: reset.codeHash,
              attempts: { lt: MAX_OTP_ATTEMPTS },
              expiresAt: { gt: now },
            },
            data: { attempts: { increment: 1 } },
          }),
        ),
      () => this.prisma.passwordReset.deleteMany({ where: { id: reset.id, codeHash: reset.codeHash } }),
    );

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.$transaction(async (tx) => {
      // Bir martalik: parallel ikkinchi so'rov parolni qayta o'zgartira olmaydi
      const used = await tx.passwordReset.deleteMany({ where: { id: row.id, codeHash: row.codeHash } });
      if (used.count !== 1) throw invalid();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Parol almashganda barcha qurilmalardan chiqariladi
      await tx.session.deleteMany({ where: { userId: user.id } });
    });
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

  private cooldownError(seconds: number) {
    return new HttpException(
      { message: `Yangi kodni ${seconds} soniyadan keyin so'rang`, retryAfterSeconds: seconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private assertCooldown(lastSentAt: Date | undefined) {
    if (!lastSentAt) return;
    const wait = this.config.otpResendMs - (Date.now() - lastSentAt.getTime());
    if (wait > 0) throw this.cooldownError(Math.ceil(wait / 1000));
  }

  /** Kunlik email limiti tugagan bo'lsa, OTP yozmasdan darrov aniq xabar. */
  private async assertMailCapacity() {
    try {
      await this.mail.assertCapacity();
    } catch (e) {
      if (e instanceof MailSendError) throw this.mailHttpError(e);
      throw e;
    }
  }

  /**
   * Xatni yuboradi. Aniq rad etilsa OTP holati tiklanadi (cooldown ham). Natija noaniq bo'lsa
   * (timeout/5xx) holat saqlanadi: xat kelgan bo'lishi mumkin, kod ishlashi kerak.
   */
  private async deliver(
    email: string,
    code: string,
    purpose: OtpPurpose,
    otp: { codeHash: string; lastSentAt: Date },
    rollback: () => Promise<unknown>,
  ) {
    const idempotencyKey = createHash('sha256')
      .update(`${purpose}:${email}:${otp.lastSentAt.getTime()}:${otp.codeHash}`)
      .digest('hex');
    try {
      await this.mail.sendOtp(email, code, purpose, this.config.otpTtlMs / 60_000, idempotencyKey);
    } catch (e) {
      const err = e instanceof MailSendError ? e : new MailSendError('unknown', 'Kutilmagan xato');
      if (err.definite) {
        await rollback().catch(() => this.log.error("OTP holatini tiklab bo'lmadi"));
      }
      // Faqat tur/status/kod: email, kod va kalit hech qachon yozilmaydi
      this.log.error(
        `OTP email yuborilmadi: purpose=${purpose} kind=${err.kind} status=${err.status ?? '-'} code=${err.code ?? '-'}`,
      );
      throw this.mailHttpError(err);
    }
  }

  private mailHttpError(err: MailSendError): HttpException {
    const wait = this.config.otpResendMs / 1000;
    switch (err.kind) {
      case 'quota':
        return new HttpException(
          { message: "Hozir email yuborish vaqtincha cheklangan. Birozdan keyin qayta urinib ko'ring" },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      case 'rate_limited':
        return new HttpException(
          { message: "Email xizmati band. Bir necha soniyadan keyin qayta urinib ko'ring", retryAfterSeconds: 10 },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'unknown':
        return new HttpException(
          {
            message: `Xat yuborilganini tasdiqlab bo'lmadi. Kod kelmasa, ${wait} soniyadan keyin yangi kod so'rang`,
            retryAfterSeconds: wait,
          },
          HttpStatus.BAD_GATEWAY,
        );
      default:
        return new HttpException(
          { message: "Email yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring" },
          HttpStatus.BAD_GATEWAY,
        );
    }
  }

  /** Atomik shartli yangilash: shart bajarilmasa (P2025) null. */
  private async claimAttempt<T>(op: Promise<T>): Promise<T | null> {
    try {
      return await op;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  /**
   * Muddat, urinishlar va kodni tekshiradi. URINISH AVVAL atomik hisoblanadi (so'ng solishtiriladi), shuning
   * uchun parallel so'rovlar bilan 5 ta urinish limitini aylanib o'tib bo'lmaydi. Kodni iste'mol qilish
   * (o'chirish) chaqiruvchi tranzaksiyasida bajariladi.
   */
  private async verifyOtp<T extends OtpRow>(
    rec: T,
    scope: string,
    code: string,
    claim: (now: Date) => Promise<T | null>,
    destroy: () => Promise<unknown>,
  ): Promise<T> {
    const now = new Date();
    if (rec.expiresAt <= now) {
      await destroy().catch(() => undefined);
      throw fieldError(HttpStatus.BAD_REQUEST, { code: "Kod muddati tugagan. Yangi kod so'rang" });
    }
    const row = await claim(now);
    if (!row) {
      if (rec.attempts >= MAX_OTP_ATTEMPTS) {
        await destroy().catch(() => undefined);
        throw fieldError(HttpStatus.BAD_REQUEST, { code: "Juda ko'p noto'g'ri urinish. Yangi kod so'rang" });
      }
      // Parallel so'rov kodni ishlatib yubordi/almashtirdi yoki urinishlar tugadi
      throw fieldError(HttpStatus.BAD_REQUEST, { code: "Kod noto'g'ri yoki eskirgan. Yangi kod so'rang" });
    }
    if (!safeEqualHex(row.codeHash, hashOtp(this.config.authSecret, scope, code))) {
      const left = MAX_OTP_ATTEMPTS - row.attempts;
      throw fieldError(HttpStatus.BAD_REQUEST, {
        code: left > 0 ? `Kod noto'g'ri (${left} ta urinish qoldi)` : "Kod noto'g'ri. Yangi kod so'rang",
      });
    }
    return row;
  }
}
