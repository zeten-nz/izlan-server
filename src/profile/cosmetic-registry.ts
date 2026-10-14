import type { CosmeticKind } from '@prisma/client';

/**
 * Tasdiqlangan dizayn kalitlari. Klient (client/src/features/profile/designs.tsx) shu kalitlar bo'yicha o'z vizualini chizadi;
 * admin ixtiyoriy HTML/SVG/CSS yubora olmaydi: faqat shu ro'yxatdan tanlaydi. Ikkala ro'yxat bir xil bo'lishi shart.
 */
export const COSMETIC_DESIGNS = {
  'ramka-minimal': 'FRAME',
  'ramka-neon': 'FRAME',
  'ramka-koinot': 'FRAME',
  'ramka-oltin-meros': 'FRAME',
  'banner-izlanuvchi': 'BANNER',
  'banner-bilim-tolqini': 'BANNER',
  'banner-ilm-galaktikasi': 'BANNER',
  'banner-afsonaviy-tafakkur': 'BANNER',
  'unvon-yangi-izlanuvchi': 'TITLE',
  'unvon-bilimdon': 'TITLE',
  'unvon-ilm-kashfiyotchisi': 'TITLE',
  'unvon-bilim-afsonasi': 'TITLE',
} as const satisfies Record<string, CosmeticKind>;

export type DesignKey = keyof typeof COSMETIC_DESIGNS;
export const DESIGN_KEYS = Object.keys(COSMETIC_DESIGNS) as DesignKey[];

/** Kalit ro'yxatda bormi va bezak turiga mosmi. */
export const designMatchesKind = (key: string, kind: CosmeticKind): boolean =>
  Object.prototype.hasOwnProperty.call(COSMETIC_DESIGNS, key) && COSMETIC_DESIGNS[key as DesignKey] === kind;
