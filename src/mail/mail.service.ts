import { Inject, Injectable, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { EmailQuota, type QuotaToken } from './email-quota';
import { MAIL_PROVIDER, MailSendError, type MailProvider } from './mail.types';
import { createMailProvider } from './providers';
import { renderOtpMail, type OtpPurpose } from './templates';

export { MailSendError } from './mail.types';
export type { OtpPurpose } from './templates';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly quota: EmailQuota,
    private readonly config: AppConfig,
  ) {}

  /** Kvota tugagan bo'lsa MailSendError('quota'). Rezerv qilmaydi — faqat erta, arzon tekshiruv. */
  async assertCapacity(): Promise<void> {
    if (!this.provider.metered) return;
    if (!(await this.quota.hasCapacity(this.config.emailDailyLimit))) {
      throw new MailSendError('quota', 'Kunlik email limiti tugagan');
    }
  }

  /**
   * Bitta urinish (avtomatik retry YO'Q: takroriy xat xavfi). Muvaffaqiyatsizlikda MailSendError.
   * Kvota: yuborishdan oldin atomik rezerv; aniq rad etilsa qaytariladi, natija noaniq bo'lsa
   * (timeout/5xx) rezerv saqlanadi — xat ketgan bo'lishi mumkin.
   */
  async sendOtp(to: string, code: string, purpose: OtpPurpose, ttlMinutes: number, idempotencyKey?: string): Promise<void> {
    const mail = renderOtpMail(purpose, code, ttlMinutes);
    const limit = this.config.emailDailyLimit;

    let token: QuotaToken | null = null;
    if (this.provider.metered) {
      try {
        token = await this.quota.reserve(limit);
      } catch {
        throw new MailSendError('rejected', 'Kvota hisoblagichi ishlamadi');
      }
      if (!token) throw new MailSendError('quota', 'Kunlik email limiti tugagan');
    }

    try {
      await this.provider.send({ to, ...mail, idempotencyKey });
    } catch (e) {
      const err = e instanceof MailSendError ? e : new MailSendError('unknown', 'Yuborish natijasi noaniq');
      if (token) {
        try {
          if (err.kind === 'quota') await this.quota.exhaust(token, limit);
          else if (err.definite) await this.quota.release(token);
        } catch {
          // hisoblagichni tuzatib bo'lmadi: konservativ tomonga (band qoladi)
        }
      }
      throw err;
    }
  }
}

@Module({
  providers: [
    EmailQuota,
    MailService,
    // Eager: noto'g'ri/yetishmayotgan sozlama ilova ishga tushishida aniq xato beradi
    { provide: MAIL_PROVIDER, useFactory: (config: AppConfig) => createMailProvider(config), inject: [AppConfig] },
  ],
  exports: [MailService],
})
export class MailModule {}
