import type { DocIssue, LessonDoc } from './doc.schema';

/** Hujjatdagi rasm/audio bloklaridan biriga havola. */
export interface MediaRef {
  pageIndex: number;
  blockIndex: number;
  blockType: 'image' | 'audio';
  assetId: string;
}

/** DB'dagi Asset qatoridan kerakli ma'lumot. */
export interface AssetFact {
  kind: 'IMAGE' | 'AUDIO';
  size: number;
}

/** Saqlash (disk)dagi fayl holati. */
export interface FileFact {
  exists: boolean;
  size: number | null;
}

/** Hujjatdagi barcha rasm/audio havolalari (bo'sh `assetId` — `publishIssues` xabar beradi, bu yerda tashlab ketiladi). */
export function collectMediaRefs(doc: LessonDoc): MediaRef[] {
  const out: MediaRef[] = [];
  doc.pages.forEach((p, pageIndex) =>
    p.blocks.forEach((b, blockIndex) => {
      if ((b.type === 'image' || b.type === 'audio') && b.assetId) {
        out.push({ pageIndex, blockIndex, blockType: b.type, assetId: b.assetId });
      }
    }),
  );
  return out;
}

const KIND_BY_BLOCK = { image: 'IMAGE', audio: 'AUDIO' } as const;
const NAME = { image: 'rasm', audio: 'audio' } as const;
const NAME_ACC = { image: 'Rasmni', audio: 'Audioni' } as const;
const OTHER_NAME = { IMAGE: 'rasm', AUDIO: 'audio' } as const;

/**
 * Nashr oldidan media tekshiruvi (sof funksiya): asset DB'da bormi, turi blokka mosmi, fayl diskda bormi va
 * o'lchami yozuvga mosmi. Xabarlar `publishIssues` bilan bir xil `DocIssue` formatida.
 */
export function mediaIssues(refs: MediaRef[], assets: ReadonlyMap<string, AssetFact>, files: ReadonlyMap<string, FileFact>): DocIssue[] {
  const issues: DocIssue[] = [];
  for (const r of refs) {
    const path = `pages.${r.pageIndex}.blocks.${r.blockIndex}`;
    const label = `${r.pageIndex + 1}-sahifa`;
    const name = NAME[r.blockType];
    const asset = assets.get(r.assetId);
    if (!asset) {
      issues.push({ path, message: `${label}: ${name} fayli topilmadi. ${NAME_ACC[r.blockType]} qayta yuklang.` });
      continue;
    }
    if (asset.kind !== KIND_BY_BLOCK[r.blockType]) {
      issues.push({
        path,
        message: `${label}: ${name} bloki noto'g'ri fayl turidan foydalanmoqda (${OTHER_NAME[asset.kind]} fayli tanlangan). ${NAME_ACC[r.blockType]} qayta yuklang.`,
      });
      continue;
    }
    const file = files.get(r.assetId);
    if (!file || !file.exists) {
      issues.push({ path, message: `${label}: ${name} fayli serverda topilmadi. ${NAME_ACC[r.blockType]} qayta yuklang.` });
      continue;
    }
    if (file.size === 0 || file.size !== asset.size) {
      issues.push({ path, message: `${label}: ${name} fayli buzilgan ko'rinadi. ${NAME_ACC[r.blockType]} qayta yuklang.` });
    }
  }
  return issues;
}
