import type { GrammarRegistry } from '../grammar/registry';
import type { DocIssue, LessonDoc } from './doc.schema';

/** Hujjatdagi grammarRef bloklaridan biriga havola (bo'sh ID'lar `publishIssues` da xabar beriladi). */
export interface GrammarRef {
  pageIndex: number;
  blockIndex: number;
  ruleId: string;
}

export function collectGrammarRefs(doc: LessonDoc): GrammarRef[] {
  const out: GrammarRef[] = [];
  doc.pages.forEach((p, pageIndex) =>
    p.blocks.forEach((b, blockIndex) => {
      if (b.type === 'grammarRef' && b.grammarRuleId) out.push({ pageIndex, blockIndex, ruleId: b.grammarRuleId });
    }),
  );
  return out;
}

/**
 * Nashr oldidan grammatika tekshiruvi (sof funksiya). Faqat serverning o'z reyestriga tayanadi:
 * qoida mavjud, approved va tili faol bo'lishi shart. Nafaqaga chiqarilgan qoida yangi nashrda rad etiladi
 * (eski nashr qilingan darslar esa o'quvchiga almashtiruvchi qoida bilan ko'rsatiladi).
 */
export function grammarIssues(refs: GrammarRef[], registry: GrammarRegistry): DocIssue[] {
  const issues: DocIssue[] = [];
  for (const r of refs) {
    const path = `pages.${r.pageIndex}.blocks.${r.blockIndex}`;
    const label = `${r.pageIndex + 1}-sahifa`;
    const l = registry.lookup(r.ruleId);
    switch (l.state) {
      case 'available':
        break;
      case 'unapproved':
        issues.push({ path, message: `${label}: grammatika qoidasi hali metodist tomonidan tasdiqlanmagan (${r.ruleId}). Boshqa qoidani tanlang.` });
        break;
      case 'language-disabled':
        issues.push({ path, message: `${label}: qoidaning tili hozircha faollashtirilmagan (${r.ruleId}). Boshqa qoidani tanlang.` });
        break;
      case 'retired': {
        const next = l.replacedBy ? registry.lookup(l.replacedBy) : null;
        const hint = next && next.state === 'available' ? ` Yangi qoida: «${next.rule.title}».` : '';
        issues.push({ path, message: `${label}: grammatika qoidasi nafaqaga chiqarilgan (${r.ruleId}).${hint}` });
        break;
      }
      case 'unknown':
        issues.push({ path, message: `${label}: grammatika qoidasi topilmadi (${r.ruleId}). Boshqa qoidani tanlang.` });
        break;
    }
  }
  return issues;
}

/**
 * Mijoz (Studio) qurilgan reyestr versiyasi serverniki bilan bir xil bo'lishi shart: ikkala repo mustaqil deploy
 * qilinganda, eskirgan muharrir bilan grammatika havolalarini nashr qilish oldi olinadi. Qiymat faqat drift
 * aniqlash uchun; qoida nomi/holatiga bu ishonch emas.
 */
export function registryVersionIssue(clientVersion: string | undefined, registry: GrammarRegistry): string | null {
  if (!clientVersion) return "Grammatika reyestri versiyasi ko'rsatilmagan. Sahifani yangilang va qayta urinib ko'ring.";
  if (clientVersion !== registry.version) {
    return `Grammatika reyestri versiyasi mos emas (muharrir: ${clientVersion}, server: ${registry.version}). Sahifani yangilang; muammo qolsa, administratorga xabar bering.`;
  }
  return null;
}
