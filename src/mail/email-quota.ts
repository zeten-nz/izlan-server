import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type QuotaToken = { day: string };

/** Kun chegarasi UTC: Resend kunlik limitini ham UTC bo'yicha hisoblaymiz (zaxira uchun limit 100 dan past). */
export const quotaDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * PostgreSQL asosidagi kunlik email hisoblagichi. Rezerv bitta atomik INSERT..ON CONFLICT..WHERE:
 * parallel so'rovlar, restart va bir nechta instance'da limitdan oshmaydi.
 */
@Injectable()
export class EmailQuota {
  constructor(private readonly prisma: PrismaService) {}

  /** Joy bo'lsa 1 ta rezerv qiladi va token qaytaradi; bo'lmasa null. */
  async reserve(limit: number): Promise<QuotaToken | null> {
    const day = quotaDay();
    const affected = await this.prisma.$executeRaw`
      INSERT INTO "EmailQuota" ("day", "used", "updatedAt") VALUES (${day}, 1, now())
      ON CONFLICT ("day") DO UPDATE SET "used" = "EmailQuota"."used" + 1, "updatedAt" = now()
      WHERE "EmailQuota"."used" < ${limit}`;
    if (affected !== 1) return null;
    // Eski kunlarni arzon tozalash (jadval kichik, xato bo'lsa e'tiborsiz)
    void this.prisma.emailQuota.deleteMany({ where: { day: { lt: quotaDay(new Date(Date.now() - 7 * 86_400_000)) } } }).catch(() => undefined);
    return { day };
  }

  /** Xat aniq ketmagan: rezervni qaytaradi. */
  async release(t: QuotaToken): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "EmailQuota" SET "used" = GREATEST("used" - 1, 0), "updatedAt" = now() WHERE "day" = ${t.day}`;
  }

  /** Provayder o'zi kvota tugaganini aytdi: bugun uchun hisoblagichni limitga ko'taradi. */
  async exhaust(t: QuotaToken, limit: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "EmailQuota" SET "used" = GREATEST("used", ${limit}), "updatedAt" = now() WHERE "day" = ${t.day}`;
  }

  /** Rezerv qilmasdan: bugun joy bormi. */
  async hasCapacity(limit: number): Promise<boolean> {
    const row = await this.prisma.emailQuota.findUnique({ where: { day: quotaDay() } });
    return (row?.used ?? 0) < limit;
  }
}
