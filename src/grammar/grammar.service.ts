import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GRAMMAR_REGISTRY_DATA } from './grammar-registry.data';
import { computeVersion, loadRegistry, type GrammarRegistry, type GrammarRegistryData, type RegistryLoad } from './registry';

/** BITTA manba: GRAMMAR_SOURCE=static (build'dagi reyestr) | release (PostgreSQL aktiv release + kill-switch overlay). Ikkalasi aralashtirilmaydi. */
export const grammarSource = (): 'static' | 'release' => (process.env.GRAMMAR_SOURCE === 'release' ? 'release' : 'static');

const RELEASE_CACHE_MS = 5_000;

/**
 * Grammatika reyestrini beradi. Yaroqsiz bo'lsa (xesh/sxema/aktiv release yo'q) ishlatilmaydi:
 * grammatika havolali darslarni nashr qilish rad etiladi, mavjud darslar havolasiz (fallback) ko'rinadi.
 */
@Injectable()
export class GrammarService {
  private readonly log = new Logger(GrammarService.name);
  private readonly staticLoaded: RegistryLoad | null;
  private cache: { key: string; at: number; load: RegistryLoad } | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.staticLoaded = grammarSource() === 'static' ? loadRegistry(GRAMMAR_REGISTRY_DATA) : null;
    if (this.staticLoaded && !this.staticLoaded.ok) this.log.error(`Grammatika reyestri yaroqsiz: ${this.staticLoaded.reason}`);
  }

  get source() {
    return grammarSource();
  }

  /** Yaroqli reyestr yoki null (o'quvchi ko'rinishi: fallback). Release rejimida xato bo'lsa ham null (fail-closed). */
  async getRegistry(): Promise<GrammarRegistry | null> {
    const l = await this.load();
    return l.ok ? l.registry : null;
  }

  async reason(): Promise<string | null> {
    const l = await this.load();
    return l.ok ? null : l.reason;
  }

  /** Yaroqli reyestr yoki istisno (nashr tekshiruvi uchun). */
  async require(): Promise<GrammarRegistry> {
    const l = await this.load();
    if (!l.ok) throw new ServiceUnavailableException("Grammatika reyestri yaroqsiz: grammatika havolalarini hozir nashr qilib bo'lmaydi");
    return l.registry;
  }

  private async load(): Promise<RegistryLoad> {
    if (this.staticLoaded) return this.staticLoaded;
    try {
      const act = await this.prisma.grammarActivation.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true, releaseId: true } });
      if (!act) return { ok: false, reason: 'aktiv release yo‘q' };
      const ov = await this.prisma.grammarOverlayEvent.aggregate({ _max: { seq: true } });
      const key = `${act.releaseId}:${ov._max.seq ?? 0}`;
      if (this.cache && this.cache.key === key && Date.now() - this.cache.at < RELEASE_CACHE_MS) return this.cache.load;
      const load = await this.buildFromRelease(act.releaseId);
      this.cache = { key, at: Date.now(), load };
      return load;
    } catch (e) {
      this.log.error(`Release reyestri yuklanmadi: ${(e as Error).message}`);
      return { ok: false, reason: 'ma’lumotlar bazasi xatosi' };
    }
  }

  private async buildFromRelease(releaseId: string): Promise<RegistryLoad> {
    const rel = await this.prisma.grammarRelease.findUnique({ where: { id: releaseId } });
    if (!rel) return { ok: false, reason: 'aktiv release topilmadi' };
    const frozen = rel.languages as unknown as {
      languages: { code: string; name: string }[];
      retired: { id: string; replacedBy: string | null }[];
    };
    const items = await this.prisma.grammarReleaseItem.findMany({ where: { releaseId }, include: { revision: { select: { content: true } } }, orderBy: { ruleId: 'asc' } });
    const hiddenRows = await this.prisma.$queryRaw<{ ruleId: string }[]>`
      SELECT "ruleId" FROM (SELECT DISTINCT ON ("ruleId") "ruleId", action FROM "GrammarOverlayEvent" ORDER BY "ruleId", seq DESC) t WHERE action = 'HIDE'`;
    const hidden = new Set(hiddenRows.map((r) => r.ruleId));

    const rules: GrammarRegistryData['rules'] = [];
    const seen = new Set<string>();
    for (const it of items) {
      if (hidden.has(it.ruleId) || seen.has(it.ruleId)) continue;
      const m = it.meta as { lang: string; slug: string; category: string; level: { system: 'cefr' | 'jlpt'; value: string; confirmed?: boolean } | null };
      // sarlavha: 'uz' bo'lsa shu, aks holda birinchisi
      const sibling = items.find((x) => x.ruleId === it.ruleId && x.explanationLang === 'uz') ?? it;
      seen.add(it.ruleId);
      rules.push({
        id: it.ruleId,
        lang: m.lang,
        slug: m.slug,
        category: m.category,
        ...(m.level ? { level: { system: m.level.system, value: m.level.value, confirmed: m.level.confirmed === true } } : {}),
        status: 'approved',
        title: String((sibling.revision.content as { title?: string }).title ?? it.ruleId).slice(0, 200),
      });
    }
    const ids = new Set(rules.map((r) => r.id));
    const base = {
      schemaVersion: 1 as const,
      languages: frozen.languages.map((l) => ({ code: l.code, name: l.name, enabled: true })),
      rules,
      retired: frozen.retired.map((t) => ({ id: t.id, replacedBy: t.replacedBy && ids.has(t.replacedBy) ? t.replacedBy : null })),
    };
    return loadRegistry({ ...base, version: computeVersion(base) });
  }
}
