import type { Rarity } from '@prisma/client';

/**
 * XP narx siyosati: tavsiya diapazonlari (qat'iy cheklov emas) va validatsiya. Yakuniy narxni ADMIN belgilaydi.
 * Narx hech qachon mijozdan olinmaydi; xarid faqat DB dagi `CosmeticItem.priceXp` bo'yicha.
 */
export const RECOMMENDED_PRICE_RANGE: Record<Rarity, { min: number; max: number }> = {
  COMMON: { min: 150, max: 300 },
  RARE: { min: 600, max: 1200 },
  EPIC: { min: 2000, max: 4000 },
  LEGENDARY: { min: 6000, max: 10000 },
};

export const MAX_PRICE_XP = 10_000_000;

export type PriceCheck =
  | { ok: false; error: string }
  | { ok: true; price: number | null; inRange: boolean; recommended: { min: number; max: number } };

/** `null` = narxni olib tashlash (belgilanmagan). Butun va musbat bo'lishi shart; diapazondan tashqari bo'lsa `inRange: false`. */
export function checkPrice(price: unknown, rarity: Rarity): PriceCheck {
  const recommended = RECOMMENDED_PRICE_RANGE[rarity];
  if (price === null) return { ok: true, price: null, inRange: true, recommended };
  if (typeof price !== 'number' || !Number.isInteger(price)) return { ok: false, error: 'Narx butun son bo‘lishi kerak' };
  if (price <= 0) return { ok: false, error: 'Narx noldan katta bo‘lishi kerak' };
  if (price > MAX_PRICE_XP) return { ok: false, error: 'Narx juda katta' };
  return { ok: true, price, inRange: price >= recommended.min && price <= recommended.max, recommended };
}
