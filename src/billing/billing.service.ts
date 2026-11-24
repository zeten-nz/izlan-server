import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_DAYS,
  BASE_STEP,
  REVIEW_REASON_UZ,
  SUFFIX_MAX,
  TOPUP_LATE_GRACE_MS,
  TOPUP_MAX,
  TOPUP_MIN,
  TOPUP_RESERVE_MINUTES,
  decideMatch,
  defaultCreditFor,
  extendAccess,
  hasActiveAccess,
  isPaidCourse,
  pickSuffix,
  validateTopupBase,
} from './billing.rules';

type Tx = Prisma.TransactionClient;

/** pg_advisory_xact_lock kaliti: to'ldirish so'rovlari va kirimlarni ketma-ket qayta ishlash */
const TOPUP_LOCK_KEY = 774_211_101;

const fail = (status: HttpStatus, code: string, message: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ code, message, ...extra }, status);

/**
 * Pul balansi (so'm), saytdan to'ldirish (noyob summa + karta) va kurs (yo'nalish) obunasi.
 *
 * Balans faqat MoneyLedger yozuvi bilan bir tranzaksiyada o'zgaradi (wallet qatori FOR UPDATE bilan qulflanadi).
 * Takrorlanish: TOPUP — kirim (BankIncome.id) bo'yicha, PURCHASE — (foydalanuvchi, idempotencyKey) bo'yicha.
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockWallet(tx: Tx, userId: string) {
    await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
    const [w] = await tx.$queryRaw<{ balanceUzs: number }[]>`SELECT "balanceUzs" FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    return w.balanceUzs;
  }

  private async write(tx: Tx, userId: string, e: { kind: 'TOPUP' | 'PURCHASE' | 'ADJUST'; amount: number; dedupeKey: string; directionId?: string; note?: string }) {
    const before = await this.lockWallet(tx, userId);
    const after = before + e.amount;
    if (after < 0) throw fail(HttpStatus.PAYMENT_REQUIRED, 'INSUFFICIENT_FUNDS', "Balansda mablag' yetarli emas", { balance: before, need: -e.amount });
    await tx.wallet.update({ where: { userId }, data: { balanceUzs: after } });
    await tx.moneyLedger.create({ data: { userId, kind: e.kind, amount: e.amount, balanceAfter: after, dedupeKey: e.dedupeKey, directionId: e.directionId, note: e.note } });
    return after;
  }

  // ───────────── O'quvchi: balans sahifasi ─────────────

  async wallet(userId: string) {
    const now = new Date();
    const [w, pending, history, access] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId }, select: { balanceUzs: true } }),
      this.prisma.topupRequest.findFirst({ where: { userId, status: 'PENDING', expiresAt: { gt: now } } }),
      this.prisma.moneyLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.courseAccess.findMany({ where: { userId }, include: { direction: { select: { title: true } } } }),
    ]);
    const dirIds = [...new Set(history.map((h) => h.directionId).filter((x): x is string => !!x))];
    const dirs = new Map((await this.prisma.direction.findMany({ where: { id: { in: dirIds } }, select: { id: true, title: true } })).map((d) => [d.id, d.title]));
    return {
      balanceUzs: w?.balanceUzs ?? 0,
      topup: { enabled: !!this.card, min: TOPUP_MIN, max: TOPUP_MAX, step: BASE_STEP, pending: pending ? this.topupView(pending, now) : null },
      history: history.map((h) => ({
        id: h.id,
        kind: h.kind,
        amount: h.amount,
        balanceAfter: h.balanceAfter,
        directionTitle: h.directionId ? (dirs.get(h.directionId) ?? null) : null,
        note: h.note,
        createdAt: h.createdAt,
      })),
      access: access.map((a) => ({ directionId: a.directionId, directionTitle: a.direction.title, endsAt: a.endsAt, active: hasActiveAccess(a.endsAt, now) })),
    };
  }

  // ───────────── Saytdan to'ldirish (noyob summa) ─────────────

  /** To'lov qabul qilinadigan karta (server .env). Sozlanmagan bo'lsa to'ldirish o'chiq. */
  get card(): { number: string; holder: string } | null {
    const number = (process.env.TOPUP_CARD_NUMBER ?? '').replace(/\s+/g, '');
    if (!/^\d{16}$/.test(number)) return null;
    return { number: number.replace(/(\d{4})(?=\d)/g, '$1 '), holder: (process.env.TOPUP_CARD_HOLDER ?? '').trim() };
  }

  private topupView(r: { id: string; baseAmount: number; amount: number; status: string; createdAt: Date; expiresAt: Date; closedAt: Date | null }, now = new Date()) {
    // Muddati o'tgan PENDING bazada keyinroq EXPIRED bo'ladi; foydalanuvchiga darhol shunday ko'rsatiladi
    const status = r.status === 'PENDING' && r.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : r.status;
    return { id: r.id, baseAmount: r.baseAmount, amount: r.amount, status, createdAt: r.createdAt, expiresAt: r.expiresAt, closedAt: r.closedAt, card: this.card };
  }

  /** Barcha so'rov/moslash amallari bitta advisory qulf ostida ketma-ket — summa ajratishda poyga yo'q. */
  private locked<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TOPUP_LOCK_KEY}::bigint)`;
        return fn(tx);
      },
      { timeout: 15_000, maxWait: 15_000 },
    );
  }

  private expireDue(tx: Tx, now: Date) {
    return tx.topupRequest.updateMany({ where: { status: 'PENDING', expiresAt: { lte: now } }, data: { status: 'EXPIRED', closedAt: now } });
  }

  /**
   * Noyob summa ajratadi: base + (1..99). Foydalanuvchida bitta faol so'rov: o'sha summani qayta so'rasa eskisi qaytadi,
   * boshqa summa so'rasa eskisi bekor qilinadi.
   */
  async requestTopup(userId: string, base: number) {
    if (!this.card) throw fail(HttpStatus.SERVICE_UNAVAILABLE, 'TOPUP_DISABLED', "To'ldirish vaqtincha ishlamayapti");
    const v = validateTopupBase(base);
    if (!v.ok) throw fail(HttpStatus.BAD_REQUEST, 'BAD_AMOUNT', `Summa ${TOPUP_MIN.toLocaleString('ru')}–${TOPUP_MAX.toLocaleString('ru')} so'm oralig'ida va 1 000 ga karrali bo'lsin`, { reason: v.reason });
    const now = new Date();
    return this.locked(async (tx) => {
      await this.expireDue(tx, now);
      const active = await tx.topupRequest.findFirst({ where: { userId, status: 'PENDING' } });
      if (active && active.baseAmount === base) return this.topupView(active, now);
      if (active) await tx.topupRequest.update({ where: { id: active.id }, data: { status: 'CANCELLED', closedAt: now } });

      const range = { gte: base + 1, lte: base + SUFFIX_MAX };
      const [busy, quarantined, last] = await Promise.all([
        tx.topupRequest.findMany({ where: { amount: range, status: 'PENDING' }, select: { suffix: true } }),
        tx.topupRequest.findMany({
          where: { amount: range, status: { in: ['EXPIRED', 'CANCELLED'] }, expiresAt: { gte: new Date(now.getTime() - TOPUP_LATE_GRACE_MS) } },
          select: { suffix: true },
        }),
        tx.topupRequest.findFirst({ orderBy: { createdAt: 'desc' }, select: { suffix: true } }),
      ]);
      const suffix = pickSuffix(last?.suffix ?? 0, new Set(busy.map((r) => r.suffix)), new Set(quarantined.map((r) => r.suffix)));
      if (suffix === null) throw fail(HttpStatus.SERVICE_UNAVAILABLE, 'ALL_BUSY', "Hozir navbat to'la — bir necha daqiqadan keyin urinib ko'ring yoki boshqa summa tanlang");
      const r = await tx.topupRequest.create({
        data: { userId, baseAmount: base, suffix, amount: base + suffix, createdAt: now, expiresAt: new Date(now.getTime() + TOPUP_RESERVE_MINUTES * 60_000) },
      });
      return this.topupView(r, now);
    });
  }

  async topupStatus(userId: string, id: string) {
    const [r, w] = await Promise.all([
      this.prisma.topupRequest.findFirst({ where: { id, userId } }),
      this.prisma.wallet.findUnique({ where: { userId }, select: { balanceUzs: true } }),
    ]);
    if (!r) throw new NotFoundException("So'rov topilmadi");
    return { ...this.topupView(r), balanceUzs: w?.balanceUzs ?? 0 };
  }

  async cancelTopup(userId: string, id: string) {
    const now = new Date();
    return this.locked(async (tx) => {
      const r = await tx.topupRequest.findFirst({ where: { id, userId } });
      if (!r) throw new NotFoundException("So'rov topilmadi");
      if (r.status !== 'PENDING') return this.topupView(r, now);
      return this.topupView(await tx.topupRequest.update({ where: { id }, data: { status: 'CANCELLED', closedAt: now } }), now);
    });
  }

  // ───────────── To'lov kuzatuvchisi uchun (ichki API) ─────────────

  /**
   * Kartaga tushgan pulni qayd etadi va mos so'rov bo'lsa balansni to'ldiradi.
   * externalId bo'yicha idempotent: bir bildirishnoma qayta yuborilsa DUPLICATE, ikkinchi marta yozilmaydi.
   */
  async recordIncome(input: { source: string; externalId: string; amount: number; hasFraction: boolean; receivedAt: Date; rawText?: string }) {
    const now = new Date();
    return this.locked(async (tx) => {
      const prior = await tx.bankIncome.findUnique({ where: { externalId: input.externalId } });
      if (prior) return { result: 'DUPLICATE' as const, incomeId: prior.id, status: prior.status };

      const lookback = new Date(input.receivedAt.getTime() - TOPUP_LATE_GRACE_MS - TOPUP_RESERVE_MINUTES * 60_000 - 86_400_000);
      const candidates = await tx.topupRequest.findMany({ where: { amount: input.amount, createdAt: { gte: lookback } } });
      const d = decideMatch(input, candidates);
      const data = { source: input.source, externalId: input.externalId, amount: input.amount, hasFraction: input.hasFraction, receivedAt: input.receivedAt, rawText: input.rawText?.slice(0, 4000) };

      if (d.type === 'REVIEW') {
        const inc = await tx.bankIncome.create({ data: { ...data, status: 'REVIEW', reason: d.reason } });
        return { result: 'REVIEW' as const, incomeId: inc.id, reason: d.reason, reasonText: REVIEW_REASON_UZ[d.reason] };
      }

      const upd = await tx.topupRequest.updateMany({ where: { id: d.requestId, status: { in: ['PENDING', 'EXPIRED'] } }, data: { status: 'PAID', closedAt: now } });
      if (upd.count !== 1) throw new Error(`topupRequest ${d.requestId}: kutilmagan holat`);
      const inc = await tx.bankIncome.create({
        data: { ...data, status: d.type === 'MATCH' ? 'MATCHED' : 'LATE_MATCHED', topupRequestId: d.requestId, creditedUserId: d.userId, creditedAmount: d.credit },
      });
      const balanceUzs = await this.write(tx, d.userId, { kind: 'TOPUP', amount: d.credit, dedupeKey: `income:${inc.id}`, note: `Karta: ${input.amount} so'm` });
      const user = await tx.user.findUniqueOrThrow({ where: { id: d.userId }, select: { username: true } });
      return { result: d.type, incomeId: inc.id, credited: d.credit, username: user.username, balanceUzs };
    });
  }

  /** Ko'rib chiqish kutayotgan kirimlar + har biriga o'xshash so'rovlar (bir xil asosiy summa) — admin maslahati. */
  async reviewIncomes(limit = 20) {
    const rows = await this.prisma.bankIncome.findMany({ where: { status: 'REVIEW' }, orderBy: { createdAt: 'asc' }, take: limit });
    return Promise.all(
      rows.map(async (r) => {
        const base = r.amount - (r.amount % BASE_STEP);
        const similar = await this.prisma.topupRequest.findMany({
          where: { amount: { gte: base, lte: base + BASE_STEP - 1 }, createdAt: { gte: new Date(r.receivedAt.getTime() - TOPUP_LATE_GRACE_MS) } },
          include: { user: { select: { username: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        return {
          id: r.id,
          amount: r.amount,
          receivedAt: r.receivedAt,
          reason: r.reason,
          reasonText: r.reason ? (REVIEW_REASON_UZ[r.reason as keyof typeof REVIEW_REASON_UZ] ?? r.reason) : null,
          suggestedCredit: defaultCreditFor(r.amount),
          similar: similar.map((s) => ({ username: s.user.username, amount: s.amount, status: s.status, createdAt: s.createdAt })),
        };
      }),
    );
  }

  /** Admin qo'lda biriktiradi (Izlan username bo'yicha). Summa berilmasa — asosiy summa (oxirgi 1..99 olib tashlanadi). */
  async assignIncome(incomeId: string, username: string, amount: number | undefined, by: string) {
    return this.locked(async (tx) => {
      const inc = await tx.bankIncome.findUnique({ where: { id: incomeId } });
      if (!inc) throw new NotFoundException('Kirim topilmadi');
      if (inc.status !== 'REVIEW') throw fail(HttpStatus.CONFLICT, 'NOT_IN_REVIEW', `Kirim holati: ${inc.status}`);
      const user = await tx.user.findFirst({ where: { username: { equals: username.replace(/^@/, ''), mode: 'insensitive' } }, select: { id: true, username: true } });
      if (!user) throw fail(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi');
      const credit = amount ?? defaultCreditFor(inc.amount);
      await tx.bankIncome.update({
        where: { id: incomeId },
        data: { status: 'ASSIGNED', creditedUserId: user.id, creditedAmount: credit, reason: `${inc.reason ?? ''} | ${by} → @${user.username}: ${credit}`.slice(0, 500) },
      });
      const balanceUzs = await this.write(tx, user.id, { kind: 'TOPUP', amount: credit, dedupeKey: `income:${inc.id}`, note: `Karta: ${inc.amount} so'm (qo'lda)` });
      return { incomeId, username: user.username, credited: credit, balanceUzs };
    });
  }

  async ignoreIncome(incomeId: string, by: string, note?: string) {
    const r = await this.prisma.bankIncome.updateMany({ where: { id: incomeId, status: 'REVIEW' }, data: { status: 'IGNORED', reason: `${by}: ${note ?? 'e’tiborsiz'}`.slice(0, 500) } });
    if (r.count !== 1) throw fail(HttpStatus.CONFLICT, 'NOT_IN_REVIEW', "Kirim topilmadi yoki ko'rib chiqishda emas");
    return { incomeId, status: 'IGNORED' as const };
  }

  // ───────────── Kurslar (yo'nalishlar) ─────────────

  /** Ommaviy narxlar ro'yxati (bosh sahifa). Faqat faol yo'nalishlar. */
  async publicPrices() {
    const dirs = await this.prisma.direction.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, kind: true, title: true, description: true, monthlyPriceUzs: true, levels: { select: { code: true }, orderBy: { ord: 'asc' } } },
    });
    return dirs.map((d) => ({
      id: d.id,
      slug: d.slug,
      kind: d.kind,
      title: d.title,
      description: d.description,
      monthlyPriceUzs: isPaidCourse(d.monthlyPriceUzs) ? d.monthlyPriceUzs : null,
      levels: d.levels.map((l) => l.code),
      accessDays: ACCESS_DAYS,
    }));
  }

  async courses(userId: string) {
    const now = new Date();
    const [list, access, w] = await Promise.all([
      this.publicPrices(),
      this.prisma.courseAccess.findMany({ where: { userId } }),
      this.prisma.wallet.findUnique({ where: { userId }, select: { balanceUzs: true } }),
    ]);
    const byDir = new Map(access.map((a) => [a.directionId, a.endsAt]));
    return {
      balanceUzs: w?.balanceUzs ?? 0,
      courses: list.map((c) => {
        const endsAt = byDir.get(c.id) ?? null;
        return { ...c, endsAt, active: hasActiveAccess(endsAt, now) };
      }),
    };
  }

  /**
   * Kursni 30 kunga sotib olish (yoki uzaytirish). Idempotent: bir xil kalit bilan qayta so'rov pulni ikkinchi marta yechmaydi.
   * `expectedPrice` — foydalanuvchi ko'rgan narx; server narxi o'zgargan bo'lsa PRICE_CHANGED (yechiladigan summa faqat serverdagi narx).
   */
  async buy(userId: string, directionId: string, idempotencyKey: string, expectedPrice?: number, attempt = 1): Promise<{ replay: boolean; balanceUzs: number; endsAt: Date | null }> {
    const dedupeKey = `buy:${userId}:${idempotencyKey}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.moneyLedger.findUnique({ where: { dedupeKey } });
        if (prior) {
          if (prior.directionId !== directionId) throw fail(HttpStatus.CONFLICT, 'KEY_REUSED', 'Bu kalit boshqa xarid uchun ishlatilgan');
          const acc = await tx.courseAccess.findUnique({ where: { userId_directionId: { userId, directionId } } });
          return { replay: true, balanceUzs: prior.balanceAfter, endsAt: acc?.endsAt ?? null };
        }
        const dir = await tx.direction.findUnique({ where: { id: directionId }, select: { id: true, title: true, active: true, monthlyPriceUzs: true } });
        if (!dir || !dir.active) throw new NotFoundException('Kurs topilmadi');
        const price = dir.monthlyPriceUzs ?? 0;
        if (!isPaidCourse(price)) throw fail(HttpStatus.CONFLICT, 'FREE_COURSE', "Bu kurs bepul — sotib olish shart emas");
        if (expectedPrice !== undefined && expectedPrice !== price) throw fail(HttpStatus.CONFLICT, 'PRICE_CHANGED', "Narx o'zgargan, qayta tasdiqlang", { price });

        const balanceUzs = await this.write(tx, userId, { kind: 'PURCHASE', amount: -price, dedupeKey, directionId, note: `${dir.title} — ${ACCESS_DAYS} kun` });
        const now = new Date();
        await tx.$queryRaw`SELECT id FROM "CourseAccess" WHERE "userId" = ${userId} AND "directionId" = ${directionId} FOR UPDATE`;
        const cur = await tx.courseAccess.findUnique({ where: { userId_directionId: { userId, directionId } } });
        const endsAt = extendAccess(cur?.endsAt, now);
        await tx.courseAccess.upsert({
          where: { userId_directionId: { userId, directionId } },
          create: { userId, directionId, endsAt },
          update: { endsAt },
        });
        return { replay: false, balanceUzs, endsAt };
      });
    } catch (e) {
      // Parallel ikki so'rov bir xil kalit bilan: ikkinchisi unique buzilishi — natijani qayta o'qib beramiz
      // Chegara: kutilmagan doimiy unique buzilishida cheksiz aylanib qolmasin
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 3) return this.buy(userId, directionId, idempotencyKey, expectedPrice, attempt + 1);
      throw e;
    }
  }
}

/** Kirish tekshiruvi (LearningService ham ishlatadi): yo'nalish bo'yicha faol obuna tugash sanalari. */
export async function activeAccessDirections(db: Pick<PrismaService, 'courseAccess'>, userId: string, now = new Date()): Promise<Set<string>> {
  const rows = await db.courseAccess.findMany({ where: { userId, endsAt: { gt: now } }, select: { directionId: true } });
  return new Set(rows.map((r) => r.directionId));
}
