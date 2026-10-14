import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type CosmeticKind, type CosmeticStatus, type Rarity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { designMatchesKind } from '../profile/cosmetic-registry';
import type { CosmeticDto, UpdateCosmeticDto } from '../profile/dto';

/**
 * Bezaklar katalogi (admin). O'chirish YO'Q: katalogdan olib tashlash = DISABLED (egalik saqlanadi).
 * Har o'zgarish AuditLog'ga shu tranzaksiyada yoziladi.
 */
@Injectable()
export class CosmeticsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.cosmeticItem.findMany({ orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }] });
  }

  async create(actorId: string, dto: CosmeticDto) {
    if (dto.previewKey && !designMatchesKind(dto.previewKey, dto.kind as CosmeticKind)) {
      throw new UnprocessableEntityException("Dizayn bezak turiga mos emas");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.cosmeticItem.create({
          data: {
            slug: dto.slug,
            kind: dto.kind as CosmeticKind,
            rarity: dto.rarity as Rarity,
            name: dto.name,
            description: dto.description ?? '',
            priceXp: dto.priceXp ?? null,
            season: dto.season ?? null,
            preview: dto.previewKey ? { key: dto.previewKey } : {},
            status: 'DRAFT',
          },
        });
        await tx.auditLog.create({ data: { actorId, action: 'cosmetic.create', entity: 'CosmeticItem', entityId: item.id, meta: { slug: item.slug, kind: item.kind } } });
        return item;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Bu slug band');
      throw e;
    }
  }

  async update(actorId: string, id: string, dto: UpdateCosmeticDto) {
    const cur = await this.prisma.cosmeticItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Bezak topilmadi');
    if (dto.previewKey && !designMatchesKind(dto.previewKey, cur.kind)) {
      throw new UnprocessableEntityException("Dizayn bezak turiga mos emas");
    }
    const preview = dto.previewKey ? { key: dto.previewKey } : (cur.preview as Prisma.JsonObject);
    const nextStatus = (dto.status as CosmeticStatus | undefined) ?? cur.status;
    const key = (preview as { key?: string }).key;
    if (nextStatus === 'ACTIVE' && !(key && designMatchesKind(key, cur.kind))) {
      throw new UnprocessableEntityException("Faollashtirish uchun preview kaliti kerak");
    }
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.cosmeticItem.update({
        where: { id },
        data: {
          ...(dto.rarity && { rarity: dto.rarity as Rarity }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.priceXp !== undefined && { priceXp: dto.priceXp }),
          ...(dto.season !== undefined && { season: dto.season }),
          ...(dto.previewKey && { preview }),
          ...(dto.status && { status: nextStatus }),
        },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'cosmetic.update', entity: 'CosmeticItem', entityId: id, meta: { fields: Object.keys(dto), from: cur.status, to: item.status } },
      });
      return item;
    });
  }
}
