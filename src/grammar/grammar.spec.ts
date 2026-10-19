import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDoc, publishIssues, type LessonDoc } from '../lessons/doc.schema';
import { collectGrammarRefs, grammarIssues, registryVersionIssue } from '../lessons/grammar-check';
import { projectPage } from '../lessons/player';
import { GRAMMAR_REGISTRY_DATA } from './grammar-registry.data';
import { computeVersion, loadRegistry, type GrammarRegistry, type GrammarRegistryData } from './registry';

type Draft = Omit<GrammarRegistryData, 'version'>;

function make(over: Partial<Draft> = {}): GrammarRegistryData {
  const base: Draft = {
    schemaVersion: 1,
    languages: [
      { code: 'en', name: 'English', enabled: true },
      { code: 'ru', name: 'Russian', enabled: false },
    ],
    rules: [
      { id: 'gr_en_000001', lang: 'en', slug: 'present-perfect', category: 'tenses', status: 'approved', title: 'Present Perfect' },
      { id: 'gr_en_000002', lang: 'en', slug: 'articles', category: 'articles', status: 'review', title: null },
      { id: 'gr_en_000003', lang: 'en', slug: 'draft-rule', category: 'tenses', status: 'draft', title: null },
      { id: 'gr_ru_000001', lang: 'ru', slug: 'gender', category: 'gender', status: 'approved', title: 'Ot jinsi' },
      { id: 'gr_en_000004', lang: 'en', slug: 'new-name', category: 'tenses', status: 'approved', title: 'Yangi nom' },
    ],
    retired: [
      { id: 'gr_en_000090', replacedBy: 'gr_en_000004' },
      { id: 'gr_en_000091', replacedBy: null },
      { id: 'gr_en_000092', replacedBy: 'gr_ru_000001' },
    ],
    ...over,
  };
  return { ...base, version: computeVersion(base) };
}

function reg(data = make()): GrammarRegistry {
  const r = loadRegistry(data);
  assert.ok(r.ok, !r.ok ? r.reason : '');
  return r.registry;
}

// ───────── reyestr yaxlitligi

test('reyestr: yaroqli reyestr yuklanadi, versiya xeshdan', () => {
  const r = reg();
  assert.match(r.version, /^[0-9a-f]{16}$/);
});

test('reyestr: o‘zgartirilgan mazmun (xesh mos emas) rad etiladi — fail closed', () => {
  const d = make();
  const tampered = { ...d, rules: d.rules.map((x) => (x.id === 'gr_en_000002' ? { ...x, status: 'approved' as const, title: 'Hack' } : x)) };
  const r = loadRegistry(tampered);
  assert.equal(r.ok, false);
});

test('reyestr: sxema, takroriy ID, ID-til mosligi, replacedBy tekshiriladi', () => {
  assert.equal(loadRegistry({ nope: 1 }).ok, false);
  const dup = make({ rules: [make().rules[0], make().rules[0]] });
  assert.equal(loadRegistry(dup).ok, false);
  const wrongLang = make({ rules: [{ id: 'gr_en_000001', lang: 'ru', slug: 'x', category: 'c', status: 'review', title: null }], retired: [] });
  assert.equal(loadRegistry(wrongLang).ok, false);
  const badReplace = make({ retired: [{ id: 'gr_en_000090', replacedBy: 'gr_en_000999' }] });
  assert.equal(loadRegistry(badReplace).ok, false);
  const liveAndRetired = make({ retired: [{ id: 'gr_en_000001', replacedBy: null }] });
  assert.equal(loadRegistry(liveAndRetired).ok, false);
  const approvedNoTitle = make({ rules: [{ id: 'gr_en_000001', lang: 'en', slug: 'a', category: 'c', status: 'approved', title: null }], retired: [] });
  assert.equal(loadRegistry(approvedNoTitle).ok, false);
});

test('haqiqiy reyestr moduli (client generatsiya qilgan) yaroqli', () => {
  const r = loadRegistry(GRAMMAR_REGISTRY_DATA);
  assert.ok(r.ok, !r.ok ? r.reason : '');
});

// ───────── qoida holatlari

test('lookup: approved+faol → available; review/draft → unapproved; faolsiz til → language-disabled', () => {
  const r = reg();
  assert.equal(r.lookup('gr_en_000001').state, 'available');
  assert.equal(r.lookup('gr_en_000002').state, 'unapproved');
  assert.equal(r.lookup('gr_en_000003').state, 'unapproved');
  assert.equal(r.lookup('gr_ru_000001').state, 'language-disabled'); // approved, lekin ru yoqilmagan
  assert.equal(r.lookup('gr_en_000999').state, 'unknown');
  assert.equal(r.lookup('gr_en_000090').state, 'retired');
});

test('listSelectable: faqat approved va faol til', () => {
  const ids = reg().listSelectable().map((x) => x.id).sort();
  assert.deepEqual(ids, ['gr_en_000001', 'gr_en_000004']);
});

// ───────── nashr tekshiruvi

const frame = { x: 10, y: 10, w: 400, h: 120, z: 0 };
const docWith = (...ids: string[]): LessonDoc => {
  const r = parseDoc({
    schemaVersion: 1,
    pages: [
      { id: 'p1', blocks: [{ id: 't', type: 'text', text: 'Salom', ...frame }, ...ids.map((g, i) => ({ id: `g${i}`, type: 'grammarRef', grammarRuleId: g, ...frame }))] },
    ],
  });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.doc;
};

test('nashr: approved qoida o‘tadi', () => {
  const d = docWith('gr_en_000001');
  assert.deepEqual(grammarIssues(collectGrammarRefs(d), reg()), []);
  assert.deepEqual(publishIssues(d), []);
});

test('nashr: review, draft, faolsiz til, noma’lum ID, nafaqadagi ID rad etiladi', () => {
  const r = reg();
  const cases: [string, RegExp][] = [
    ['gr_en_000002', /tasdiqlanmagan/],
    ['gr_en_000003', /tasdiqlanmagan/],
    ['gr_ru_000001', /faollashtirilmagan/],
    ['gr_en_000999', /topilmadi/],
    ['gr_en_000090', /nafaqaga chiqarilgan.*Yangi nom/],
    ['gr_en_000091', /nafaqaga chiqarilgan/],
  ];
  for (const [id, re] of cases) {
    const issues = grammarIssues(collectGrammarRefs(docWith(id)), r);
    assert.equal(issues.length, 1, id);
    assert.match(issues[0].message, re, id);
    assert.equal(issues[0].path, 'pages.0.blocks.1');
  }
});

test('nashr: bo‘sh tanlov qoralamada o‘tadi, nashrda rad etiladi', () => {
  const d = docWith('');
  assert.equal(collectGrammarRefs(d).length, 0);
  const issues = publishIssues(d);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /tanlanmagan/);
});

test('nashr: reyestr versiyasi mos kelmasa yoki yuborilmasa rad etiladi', () => {
  const r = reg();
  assert.equal(registryVersionIssue(r.version, r), null);
  assert.match(registryVersionIssue('deadbeefdeadbeef', r) ?? '', /mos emas/);
  assert.match(registryVersionIssue(undefined, r) ?? '', /ko‘rsatilmagan|ko'rsatilmagan/);
});

// ───────── hujjat sxemasi: moslik

test('hujjat: grammarRef sxemasi — noto‘g‘ri ID rad etiladi, qo‘shimcha maydonlar saqlanmaydi', () => {
  const bad = parseDoc({ schemaVersion: 1, pages: [{ id: 'p1', blocks: [{ id: 'g', type: 'grammarRef', grammarRuleId: 'present-perfect', ...frame }] }] });
  assert.equal(bad.ok, false);
  const r = parseDoc({
    schemaVersion: 1,
    pages: [{ id: 'p1', blocks: [{ id: 'g', type: 'grammarRef', grammarRuleId: 'gr_en_000001', title: 'Soxta', status: 'approved', lang: 'xx', ...frame }] }],
  });
  assert.ok(r.ok);
  const b = r.doc.pages[0].blocks[0] as Record<string, unknown>;
  assert.equal(b.grammarRuleId, 'gr_en_000001');
  // Mijoz yuborgan nom/holat/til hujjatga o'tmaydi (sxema ularni olib tashlaydi)
  assert.equal('title' in b, false);
  assert.equal('status' in b, false);
  assert.equal('lang' in b, false);
});

test('hujjat: eski darslar (grammarRef yo‘q) o‘zgarishsiz o‘qiladi, schemaVersion 1 saqlanadi', () => {
  const old = parseDoc({
    schemaVersion: 1,
    pages: [
      { id: 'p1', gate: 'free', blocks: [{ id: 'h', type: 'heading', text: 'Salom', ...frame }] },
      { id: 'p2', gate: 'correct', blocks: [{ id: 'q', type: 'choice', question: 'Q?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctIds: ['a'], ...frame }] },
    ],
  });
  assert.ok(old.ok);
  assert.equal(old.doc.schemaVersion, 1);
});

// ───────── o‘quvchi ko‘rinishi

test('o‘quvchi: server qoidani o‘z reyestridan hal qiladi (hujjatdagi ID yagona kirish)', () => {
  const r = reg();
  const d = docWith('gr_en_000001', 'gr_en_000090', 'gr_en_000002', 'gr_en_000091', 'gr_ru_000001');
  const page = projectPage(d.pages[0], (id) => r.resolveForPlayer(id));
  const refs = page.blocks.filter((b) => b.type === 'grammarRef') as Array<{ grammarRuleId: string; rule: { available: boolean; id?: string; title?: string } }>;
  assert.equal(refs[0].rule.available, true);
  assert.equal(refs[0].rule.title, 'Present Perfect');
  // nafaqaga chiqarilgan → almashtiruvchi qoida
  assert.equal(refs[1].grammarRuleId, 'gr_en_000090');
  assert.equal(refs[1].rule.available, true);
  assert.equal(refs[1].rule.id, 'gr_en_000004');
  // review, almashtiruvchisiz nafaqa, faolsiz til → fallback (havolasiz)
  assert.equal(refs[2].rule.available, false);
  assert.equal(refs[3].rule.available, false);
  assert.equal(refs[4].rule.available, false);
});

test('o‘quvchi: reyestr yo‘q/yaroqsiz bo‘lsa hamma havola fallback; to‘g‘ri javoblar sizmaydi', () => {
  const d = docWith('gr_en_000001');
  const page = projectPage(d.pages[0]);
  const g = page.blocks.find((b) => b.type === 'grammarRef') as { rule: { available: boolean } };
  assert.equal(g.rule.available, false);
});
