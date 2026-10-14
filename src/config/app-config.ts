import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** .env qiymatlarining tipli ko'rinishi. Yetishmayotgan majburiy qiymat xato beradi. */
@Injectable()
export class AppConfig {
  constructor(private readonly cfg: ConfigService) {}

  private str(key: string, fallback?: string): string {
    const v = this.cfg.get<string>(key) ?? fallback;
    if (v === undefined || v === '') throw new Error(`.env da ${key} yo'q`);
    return v;
  }
  private num(key: string, fallback: number): number {
    const raw = this.cfg.get<string>(key);
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`.env da ${key} noto'g'ri raqam`);
    return n;
  }

  get isProd() {
    return this.cfg.get('NODE_ENV') === 'production';
  }
  get port() {
    return this.num('PORT', 4000);
  }

  get authSecret() {
    const s = this.str('AUTH_SECRET');
    if (this.isProd && s.length < 32) throw new Error("AUTH_SECRET kamida 32 belgi bo'lishi kerak");
    return s;
  }
  get cookieName() {
    return this.str('SESSION_COOKIE_NAME', 'izlan_session');
  }
  get sessionShortMs() {
    return this.num('SESSION_SHORT_HOURS', 24) * 3_600_000;
  }
  get sessionRememberMs() {
    return this.num('SESSION_REMEMBER_DAYS', 30) * 86_400_000;
  }
  get otpTtlMs() {
    return this.num('OTP_TTL_MINUTES', 10) * 60_000;
  }
  get otpResendMs() {
    return this.num('OTP_RESEND_SECONDS', 60) * 1000;
  }

  get mailDriver(): 'console' | 'smtp' | 'resend' {
    const d = this.cfg.get<string>('MAIL_DRIVER') ?? 'console';
    if (d !== 'console' && d !== 'smtp' && d !== 'resend') throw new Error('MAIL_DRIVER: console, smtp yoki resend');
    if (d === 'console' && this.isProd) throw new Error("Productionda MAIL_DRIVER=resend (yoki smtp) bo'lishi shart");
    return d;
  }
  get resendApiKey() {
    return this.str('RESEND_API_KEY');
  }
  /** Resend so'rovi shuncha ms'dan keyin "natija noaniq" deb hisoblanadi. */
  get mailTimeoutMs() {
    return this.num('MAIL_SEND_TIMEOUT_MS', 10_000);
  }
  /** Kunlik email limiti (Resend bepul: 100; zaxira uchun 90). Faqat resend driver'da qo'llanadi. */
  get emailDailyLimit() {
    return this.num('EMAIL_DAILY_LIMIT', 90);
  }
  get smtp() {
    return {
      host: this.str('SMTP_HOST'),
      port: this.num('SMTP_PORT', 465),
      secure: this.cfg.get('SMTP_SECURE') !== 'false',
      user: this.str('SMTP_USER'),
      pass: this.str('SMTP_PASS'),
    };
  }
  get mailFrom() {
    return this.str('MAIL_FROM', 'Izlan <no-reply@izlan.uz>');
  }
}
