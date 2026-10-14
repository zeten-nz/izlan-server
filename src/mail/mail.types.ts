export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Bir xil yuborishni provayder ikki marta bajarmasligi uchun (Resend: 24 soat). */
  idempotencyKey?: string;
};

/**
 * Yuborish muvaffaqiyatsizligining turi.
 * - quota: kunlik/oylik limit tugagan (xat ketmagan)
 * - rate_limited: provayder tezlik limiti (xat ketmagan)
 * - rejected: provayder so'rovni aniq rad etgan (xat ketmagan)
 * - config: API kalit/domen/from sozlamasi noto'g'ri (xat ketmagan)
 * - unknown: natija noaniq (timeout, tarmoq, 5xx) — xat ketgan bo'lishi MUMKIN
 */
export type MailFailure = 'quota' | 'rate_limited' | 'rejected' | 'config' | 'unknown';

export class MailSendError extends Error {
  constructor(
    readonly kind: MailFailure,
    message: string,
    readonly status?: number | null,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'MailSendError';
  }

  /** true: xat aniq ketmagan (qayta urinish xavfsiz). false: ketgan bo'lishi mumkin. */
  get definite(): boolean {
    return this.kind !== 'unknown';
  }
}

export interface MailProvider {
  /** true bo'lsa yuborishlar kunlik kvotaga (EmailQuota) hisoblanadi. */
  readonly metered: boolean;
  /** Muvaffaqiyatsizlikda har doim MailSendError tashlaydi. */
  send(msg: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
