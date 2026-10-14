import type { CosmeticKind, CosmeticStatus, Rarity } from '@prisma/client';

/** Faol bezak ustuni turi bo'yicha (har turdan faqat bittasi). */
export const SLOT_BY_KIND = {
  FRAME: 'frameId',
  BANNER: 'bannerId',
  EFFECT: 'effectId',
  TITLE: 'titleId',
} as const satisfies Record<CosmeticKind, string>;

export type Slot = (typeof SLOT_BY_KIND)[CosmeticKind];

export const KINDS = Object.keys(SLOT_BY_KIND) as CosmeticKind[];
export const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export const BIO_MAX = 160;

/** Bezakni taqish mumkinmi: egalik shart; katalogdan o'chirilgan (DISABLED) bezak egasida qoladi va taqilishi mumkin. */
export function equipError(item: { kind: CosmeticKind; status: CosmeticStatus } | null, kind: CosmeticKind, owned: boolean): string | null {
  if (!item) return 'Bezak topilmadi';
  if (item.kind !== kind) return "Bezak turi mos kelmaydi";
  if (!owned) return "Bu bezak sizda yo'q";
  return null;
}

export const initials = (first: string, last: string, username: string): string => {
  const s = `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase();
  return s || (username[0] ?? '?').toUpperCase();
};

export interface ProfileSource {
  user: { username: string; firstName: string; lastName: string };
  profile: { bio: string; isPublic: boolean; showFullName: boolean; showAchievements: boolean; showStats: boolean } | null;
}

/**
 * Boshqa foydalanuvchiga ko'rinadigan profil. Faqat ruxsat etilgan maydonlar yig'iladi (allow-list):
 * email, tug'ilgan yil, IZL/XP balansi hech qachon bu yerga kirmaydi. Yopiq profil faqat username qaytaradi.
 */
export function publicProfileView(src: ProfileSource) {
  const p = src.profile;
  const base = { username: src.user.username };
  if (!p?.isPublic) return { ...base, isPrivate: true as const };
  return {
    ...base,
    isPrivate: false as const,
    displayName: p.showFullName ? `${src.user.firstName} ${src.user.lastName}` : null,
    initials: initials(src.user.firstName, src.user.lastName, src.user.username),
    bio: p.bio,
    showAchievements: p.showAchievements,
    showStats: p.showStats,
  };
}
