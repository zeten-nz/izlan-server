import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, sniff } from './media';
import type { AssetFact, FileFact } from './media-check';

@Injectable()
export class AssetsService {
  private readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    cfg: ConfigService,
  ) {
    this.dir = path.resolve(cfg.get<string>('UPLOAD_DIR') || './uploads');
  }

  async save(ownerId: string, originalName: string, data: Buffer) {
    const s = sniff(data);
    if (!s) throw new BadRequestException("Fayl turi qo'llab-quvvatlanmaydi (PNG, JPG, WEBP, GIF, MP3, M4A, OGG, WAV)");
    const limit = s.kind === 'IMAGE' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (data.length > limit) throw new PayloadTooLargeException(`Fayl juda katta (${s.kind === 'IMAGE' ? '5' : '15'} MB gacha)`);
    const row = await this.prisma.asset.create({
      data: { ownerId, kind: s.kind, mime: s.mime, size: data.length, originalName: originalName.slice(0, 200) },
    });
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, row.id), data);
    return { id: row.id, kind: row.kind, mime: row.mime, size: row.size, name: row.originalName };
  }

  /**
   * Nashr oldidan: berilgan assetlarning DB va diskdagi holati. Bitta DB so'rovi (id in) va har bir
   * unikal fayl uchun bitta `stat` — N+1 yo'q, fayl mazmuni o'qilmaydi.
   */
  async inspect(ids: string[]): Promise<{ assets: Map<string, AssetFact>; files: Map<string, FileFact> }> {
    const unique = [...new Set(ids)];
    const assets = new Map<string, AssetFact>();
    const files = new Map<string, FileFact>();
    if (unique.length === 0) return { assets, files };
    const rows = await this.prisma.asset.findMany({ where: { id: { in: unique } }, select: { id: true, kind: true, size: true } });
    for (const r of rows) assets.set(r.id, { kind: r.kind, size: r.size });
    await Promise.all(
      rows.map(async (r) => {
        try {
          const s = await stat(path.join(this.dir, r.id));
          files.set(r.id, { exists: s.isFile(), size: s.size });
        } catch {
          files.set(r.id, { exists: false, size: null });
        }
      }),
    );
    return { assets, files };
  }

  async read(id: string) {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Fayl topilmadi');
    try {
      return { row, data: await readFile(path.join(this.dir, row.id)) };
    } catch {
      throw new NotFoundException('Fayl topilmadi');
    }
  }
}
