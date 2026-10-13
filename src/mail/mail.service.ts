import { Injectable, Logger, Module } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config';

export type OtpPurpose = 'register' | 'reset';

const COPY: Record<OtpPurpose, { subject: string; title: string; lead: string }> = {
  register: {
    subject: "Izlan: ro'yxatdan o'tish kodi",
    title: 'Emailni tasdiqlang',
    lead: "Ro'yxatdan o'tishni yakunlash uchun quyidagi kodni kiriting.",
  },
  reset: {
    subject: 'Izlan: parolni tiklash kodi',
    title: 'Parolni tiklash',
    lead: "Parolni qayta o'rnatish uchun quyidagi kodni kiriting.",
  },
};

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private transport?: Transporter;

  constructor(private readonly config: AppConfig) {}

  private getTransport(): Transporter {
    if (!this.transport) {
      const { host, port, secure, user, pass } = this.config.smtp;
      this.transport = createTransport({ host, port, secure, auth: { user, pass } });
    }
    return this.transport;
  }

  async sendOtp(to: string, code: string, purpose: OtpPurpose, ttlMinutes: number): Promise<void> {
    const c = COPY[purpose];
    if (this.config.mailDriver === 'console') {
      // Faqat DEV: kod emailga emas, shu yerga chiqadi.
      this.log.warn(`[DEV MAIL] ${to} | ${c.subject} | KOD: ${code}`);
      return;
    }
    const note = `Kod ${ttlMinutes} daqiqa amal qiladi. Agar bu so'rovni siz yubormagan bo'lsangiz, xatni e'tiborsiz qoldiring. Kodni hech kimga aytmang.`;
    const text = `${c.title}\n\n${c.lead}\n\nKod: ${code}\n\n${note}`;
    const html = `<!doctype html><html lang="uz"><body style="margin:0;background:#f1eee4;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0b0b0b">
<div style="max-width:480px;margin:0 auto;background:#fff;border:3px solid #0b0b0b;box-shadow:6px 6px 0 #0b0b0b;padding:28px">
<div style="font-weight:900;font-size:26px;letter-spacing:-1px">IZLAN</div>
<h1 style="font-size:22px;margin:20px 0 8px;text-transform:uppercase">${c.title}</h1>
<p style="margin:0 0 20px;line-height:1.5">${c.lead}</p>
<div style="background:#d6ff3d;border:3px solid #0b0b0b;text-align:center;font:700 34px 'Courier New',monospace;letter-spacing:10px;padding:16px">${code}</div>
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#444">${note}</p>
</div></body></html>`;
    await this.getTransport().sendMail({ from: this.config.mailFrom, to, subject: c.subject, text, html });
  }
}

@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
