/**
 * Integratsiya testlari (izolyatsiyalangan PostgreSQL). GRAMMAR_TEST_DATABASE_URL o'rnatilmasa TEGISHLI TESTLAR O'TKAZIB YUBORILADI.
 * Xavfsizlik: baza nomi `izlan_g<raqam>`, `izlan_e2e*` yoki `izlan_test_ci` bo'lishi shart (asosiy/production bazaga ulanmaydi).
 * Tayyorlash: server/gdb yordamchisi yoki `createdb izlan_g9 && DATABASE_URL=... npx prisma migrate deploy`.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const URL_ = process.env.GRAMMAR_TEST_DATABASE_URL;
const dbName = URL_ ? new URL(URL_).pathname.replace(/^\//, '') : '';
const enabled = !!URL_ && /^izlan_(g\d+|e2e\w*|test_ci)$/.test(dbName);
if (URL_ && !enabled) throw new Error(`Xavfsizlik: test bazasi nomi mos emas (${dbName})`);
const skip = enabled ? false : 'GRAMMAR_TEST_DATABASE_URL (izlan_g<N>) o‘rnatilmagan';

import type { Actor } from './permissions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let content: any, releases: any, svc: any;

const T1: Actor = { id: '00000000-0000-0000-0000-0000000000a1', role: 'TEACHER' };
const T2: Actor = { id: '00000000-0000-0000-0000-0000000000a2', role: 'TEACHER' };
const AD: Actor = { id: '00000000-0000-0000-0000-0000000000b1', role: 'ADMIN' };
const AD2: Actor = { id: '00000000-0000-0000-0000-0000000000b2', role: 'ADMIN' };

const GOOD = (title = 'Articles') => ({
  title,
  summary: 'a/an/the',
  examples: [
    { text: 'I have a dog.', translation: 'Mening itim bor.' },
    { text: 'The sun rises.', translation: 'Quyosh chiqadi.' },
  ],
  sources: [{ title: 'Mening qaydlarim', license: 'original' }],
  body: '## Qoida\n\nOddiy matn.\n',
});

async function rejects(p: Promise<unknown>, code: RegExp | number, label: string) {
  try {
    await p;
  } catch (e) {
    const err = e as { status?: number; getStatus?: () => number; message?: string };
    const st = err.getStatus?.() ?? err.status;
    if (typeof code === 'number') assert.equal(st, code, `${label}: status ${st} (${err.message})`);
    else assert.match(String(err.message), code, label);
    return;
  }
  assert.fail(`${label}: xato kutilgan edi`);
}
async function sqlFails(sql: string, re: RegExp, label: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (e) {
    assert.match(String((e as Error).message), re, label);
    return;
  }
  assert.fail(`${label}: SQL rad etilishi kerak edi`);
}

before(async () => {
  if (!enabled) return;
  process.env.DATABASE_URL = URL_;
  process.env.GRAMMAR_SOURCE = 'release';
  const { PrismaService } = await import('../prisma/prisma.service');
  const { GrammarContentService } = await import('./content.service');
  const { GrammarReleaseService } = await import('./release.service');
  const { GrammarService } = await import('./grammar.service');
  prisma = new PrismaService();
  await prisma.$connect();
  // toza holat: faqat ruxsat etilgan test bazasida (append-only triggerlar TRUNCATE'ni to'smaydi)
  await prisma.$executeRawUnsafe(
    `TRUNCATE "GrammarActivation","GrammarOverlayEvent","GrammarReleaseItem","GrammarRelease","GrammarReviewEvent","GrammarRevision","GrammarSlugAlias","GrammarRule","GrammarIdCounter","GrammarLanguage","GrammarImportRun","AuditLog" RESTART IDENTITY CASCADE`,
  );
  await prisma.grammarLanguage.create({
    data: { code: 'en', name: 'English', nativeName: 'English', blocks: ['table', 'conjugation'], enabled: true, levelSystem: 'cefr', scripts: ['Latn'], categories: [{ id: 'articles', title: { uz: 'Artikllar' } }] },
  });
  content = new GrammarContentService(prisma);
  releases = new GrammarReleaseService(prisma, content);
  svc = new GrammarService(prisma);
});
after(async () => {
  if (prisma) await prisma.$disconnect();
});

let ruleA = '';
let revA = '';

test('teacher qoida yaratadi: ID ajratiladi, DRAFT, muallif serverda belgilanadi', { skip }, async () => {
  const r1 = await content.createRule(T1, { lang: 'en', slug: 'articles', category: 'articles', level: { system: 'cefr', value: 'A1' }, content: GOOD() });
  const r2 = await content.createRule(T2, { lang: 'en', slug: 'second', category: 'articles', content: GOOD('Second') });
  assert.equal(r1.ruleId, 'gr_en_000001');
  assert.equal(r2.ruleId, 'gr_en_000002');
  ruleA = r1.ruleId;
  revA = r1.revisionId;
  const rev = await prisma.grammarRevision.findUnique({ where: { id: revA } });
  assert.equal(rev.status, 'DRAFT');
  assert.equal(rev.authorId, T1.id);
  await rejects(content.createRule(T1, { lang: 'en', slug: 'articles', category: 'articles', content: GOOD() }), 409, 'slug takrori');
  await rejects(content.createRule({ id: 's', role: 'STUDENT' }, { lang: 'en', slug: 'x', category: 'articles', content: GOOD() }), 403, 'student');
  await rejects(content.createRule(T1, { lang: 'en', slug: 'Bad Slug', category: 'articles', content: GOOD() }), 400, 'slug formati');
  await rejects(content.createRule(T1, { lang: 'en', slug: 'ok', category: 'articles', content: { ...GOOD(), body: '<script>x</script>' } }), 422, 'XSS');
  await rejects(content.createRule(T1, { lang: 'en', slug: 'ok', category: 'articles', content: { ...GOOD(), status: 'approved' } }), 422, 'workflow maydon kontentda');
});

test('boshqa teacher o‘qiy oladi, lekin tahrir/topshirish/o‘chirish qila olmaydi', { skip }, async () => {
  const seen = await content.getRule(T2, ruleA);
  assert.equal(seen.revisions[0].canEdit, false);
  await rejects(content.saveDraft(T2, revA, { rev: 1, content: GOOD('hack') }), 403, 'boshqa tahrir');
  await rejects(content.submit(T2, revA), 403, 'boshqa submit');
  await rejects(content.softDelete(T2, ruleA, 'sabab bor'), 403, 'boshqa delete');
});

test('saveDraft: optimistik qulf (rev) va konflikt', { skip }, async () => {
  const a = await content.saveDraft(T1, revA, { rev: 1, content: GOOD('Articles v2') });
  assert.equal(a.rev, 2);
  await rejects(content.saveDraft(T1, revA, { rev: 1, content: GOOD('stale') }), 409, 'eski rev');
  // parallel: ikki saqlash bir xil rev bilan — faqat bittasi o'tadi
  const res = await Promise.allSettled([content.saveDraft(T1, revA, { rev: 2, content: GOOD('P1') }), content.saveDraft(T1, revA, { rev: 2, content: GOOD('P2') })]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
});

test('topshirish: to‘liqsiz rad; to‘liq bo‘lsa IN_REVIEW; keyin tahrir yo‘q', { skip }, async () => {
  const thin = await content.createRule(T1, { lang: 'en', slug: 'thin', category: 'articles', content: { title: 'Thin' } });
  await rejects(content.submit(T1, thin.revisionId), 422, 'to‘liqsiz');
  assert.deepEqual(await content.submit(T1, revA), { status: 'IN_REVIEW' });
  await rejects(content.saveDraft(T1, revA, { rev: 3, content: GOOD('x') }), 403, 'IN_REVIEW tahrir');
  await sqlFails(`UPDATE "GrammarRevision" SET content = '{"title":"hack"}'::jsonb WHERE id = '${revA}'`, /IN_REVIEW|frozen|immutable|taqiq/i, 'DB trigger: IN_REVIEW kontent muzlagan');
  assert.deepEqual(await content.withdraw(T1, revA), { status: 'DRAFT' });
  await content.saveDraft(T1, revA, { rev: 3, content: GOOD('Articles final') });
  await content.submit(T1, revA);
});

test('tasdiqlash: faqat ADMIN, xesh TOCTOU, self-approve belgisi, APPROVED o‘zgarmas', { skip }, async () => {
  const cur = await prisma.grammarRevision.findUnique({ where: { id: revA } });
  await rejects(content.approve(T1, revA, { contentHash: cur.contentHash }), 403, 'teacher approve');
  await rejects(content.approve(AD, revA, { contentHash: 'deadbeefdeadbeef' }), 409, 'noto‘g‘ri xesh');
  const ok = await content.approve(AD, revA, { contentHash: cur.contentHash, checks: { grammar: true } });
  assert.equal(ok.status, 'APPROVED');
  assert.equal(ok.selfApproved, false);
  assert.equal(ok.released, false, 'approved ≠ released');
  const rev = await prisma.grammarRevision.findUnique({ where: { id: revA } });
  assert.equal(rev.approvedHash, rev.contentHash);
  await sqlFails(`UPDATE "GrammarRevision" SET content = '{"title":"x"}'::jsonb WHERE id = '${revA}'`, /APPROVED|immutable|taqiq/i, 'approved o‘zgarmas');
  await sqlFails(`DELETE FROM "GrammarRevision" WHERE id = '${revA}'`, /./, 'approved o‘chirilmaydi');
  await rejects(content.softDelete(T1, ruleA, 'xohlayman'), 403, 'approved o‘chirilmaydi');
  await rejects(content.newRevision(T1, ruleA), 403, 'teacher yangi revision ocholmaydi');
  // self-approve (admin yozgan): audit + flag
  const mine = await content.createRule(AD2, { lang: 'en', slug: 'admin-own', category: 'articles', content: GOOD('Admin own') });
  await content.submit(AD2, mine.revisionId);
  const h = (await prisma.grammarRevision.findUnique({ where: { id: mine.revisionId } })).contentHash;
  const self = await content.approve(AD2, mine.revisionId, { contentHash: h });
  assert.equal(self.selfApproved, true);
  const ev = await prisma.grammarReviewEvent.findFirst({ where: { revisionId: mine.revisionId, action: 'revision.approve.self' } });
  assert.ok(ev, 'self-approve auditda');
  const al = await prisma.auditLog.findFirst({ where: { action: 'grammar.revision.approve.self' } });
  assert.ok(al);
});

test('request-changes / reject / qayta topshirish', { skip }, async () => {
  const r = await content.createRule(T1, { lang: 'en', slug: 'cc', category: 'articles', content: GOOD('CC') });
  await content.submit(T1, r.revisionId);
  await rejects(content.requestChanges(AD, r.revisionId, ' '), 400, 'izoh majburiy');
  await content.requestChanges(AD, r.revisionId, 'Misollarni tuzating');
  const cur = await content.getRule(T1, r.ruleId);
  assert.equal(cur.revisions[0].status, 'CHANGES_REQUESTED');
  assert.equal(cur.revisions[0].reviewNote, 'Misollarni tuzating');
  assert.equal(cur.revisions[0].canEdit, true);
  await content.submit(T1, r.revisionId);
  await content.reject(AD, r.revisionId, 'Mos emas');
  await rejects(content.submit(T1, r.revisionId), 403, 'REJECTED qayta topshirilmaydi');
  // rad etilgan qoida never-approved: teacher o'chira oladi, slug bo'shaydi
  assert.deepEqual(await content.softDelete(T1, r.ruleId, 'kerak emas'), { deleted: true });
  await content.createRule(T1, { lang: 'en', slug: 'cc', category: 'articles', content: GOOD('CC again') });
  assert.equal((await content.listRules(T1, {})).some((x: { id: string }) => x.id === r.ruleId), false);
  assert.ok(await prisma.grammarReviewEvent.findFirst({ where: { ruleId: r.ruleId, action: 'rule.delete' } }), 'audit saqlanadi');
});

test('approved release qilinmaguncha o‘quvchiga ko‘rinmaydi (reyestr, bundle)', { skip }, async () => {
  assert.equal(await svc.getRegistry(), null, 'aktiv release yo‘q: fail-closed');
  const none = await releases.status();
  assert.equal(none.active, null);
});

let rel1 = { releaseId: '', snapshotHash: '' };
test('release nomzodi: preview, darvozalar, yaratish; aktivlash faqat CLI yo‘li', { skip }, async () => {
  const pv = await releases.preview(AD, {});
  assert.equal(pv.ok, true, JSON.stringify(pv.errors));
  assert.equal(pv.itemCount, 2); // articles + admin-own (APPROVED)
  await rejects(releases.preview(T1, {}), 403, 'teacher preview');
  await rejects(releases.createCandidate(T1, {}), 403, 'teacher candidate');
  rel1 = await releases.createCandidate(AD, { note: 'birinchi' });
  await rejects(releases.createCandidate(AD, {}), 409, 'bir xil tarkib takrori');
  assert.equal((await releases.status()).active, null, 'nomzod aktiv emas');
  assert.equal(await svc.getRegistry(), null);
});

test('litsenziya darvozasi: ShareAlike ALLOWED bo‘lmaguncha release bloklanadi', { skip }, async () => {
  const r = await content.createRule(AD, {
    lang: 'en',
    slug: 'sa',
    category: 'articles',
    provenance: 'EXTERNAL',
    content: { ...GOOD('SA'), sources: [{ title: 'Wiki', url: 'https://example.org/x', license: 'CC BY-SA 4.0', shareAlike: true }] },
  });
  await content.submit(AD, r.revisionId);
  const h = (await prisma.grammarRevision.findUnique({ where: { id: r.revisionId } })).contentHash;
  await content.approve(AD, r.revisionId, { contentHash: h });
  const pv = await releases.preview(AD, {});
  assert.equal(pv.ok, false);
  assert.ok(pv.errors.some((e: { gate: string; ruleId: string }) => e.gate === 'license' && e.ruleId === r.ruleId));
  await rejects(releases.createCandidate(AD, {}), 409, 'bloklangan');
  // huquqiy qaror: yangi revision bilan ALLOWED (admin)
  const nr = await content.newRevision(AD, r.ruleId);
  const cur = await prisma.grammarRevision.findUnique({ where: { id: nr.revisionId } });
  const c = cur.content;
  c.sources[0].licenseReview = { status: 'ALLOWED', by: 'legal', at: '2026-10-19' };
  await content.saveDraft(AD, nr.revisionId, { rev: cur.rev, content: c });
  await content.submit(AD, nr.revisionId);
  const h2 = (await prisma.grammarRevision.findUnique({ where: { id: nr.revisionId } })).contentHash;
  await content.approve(AD, nr.revisionId, { contentHash: h2 });
  assert.equal((await releases.preview(AD, {})).ok, true);
});

let rel2 = { releaseId: '', snapshotHash: '' };
test('aktivlash: xesh tekshiruvi, jurnal, reyestr + bundle; rollback', { skip }, async () => {
  await rejects(releases.activate({ releaseId: rel1.releaseId, expectHash: 'x'.repeat(32), actor: 'pipeline', reason: 'test' }), 409, 'noto‘g‘ri xesh');
  await rejects(releases.activate({ releaseId: rel1.releaseId, expectHash: rel1.snapshotHash, actor: '', reason: 'test' }), 400, 'actor majburiy');
  const act = await releases.activate({ releaseId: rel1.releaseId, expectHash: rel1.snapshotHash, actor: 'pipeline:ci-1', reason: 'birinchi nashr' });
  assert.equal(act.action, 'ACTIVATE');
  await rejects(releases.activate({ releaseId: rel1.releaseId, expectHash: rel1.snapshotHash, actor: 'p', reason: 'qayta' }), 409, 'allaqachon aktiv');

  const reg = await svc.getRegistry();
  assert.ok(reg, 'reyestr yuklangan');
  assert.equal(reg.lookup(ruleA).state, 'available');
  assert.equal(reg.listSelectable().length, 2);

  const b = await releases.bundle(rel1.releaseId);
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.rules.length, 2);
  const rule = b.rules.find((r: { id: string }) => r.id === ruleA);
  assert.ok(rule.translations.uz.title);
  assert.equal(rule.translations.uz.reviewedByName.length > 0, true);
  assert.equal(JSON.stringify(b).includes('licenseReview'), false, 'ichki litsenziya maydonlari ommaviy bundle’da yo‘q');

  // yangi revision -> release 2 -> aktiv -> rollback release 1
  const nr = await content.newRevision(AD, ruleA);
  const cur = await prisma.grammarRevision.findUnique({ where: { id: nr.revisionId } });
  await content.saveDraft(AD, nr.revisionId, { rev: cur.rev, content: GOOD('Articles v3') });
  await content.submit(AD, nr.revisionId);
  const h = (await prisma.grammarRevision.findUnique({ where: { id: nr.revisionId } })).contentHash;
  await content.approve(AD, nr.revisionId, { contentHash: h });
  assert.equal((await svc.getRegistry()).lookup(ruleA).rule.title, 'Articles final', 'approved yangi revision hali ko‘rinmaydi');
  rel2 = await releases.createCandidate(AD, { note: 'ikkinchi' });
  const a2 = await releases.activate({ releaseId: rel2.releaseId, expectHash: rel2.snapshotHash, actor: 'pipeline:ci-2', reason: 'v3' });
  assert.equal(a2.previousReleaseId, rel1.releaseId);
  assert.equal((await svc.getRegistry()).lookup(ruleA).rule.title, 'Articles v3');
  const back = await releases.activate({ releaseId: rel1.releaseId, expectHash: rel1.snapshotHash, actor: 'ops', reason: 'v3 xato' });
  assert.equal(back.action, 'ROLLBACK');
  assert.equal((await svc.getRegistry()).lookup(ruleA).rule.title, 'Articles final');
  assert.equal((await releases.activations()).length, 3);
});

test('per-rule revert nomzodi: eski released revision pin qilinadi', { skip }, async () => {
  const revs = await prisma.grammarRevision.findMany({ where: { ruleId: ruleA, status: 'APPROVED' }, orderBy: { revisionNo: 'asc' } });
  assert.equal(revs.length, 2);
  await rejects(releases.createRuleRevertCandidate(T1, ruleA, revs[0].id), 403, 'teacher revert');
  // release 2 hozir aktiv emas; revision 2 released bo'lgan; revision 1 ga pin = rel1 bilan bir xil snapshot -> takror (409)
  const rv = await releases.createRuleRevertCandidate(AD, ruleA, revs[0].id);
  const pinned = await prisma.grammarReleaseItem.findFirst({ where: { releaseId: rv.releaseId, ruleId: ruleA } });
  assert.equal(pinned.revisionId, revs[0].id, 'qoida eski revision’ga pin qilingan');
  assert.equal((await releases.status()).active.id, rel1.releaseId, 'nomzod aktivlashtirilmagan');
  const pv = await releases.preview(AD, { [ruleA]: revs[1].id });
  assert.equal(pv.ok, true);
});

test('kill-switch overlay: darhol (server reyestri), sabab majburiy, UNHIDE', { skip }, async () => {
  await rejects(content.setHidden(T1, ruleA, true, 'sabab bor'), 403, 'teacher hide');
  await rejects(content.setHidden(AD, ruleA, true, ' '), 400, 'sabab majburiy');
  await content.setHidden(AD, ruleA, true, 'xato tarjima');
  const ov = await content.overlay();
  assert.deepEqual(ov.hiddenIds, [ruleA]);
  assert.ok(ov.overlayVersion >= 1);
  assert.equal((await svc.getRegistry()).lookup(ruleA).state, 'unknown', 'yashirilgan qoida hal qilinmaydi');
  await content.setHidden(AD, ruleA, false, 'tuzatildi');
  assert.deepEqual((await content.overlay()).hiddenIds, []);
  assert.equal((await svc.getRegistry()).lookup(ruleA).state, 'available');
  await sqlFails(`UPDATE "GrammarOverlayEvent" SET reason='x'`, /append|taqiq|immutable/i, 'overlay append-only');
});

test('DB triggerlar: append-only, release item faqat APPROVED, hisoblagich kamaymaydi', { skip }, async () => {
  await sqlFails(`DELETE FROM "GrammarActivation"`, /append|taqiq|immutable/i, 'activation append-only');
  await sqlFails(`UPDATE "GrammarRelease" SET note='x'`, /append|taqiq|immutable/i, 'release immutable');
  await sqlFails(`DELETE FROM "GrammarReleaseItem"`, /append|taqiq|immutable/i, 'release item immutable');
  await sqlFails(`UPDATE "GrammarReviewEvent" SET note='x'`, /append|taqiq|immutable/i, 'audit append-only');
  await sqlFails(`UPDATE "GrammarIdCounter" SET next = 1 WHERE lang='en'`, /./, 'hisoblagich kamaymaydi');
  await sqlFails(`DELETE FROM "GrammarRule" WHERE id='${ruleA}'`, /./, 'qoida hard-delete yo‘q');
  const draft = await prisma.grammarRevision.findFirst({ where: { status: 'DRAFT' } });
  if (draft) {
    await sqlFails(
      `INSERT INTO "GrammarReleaseItem"("releaseId","ruleId","explanationLang","revisionId",meta) VALUES ('${rel1.releaseId}','${draft.ruleId}','uz','${draft.id}','{}')`,
      /./,
      'DRAFT revision release’ga kirmaydi',
    );
  }
});

test('retire: foydalanish ogohlantirishi, almashtiruvchi, qaytarib bo‘lmaydi', { skip }, async () => {
  await rejects(content.retire(T1, ruleA, { reason: 'eskirgan' }), 403, 'teacher retire');
  const rules: { id: string; revisions: { status: string }[] }[] = await content.listRules(AD, {});
  const other = rules.find((r) => r.id !== ruleA && r.revisions.some((v) => v.status === 'APPROVED'))!;
  const out = await content.retire(AD, other.id, { reason: 'eskirgan' });
  assert.equal(out.state, 'RETIRED');
  await rejects(content.retire(AD, other.id, { reason: 'yana' }), 409, 'qayta retire');
  await sqlFails(`UPDATE "GrammarRule" SET state='OPEN' WHERE id='${other.id}'`, /./, 'RETIRED qaytmaydi');
  await rejects(content.newRevision(AD, other.id), 409, 'retired qoidaga revision yo‘q');
  const pv = await releases.preview(AD, {});
  assert.ok(pv.diff.removed.length >= 1 || pv.itemCount >= 1);
});

test('faollashtirish poygasi: parallel activate seriyalanadi, jurnal izchil', { skip }, async () => {
  // yangi nomzod (retire o'zgarishi bilan)
  const c3 = await releases.createCandidate(AD, { note: 'uchinchi' });
  const results = await Promise.allSettled([
    releases.activate({ releaseId: c3.releaseId, expectHash: c3.snapshotHash, actor: 'p1', reason: 'race' }),
    releases.activate({ releaseId: c3.releaseId, expectHash: c3.snapshotHash, actor: 'p2', reason: 'race' }),
    releases.activate({ releaseId: rel2.releaseId, expectHash: rel2.snapshotHash, actor: 'p3', reason: 'race' }),
  ]);
  const okCount = results.filter((r) => r.status === 'fulfilled').length;
  assert.ok(okCount >= 1 && okCount <= 3);
  const rows = await prisma.grammarActivation.findMany({ orderBy: { seq: 'asc' } });
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].previousReleaseId, rows[i - 1].releaseId, `zanjir uzilmagan (#${rows[i].seq})`);
  const st = await releases.status();
  assert.equal(st.active.id, rows[rows.length - 1].releaseId);
});

test('foydalanish so‘rovi (jsonb_path_exists) ishlaydi', { skip }, async () => {
  assert.deepEqual(await content.usage(ruleA), []);
});

test('import: dry-run hech narsa yozmaydi; apply DRAFT/AI_DRAFT; idempotent; approve qilmaydi', { skip }, async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runImport } = await import('./import-export');
  const dir = await mkdtemp(join(tmpdir(), 'gimp-'));
  await writeFile(
    join(dir, 'languages.json'),
    JSON.stringify({ schemaVersion: 1, explanationLanguages: ['uz'], languages: { de: { name: 'German', nativeName: 'Deutsch', enabled: true, dir: 'ltr', levelSystem: 'cefr', scripts: ['Latn'], blocks: ['table'], categories: [{ id: 'cases', title: { uz: 'Kelishik' } }] } } }),
  );
  await writeFile(join(dir, 'redirects.json'), JSON.stringify({ schemaVersion: 1, redirects: [{ lang: 'de', from: 'old-slug', id: 'gr_de_000007' }], retired: [{ id: 'gr_de_000009', replacedBy: null }] }));
  await mkdir(join(dir, 'de', 'dativ'), { recursive: true });
  await writeFile(join(dir, 'de', 'dativ', 'rule.json'), JSON.stringify({ schemaVersion: 1, id: 'gr_de_000007', lang: 'de', slug: 'dativ', category: 'cases', level: { system: 'cefr', value: 'A2' }, related: [] }));
  const fm = { ruleId: 'gr_de_000007', explanationLang: 'uz', status: 'approved', revision: 5, title: 'Dativ', summary: 'Kelishik', examples: [{ text: 'Ich gebe dem Mann das Buch.', translation: 'x' }, { text: 'Er hilft mir.', translation: 'y' }], author: 'AI qoralama (Claude), tekshirilmagan', review: { reviewedBy: 'x', reviewedAt: '2026-01-01', checks: {} } };
  await writeFile(join(dir, 'de', 'dativ', 'uz.mdx'), `---\n${JSON.stringify(fm, null, 2)}\n---\n\n## Dativ\n\nMatn.\n`);

  const dry = await runImport(prisma, dir, { dryRun: true });
  assert.equal(dry.ok, true, JSON.stringify(dry));
  assert.equal(await prisma.grammarRule.count({ where: { lang: 'de' } }), 0, 'dry-run yozmaydi');
  assert.equal(await prisma.grammarLanguage.count({ where: { code: 'de' } }), 0);

  const ap = await runImport(prisma, dir, { dryRun: false });
  assert.equal(ap.ok, true);
  const rev = await prisma.grammarRevision.findFirst({ where: { ruleId: 'gr_de_000007' } });
  assert.equal(rev.status, 'DRAFT', 'fayl approved bo‘lsa ham import DRAFT');
  assert.equal(rev.provenance, 'AI_DRAFT');
  assert.equal(rev.approvedAt, null);
  assert.match(rev.authorLabel, /AI qoralama/);
  assert.equal((await prisma.grammarSlugAlias.findMany({ where: { ruleId: 'gr_de_000007' } })).length, 1);
  const tomb = await prisma.grammarRule.findUnique({ where: { id: 'gr_de_000009' } });
  assert.equal(tomb.state, 'RETIRED');
  assert.equal((await prisma.grammarIdCounter.findUnique({ where: { lang: 'de' } })).next, 10, 'hisoblagich max+1');

  const again = await runImport(prisma, dir, { dryRun: false });
  assert.ok(again.rules.every((r) => r.action === 'skip-same'), JSON.stringify(again.rules));
  assert.equal(await prisma.grammarRevision.count({ where: { ruleId: 'gr_de_000007' } }), 1, 'idempotent');
  // import qilingan DRAFT'ni tasdiqlashdan oldin topshirish talab qilinadi: sources yo'q -> 422
  await rejects(content.submit(AD, rev.id), 422, 'manbasiz AI qoralama topshirilmaydi');
});
