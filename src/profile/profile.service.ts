import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CosmeticKind, Prisma, Rarity } from '@prisma/client';
import type { PublicUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogQueryDto, EquipDto, UpdateProfileDto } from './dto';
import { levelFor } from '../xp/xp.engine';
import { SLOT_BY_KIND, equipError, initials, publicProfileView } from './profile.rules';

/** IZL mukofotlari: faqat rejalashtirilgan yo'nalishlar. Narx, mavjudlik va yetkazib berish va'dasi YO'Q. */
const IZL_PLANNED = [
  { category: 'GAME_CURRENCY', title: "O'yin valyutalari", note: 'Masalan, PUBG Mobile UC, Mobile Legends Diamonds' },
  { category: 'SUBSCRIPTION_DISCOUNT', title: 'Obuna chegirmalari', note: 'Izlan tariflariga chegirmalar' },
  { category: 'GIFT_CARD', title: "Sovg'a kartalari", note: "Hamkor sovg'a kartalari" },
  { category: 'SPECIAL_OFFER', title: 'Maxsus takliflar', note: 'Hamkorlarning maxsus takliflari' },
].map((x) => ({ ...x, status: 'PLANNED' as const }));

const itemView = (i: {
  id: string;
  slug: string;
  kind: CosmeticKind;
  rarity: Rarity;
  name: string;
  description: string;
  priceXp: number | null;
  preview: Prisma.JsonValue;
  season: string | null;
}) => ({
  id: i.id,
  slug: i.slug,
  kind: i.kind,
  rarity: i.rarity,
  name: i.name,
  description: i.description,
  priceXp: i.priceXp,
  preview: i.preview,
  season: i.season,
});

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // ───── Profil ─────

  /** Balans qatori bo'lmasa 0 (o'qishda yozuv yaratilmaydi). */
  private async wallet(userId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { userId } });
    return { xpBalance: w?.xpBalance ?? 0, totalXpEarned: w?.totalXpEarned ?? 0, izlBalance: w?.izlBalance ?? 0 };
  }

  private async equippedViews(userId: string) {
    const eq = await this.prisma.equippedCosmetics.findUnique({ where: { userId } });
    const ids = eq ? [eq.frameId, eq.bannerId, eq.effectId, eq.titleId].filter((x): x is string => !!x) : [];
    const items = ids.length ? await this.prisma.cosmeticItem.findMany({ where: { id: { in: ids } } }) : [];
    const by = new Map(items.map((i) => [i.id, itemView(i)]));
    const pick = (id: string | null | undefined) => (id ? (by.get(id) ?? null) : null);
    return { frame: pick(eq?.frameId), banner: pick(eq?.bannerId), effect: pick(eq?.effectId), title: pick(eq?.titleId) };
  }

  private async stats(userId: string) {
    const [completed, directions, recent] = await Promise.all([
      this.prisma.lessonProgress.count({ where: { userId, completedAt: { not: null } } }),
      this.prisma.userDirection.findMany({ where: { userId }, include: { direction: { select: { title: true } } } }),
      this.prisma.lessonProgress.findMany({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { completedAt: true, version: { select: { lesson: { select: { title: true } } } } },
      }),
    ]);
    return {
      completedLessons: completed,
      directions: directions.map((d) => d.direction.title),
      recent: recent.map((r) => ({ title: r.version.lesson.title, completedAt: r.completedAt })),
      /** Streak uchun ma'lumot manbai hali yo'q: hisoblanmaydi */
      streak: null,
    };
  }

  async me(user: PublicUser) {
    const [profile, wallet, equipped, stats, achievements] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId: user.id } }),
      this.wallet(user.id),
      this.equippedViews(user.id),
      this.stats(user.id),
      this.prisma.userAchievement.findMany({ where: { userId: user.id }, include: { achievement: true } }),
    ]);
    return {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      initials: initials(user.firstName, user.lastName, user.username),
      bio: profile?.bio ?? '',
      privacy: {
        isPublic: profile?.isPublic ?? false,
        showFullName: profile?.showFullName ?? false,
        showAchievements: profile?.showAchievements ?? false,
        showStats: profile?.showStats ?? false,
      },
      wallet,
      /** Daraja jami XP (kamaymaydi) bo'yicha; XP tarixi: GET /api/xp/history */
      xp: { level: levelFor(wallet.totalXpEarned) },
      equipped,
      stats,
      achievements: achievements
        .slice()
        .sort((a, b) => (a.showcaseOrder ?? 99) - (b.showcaseOrder ?? 99) || a.earnedAt.getTime() - b.earnedAt.getTime())
        .map((a) => ({
          slug: a.achievement.slug,
          name: a.achievement.name,
          description: a.achievement.description,
          earnedAt: a.earnedAt,
          showcaseOrder: a.showcaseOrder,
        })),
    };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const data = {
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      ...(dto.showFullName !== undefined && { showFullName: dto.showFullName }),
      ...(dto.showAchievements !== undefined && { showAchievements: dto.showAchievements }),
      ...(dto.showStats !== undefined && { showStats: dto.showStats }),
    };
    await this.prisma.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return { ok: true };
  }

  /** Ommaviy profil: faqat allow-list maydonlari; yopiq profil yashirin ma'lumot bermaydi. */
  async publicByUsername(viewer: PublicUser, username: string) {
    let user = await this.prisma.user.findUnique({ where: { username }, include: { profile: true } });
    let redirectedFrom: string | undefined;
    if (!user) {
      const alias = await this.prisma.usernameAlias.findUnique({ where: { oldUsername: username } });
      if (alias) {
        user = await this.prisma.user.findUnique({ where: { id: alias.userId }, include: { profile: true } });
        redirectedFrom = username;
      }
    }
    if (!user || user.role !== 'STUDENT') throw new NotFoundException('Profil topilmadi');
    const isOwner = viewer.id === user.id;
    const base = publicProfileView({ user, profile: user.profile });
    if (base.isPrivate) return { ...base, isOwner, redirectedFrom };

    const [equipped, stats, achievements] = await Promise.all([
      this.equippedViews(user.id),
      base.showStats ? this.stats(user.id) : null,
      base.showAchievements ? this.prisma.userAchievement.findMany({ where: { userId: user.id }, include: { achievement: true } }) : null,
    ]);
    return {
      ...base,
      username: user.username,
      isOwner,
      redirectedFrom,
      equipped,
      stats: stats && { completedLessons: stats.completedLessons, directions: stats.directions, streak: stats.streak },
      /** Progress ma'lumoti: faqat o'quv statistikasini ko'rsatishga ruxsat bo'lsa (balans hech qachon) */
      level: base.showStats ? await this.publicLevel(user.id) : null,
      // Faqat showAchievements ruxsat berganda; asosiy (showcase) badge'lar birinchi, so'ng qolganlari
      achievements:
        achievements
          ?.slice()
          .sort((a, b) => (a.showcaseOrder ?? 99) - (b.showcaseOrder ?? 99) || a.earnedAt.getTime() - b.earnedAt.getTime())
          .map((a) => ({ slug: a.achievement.slug, name: a.achievement.name, earnedAt: a.earnedAt, showcase: a.showcaseOrder !== null })) ?? null,
    };
  }

  private async publicLevel(userId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { userId }, select: { totalXpEarned: true } });
    const l = levelFor(w?.totalXpEarned ?? 0);
    return { level: l.level, title: l.title };
  }

  // ───── Mukofotlar ─────

  async catalog(userId: string, q: CatalogQueryDto) {
    const [items, owned] = await Promise.all([
      this.prisma.cosmeticItem.findMany({
        where: { status: 'ACTIVE', ...(q.kind && { kind: q.kind as CosmeticKind }), ...(q.rarity && { rarity: q.rarity as Rarity }) },
        orderBy: [{ rarity: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.cosmeticOwnership.findMany({ where: { userId }, select: { itemId: true } }),
    ]);
    const own = new Set(owned.map((o) => o.itemId));
    return {
      /** Xarid hozircha yoqilmagan */
      purchasesEnabled: true,
      /** priceXp: serverdagi joriy narx; status: OWNED | AVAILABLE | NO_PRICE */
      items: items.map((i) => ({
        ...itemView(i),
        owned: own.has(i.id),
        status: own.has(i.id) ? 'OWNED' : i.priceXp === null ? 'NO_PRICE' : 'AVAILABLE',
      })),
    };
  }

  izlCatalog() {
    return { redeemEnabled: false, items: IZL_PLANNED };
  }

  // ───── Kolleksiya ─────

  async collection(userId: string) {
    const [owned, equipped] = await Promise.all([
      this.prisma.cosmeticOwnership.findMany({ where: { userId }, include: { item: true }, orderBy: { acquiredAt: 'desc' } }),
      this.equippedViews(userId),
    ]);
    return { items: owned.map((o) => ({ ...itemView(o.item), source: o.source, acquiredAt: o.acquiredAt })), equipped };
  }

  async equip(userId: string, dto: EquipDto) {
    const kind = dto.kind as CosmeticKind;
    const slot = SLOT_BY_KIND[kind];
    if (dto.itemId === null) {
      await this.prisma.equippedCosmetics.upsert({ where: { userId }, create: { userId, [slot]: null }, update: { [slot]: null } });
      return this.collection(userId);
    }
    const [item, own] = await Promise.all([
      this.prisma.cosmeticItem.findUnique({ where: { id: dto.itemId } }),
      this.prisma.cosmeticOwnership.findUnique({ where: { userId_itemId: { userId, itemId: dto.itemId } } }),
    ]);
    const err = equipError(item, kind, !!own);
    if (err) throw item ? new UnprocessableEntityException(err) : new NotFoundException(err);
    await this.prisma.equippedCosmetics.upsert({ where: { userId }, create: { userId, [slot]: dto.itemId }, update: { [slot]: dto.itemId } });
    return this.collection(userId);
  }
}
