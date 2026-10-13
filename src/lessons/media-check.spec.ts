import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDoc, publishIssues, type LessonDoc } from './doc.schema';
import { collectMediaRefs, mediaIssues, type AssetFact, type FileFact } from './media-check';

const frame = { x: 10, y: 10, w: 400, h: 120, z: 0 };
const IMG = '11111111-1111-4111-8111-111111111111';
const AUD = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';
const LOST = '44444444-4444-4444-8444-444444444444';

function doc(blocks: unknown[][]): LessonDoc {
  const r = parseDoc({ schemaVersion: 1, pages: blocks.map((b, i) => ({ id: `p${i + 1}`, gate: 'free', blocks: b })) });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.doc;
}
const image = (id: string, assetId: string | null) => ({ id, type: 'image', assetId, alt: 'rasm', ...frame });
const audio = (id: string, assetId: string | null) => ({ id, type: 'audio', assetId, caption: '', transcript: '', ...frame });

const assets = new Map<string, AssetFact>([
  [IMG, { kind: 'IMAGE', size: 100 }],
  [AUD, { kind: 'AUDIO', size: 200 }],
  [LOST, { kind: 'IMAGE', size: 50 }],
]);
const files = new Map<string, FileFact>([
  [IMG, { exists: true, size: 100 }],
  [AUD, { exists: true, size: 200 }],
  [LOST, { exists: false, size: null }],
]);

test('collectMediaRefs: faqat to‘ldirilgan rasm/audio bloklari, sahifa va blok o‘rni bilan', () => {
  const d = doc([[image('i1', IMG), image('i2', null)], [audio('a1', AUD)]]);
  assert.deepEqual(collectMediaRefs(d), [
    { pageIndex: 0, blockIndex: 0, blockType: 'image', assetId: IMG },
    { pageIndex: 1, blockIndex: 0, blockType: 'audio', assetId: AUD },
  ]);
});

test('mediaIssues: to‘g‘ri rasm va audio — muammo yo‘q', () => {
  const refs = collectMediaRefs(doc([[image('i1', IMG)], [audio('a1', AUD)]]));
  assert.deepEqual(mediaIssues(refs, assets, files), []);
});

test('mediaIssues: mavjud bo‘lmagan asset o‘zbekcha xabar bilan', () => {
  const refs = collectMediaRefs(doc([[image('i1', IMG)], [image('i2', GONE)]]));
  const issues = mediaIssues(refs, assets, files);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].message, '2-sahifa: rasm fayli topilmadi. Rasmni qayta yuklang.');
  assert.equal(issues[0].path, 'pages.1.blocks.0');
});

test('mediaIssues: rasm blokiga audio, audio blokiga rasm', () => {
  const refs = collectMediaRefs(doc([[image('i1', AUD)], [audio('a1', IMG)]]));
  const issues = mediaIssues(refs, assets, files);
  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /^1-sahifa: rasm bloki noto'g'ri fayl turidan foydalanmoqda/);
  assert.match(issues[1].message, /^2-sahifa: audio bloki noto'g'ri fayl turidan foydalanmoqda/);
});

test('mediaIssues: DB’da bor, diskda yo‘q fayl', () => {
  const refs = collectMediaRefs(doc([[image('i1', LOST)]]));
  const issues = mediaIssues(refs, assets, files);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /serverda topilmadi/);
});

test('mediaIssues: o‘lcham mos kelmasa yoki bo‘sh bo‘lsa — buzilgan', () => {
  const refs = collectMediaRefs(doc([[image('i1', IMG)], [audio('a1', AUD)]]));
  const bad = new Map(files);
  bad.set(IMG, { exists: true, size: 99 });
  bad.set(AUD, { exists: true, size: 0 });
  const issues = mediaIssues(refs, assets, bad);
  assert.equal(issues.length, 2);
  assert.ok(issues.every((i) => /buzilgan/.test(i.message)));
});

test('publishIssues sof bo‘lib qoladi: assetId bo‘sh bo‘lsa "tanlanmagan", media tekshiruvi dublikat xabar bermaydi', () => {
  const d = doc([[image('i1', null)]]);
  assert.equal(publishIssues(d).some((i) => /tanlanmagan/.test(i.message)), true);
  assert.deepEqual(mediaIssues(collectMediaRefs(d), assets, files), []);
});
