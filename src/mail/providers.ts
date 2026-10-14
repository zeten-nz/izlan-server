import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { Resend } from 'resend';
import type { AppConfig } from '../config/app-config';
import { MailSendError, type MailMessage, type MailProvider } from './mail.types';

/** Faqat DEV: xat yuborilmaydi, matn (kod bilan) server konsoliga chiqadi. */
export class ConsoleMailProvider implements MailProvider {
  readonly metered = false;
  private readonly log = new Logger('MailConsole');

  async send(msg: MailMessage): Promise<void> {
    this.log.warn(`[DEV MAIL] ${msg.to} | ${msg.subject}\n${msg.text}`);
  }
}

export class SmtpMailProvider implements MailProvider {
  readonly metered = false;
  private readonly transport;

  constructor(
    private readonly from: string,
    smtp: { host: string; port: number; secure: boolean; user: string; pass: string },
  ) {
    this.transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }

  async send(msg: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    } catch (e) {
      const err = e as { code?: string; responseCode?: number };
      const status = typeof err.responseCode === 'number' ? err.responseCode : null;
      if (err.code === 'EAUTH') throw new MailSendError('config', 'SMTP autentifikatsiya xatosi', status, err.code);
      if ((status !== null && status >= 500) || err.code === 'EENVELOPE') {
        throw new MailSendError('rejected', 'SMTP so\'rovni rad etdi', status, err.code);
      }
      throw new MailSendError('unknown', 'SMTP natijasi noaniq', status, err.code);
    }
  }
}

/** Resend HTTP API (rasmiy SDK). SDK xatoni tashlamaydi, `{data, error}` qaytaradi. */
export class ResendMailProvider implements MailProvider {
  readonly metered = true;
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
    private readonly timeoutMs: number,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(msg: MailMessage): Promise<void> {
    let res;
    try {
      res = await this.client.emails.send(
        { from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text },
        // signal SDK orqali fetch'ga uzatiladi; timeout → natija noaniq (xat ketgan bo'lishi mumkin)
        { idempotencyKey: msg.idempotencyKey, signal: AbortSignal.timeout(this.timeoutMs) } as { idempotencyKey?: string },
      );
    } catch {
      throw new MailSendError('unknown', 'Resend so\'rovi bajarilmadi');
    }
    if (!res.error) return;
    throw classifyResendError(res.error);
  }
}

/** Resend xato javobini aniq-rad / noaniq turlarga ajratadi. Xabar/kalit loglanmaydi. */
export function classifyResendError(error: { name?: string; statusCode?: number | null; message?: string }): MailSendError {
  const status = error.statusCode ?? null;
  const code = error.name;
  const msg = `Resend: ${code ?? 'noma\'lum'}`;
  if (code === 'daily_quota_exceeded' || code === 'monthly_quota_exceeded') {
    return new MailSendError('quota', msg, status, code);
  }
  if (code === 'rate_limit_exceeded' || status === 429) return new MailSendError('rate_limited', msg, status, code);
  if (status === 401 || status === 403 || code === 'missing_api_key' || code === 'invalid_api_key' || code === 'restricted_api_key') {
    return new MailSendError('config', msg, status, code);
  }
  if (code === 'concurrent_idempotent_requests') return new MailSendError('unknown', msg, status, code);
  if (status !== null && status >= 400 && status < 500) return new MailSendError('rejected', msg, status, code);
  // 5xx, tarmoq xatosi (statusCode null), application_error: xat ketgan-ketmaganini bilmaymiz
  return new MailSendError('unknown', msg, status, code);
}

export function createMailProvider(config: AppConfig): MailProvider {
  switch (config.mailDriver) {
    case 'console':
      return new ConsoleMailProvider();
    case 'smtp':
      return new SmtpMailProvider(config.mailFrom, config.smtp);
    case 'resend':
      return new ResendMailProvider(config.resendApiKey, config.mailFrom, config.mailTimeoutMs);
  }
}
