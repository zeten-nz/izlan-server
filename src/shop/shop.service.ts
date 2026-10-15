import { HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dayKey, levelFor } from '../xp/xp.engine';
import { ACTIVE_XP_POLICY } from '../xp/xp.policy';
import { XpService } from '../xp/xp.service';

const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;

export interface PurchaseResult {
  purchaseId: string;
  itemId: string;
  pricePaid: number;
  balanceAfter: number;
  totalXpEarned: number;
  level: number;
  createdAt: Date;
  /** true: bu niyat avval bajarilgan; XP qayta yechilmadi */
  replay: boolean;
}

const conflict = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ statusCode: HttpStatus.CONFLICT, error: 'Conflict', code, message, ...extra }, HttpStatus.CONFLICT);

/**
 * XP do'koni. Narx, holat, egalik va balans HAMMASI tranzaksiya ichida serverdagi ma'lumotlardan tekshiriladi.
 * Mijoz faqat: bezak id, idempotency kaliti va (ixtiyoriy) ko'rgan narxi — narx hech qachon mijozdan olinmaydi.
 */
@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xp: XpService,
  ) {}

  async purchase(userId: string, itemId: string, input: { idempotencyKey: string; expectedPrice?: number }): Promise<PurchaseResult> {
    if (!KEY_RE.test(input.idempotencyKey)) throw new UnprocessableEntityException("Idempotency kaliti noto'g'ri");

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Foydalanuvchi bo'yicha ketma-ketlashtirish: parallel xaridlar balansni manfiyga tushira olmaydi
          await this.xp.lockUser(tx, userId);

          // Replay: shu niyat kaliti oldin ishlatilgan
          const prev = await tx.xpPurchase.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
          if (prev) {
            if (prev.itemId !== itemId) throw conflict('KEY_REUSED', "Bu kalit boshqa xarid uchun ishlatilgan");
            return this.replayOf(tx, prev);
          }

          const item = await tx.cosmeticItem.findUnique({ where: { id: itemId } });
          if (!item) throw new NotFoundException('Bezak topilmadi');
          if (item.status !== 'ACTIVE') throw conflict('NOT_AVAILABLE', 'Bu bezak hozir sotuvda emas');
          if (item.priceXp === null) throw conflict('NO_PRICE', 'Bu bezak uchun narx belgilanmagan');
          const price = item.priceXp;

          const owned = await tx.cosmeticOwnership.findUnique({ where: { userId_itemId: { userId, itemId } } });
          if (owned) throw conflict('ALREADY_OWNED', 'Bu bezak sizda allaqachon bor');

          // Mijoz ko'rgan narx server narxidan farq qilsa: eski narxda yechilmaydi, yangi narx bilan qayta tasdiq so'raladi
          if (input.expectedPrice !== undefined && input.expectedPrice !== price) {
            throw conflict('PRICE_CHANGED', 'Narx o‘zgargan. Yangi narxni tasdiqlang', { price });
          }

          const w = await tx.wallet.findUnique({ where: { userId } });
          const balance = w?.xpBalance ?? 0;
          const total = w?.totalXpEarned ?? 0;
          if (balance < price) throw conflict('INSUFFICIENT_XP', 'XP yetarli emas', { balance, price });

          const newBalance = balance - price;
          const now = new Date();

          // Atomik shartli yechish: qator qulflangan, lekin SQL darajasida ham xpBalance >= price kafolatlanadi
          const res = await tx.wallet.updateMany({
            where: { userId, xpBalance: { gte: price } },
            data: { xpBalance: { decrement: price } },
          });
          if (res.count !== 1) throw conflict('INSUFFICIENT_XP', 'XP yetarli emas', { balance, price });

          const ledger = await tx.xpLedger.create({
            data: {
              userId,
              kind: 'SPEND',
              eventType: 'PURCHASE',
              sourceId: itemId,
              cosmeticItemId: itemId,
              pricePaid: price,
              baseXp: 0,
              multiplierBp: 0,
              grantedXp: -price,
              dedupeKey: `purchase:${userId}:${itemId}`,
              policyVersion: ACTIVE_XP_POLICY.version,
              dayKey: dayKey(now),
              balanceAfter: newBalance,
              totalAfter: total,
              meta: { label: `Xarid: ${item.name}`, slug: item.slug, rarity: item.rarity, kind: item.kind },
            },
          });
          await tx.cosmeticOwnership.create({ data: { userId, itemId, source: 'PURCHASE' } });
          const purchase = await tx.xpPurchase.create({
            data: { userId, itemId, idempotencyKey: input.idempotencyKey, pricePaid: price, ledgerId: ledger.id },
          });

          return {
            purchaseId: purchase.id,
            itemId,
            pricePaid: price,
            balanceAfter: newBalance,
            totalXpEarned: total,
            level: levelFor(total).level,
            createdAt: purchase.createdAt,
            replay: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (e) {
      // Poyga zaxira himoyasi: unique cheklov (ownership/purchase) buzilsa — aniq xabar
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('ALREADY_OWNED', 'Bu bezak sizda allaqachon bor');
      }
      throw e;
    }
  }

  private async replayOf(tx: Prisma.TransactionClient, p: { id: string; itemId: string; pricePaid: number; ledgerId: string; createdAt: Date }): Promise<PurchaseResult> {
    const ledger = await tx.xpLedger.findUniqueOrThrow({ where: { id: p.ledgerId } });
    return {
      purchaseId: p.id,
      itemId: p.itemId,
      pricePaid: p.pricePaid,
      balanceAfter: ledger.balanceAfter,
      totalXpEarned: ledger.totalAfter,
      level: levelFor(ledger.totalAfter).level,
      createdAt: p.createdAt,
      replay: true,
    };
  }

  /** Shaxsiy xarid tarixi (faqat o'ziniki). Narx — xarid paytidagi snapshot. */
  async history(userId: string, page: number, limit: number) {
    const [rows, total] = await Promise.all([
      this.prisma.xpPurchase.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { item: { select: { id: true, slug: true, kind: true, rarity: true, name: true, description: true, preview: true } } },
      }),
      this.prisma.xpPurchase.count({ where: { userId } }),
    ]);
    return {
      page,
      limit,
      total,
      items: rows.map((r) => ({
        id: r.id,
        status: 'COMPLETED' as const,
        pricePaid: r.pricePaid,
        createdAt: r.createdAt,
        item: r.item,
      })),
    };
  }
}
