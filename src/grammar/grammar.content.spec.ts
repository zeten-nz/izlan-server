import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupProblem } from './cli';
import { completenessIssues, contentHash, languageIssues, parseContent, releaseLicenseIssues } from './content.schema';
import {
  canApprove,
  canCreateRevision,
  canEditRevision,
  canModerate,
  canSoftDeleteRule,
  canSubmit,
  canWithdraw,
  type Actor,
  type RevisionStatus,
} from './permissions';
import { canTransition, TRANSITIONS } from './state-machine';
import { hasAnyScript, stripStress } from './text';
import { lintMdxBody } from './mdx-lint';

const T1: Actor = { id: 't1', role: 'TEACHER' };
const T2: Actor = { id: 't2', role: 'TEACHER' };
const AD: Actor = { id: 'a1', role: 'ADMIN' };
const ST: Actor = { id: 's1', role: 'STUDENT' };
const rev = (status: RevisionStatus, authorId: string | null = 't1') => ({ status, authorId, deleted: false });

test('holat mashinasi: faqat ruxsat etilgan o‘tishlar', () => {
  const all: RevisionStatus[] = ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'];
  const allowed = new Set(['DRAFT>IN_REVIEW', 'IN_REVIEW>DRAFT', 'IN_REVIEW>APPROVED', 'IN_REVIEW>CHANGES_REQUESTED', 'IN_REVIEW>REJECTED', 'CHANGES_REQUESTED>IN_REVIEW']);
  for (const a of all) for (const b of all) assert.equal(canTransition(a, b), allowed.has(`${a}>${b}`), `${a}→${b}`);
  assert.deepEqual(TRANSITIONS.APPROVED, []);
  assert.deepEqual(TRANSITIONS.REJECTED, []);
});

test('ruxsat matritsasi: tahrir', () => {
  for (const st of ['DRAFT', 'CHANGES_REQUESTED'] as const) {
    assert.equal(canEditRevision(T1, rev(st)), true, 'muallif');
    assert.equal(canEditRevision(T2, rev(st)), false, 'boshqa teacher');
    assert.equal(canEditRevision(AD, rev(st)), true);
    assert.equal(canEditRevision(ST, rev(st)), false);
  }
  for (const st of ['IN_REVIEW', 'APPROVED', 'REJECTED'] as const) {
    for (const a of [T1, T2, AD, ST]) assert.equal(canEditRevision(a, rev(st)), false, `${a.id} ${st}`);
  }
  assert.equal(canEditRevision(T1, { ...rev('DRAFT'), deleted: true }), false);
  assert.equal(canSubmit(T2, rev('DRAFT')), false);
});

test('ruxsat matritsasi: withdraw/tasdiqlash/yangi revision/moderatsiya', () => {
  assert.equal(canWithdraw(T1, rev('IN_REVIEW')), true);
  assert.equal(canWithdraw(T2, rev('IN_REVIEW')), false);
  assert.equal(canWithdraw(T1, rev('APPROVED')), false);
  assert.equal(canWithdraw(AD, rev('IN_REVIEW')), true);
  assert.equal(canApprove(AD), true);
  for (const a of [T1, ST]) assert.equal(canApprove(a), false);
  assert.equal(canCreateRevision(T1), false);
  assert.equal(canCreateRevision(AD), true);
  assert.equal(canModerate(T1), false);
  assert.equal(canModerate(AD), true);
});

test('ruxsat matritsasi: soft delete', () => {
  const base = { createdById: 't1', everApproved: false, everReleased: false, inUse: false, deleted: false };
  assert.equal(canSoftDeleteRule(T1, base), true);
  assert.equal(canSoftDeleteRule(T2, base), false);
  assert.equal(canSoftDeleteRule(AD, base), true);
  assert.equal(canSoftDeleteRule(T1, { ...base, everApproved: true }), false);
  assert.equal(canSoftDeleteRule(AD, { ...base, everApproved: true }), false);
  assert.equal(canSoftDeleteRule(AD, { ...base, everReleased: true }), false);
  assert.equal(canSoftDeleteRule(AD, { ...base, inUse: true }), false);
  assert.equal(canSoftDeleteRule(T1, { ...base, deleted: true }), false);
});

const GOOD = {
  title: 'Articles',
  summary: 'a/an/the',
  examples: [
    { text: 'I have a dog.', translation: 'Mening itim bor.' },
    { text: 'The sun rises.', translation: 'Quyosh chiqadi.' },
  ],
  sources: [{ title: 'Mening qaydlarim', license: 'original' }],
  body: '## Qoida\n\nOddiy matn.\n',
};
const EN = { scripts: ['Latn'], blocks: ['table', 'conjugation'] };

test('kontent sxemasi: yaroqli, strict, standart qiymatlar', () => {
  const p = parseContent(GOOD);
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.deepEqual(p.content.related, []);
    assert.deepEqual(languageIssues(p.content, EN), []);
    assert.deepEqual(completenessIssues(p.content, 'ORIGINAL'), []);
  }
  assert.equal(parseContent({ ...GOOD, status: 'approved' }).ok, false, 'noma‘lum (workflow) maydon rad etiladi');
  assert.equal(parseContent({ ...GOOD, title: '' }).ok, false);
  assert.equal(parseContent({ ...GOOD, sources: [{ title: 'x', url: 'http://x.com' }] }).ok, false, 'faqat https');
  assert.equal(parseContent({ ...GOOD, related: ['x'] }).ok, false);
});

test('kontent tekshiruvi: yozuv, blok, furigana/urg‘u, XSS', () => {
  const p = parseContent({ ...GOOD, examples: [{ text: 'Привет', translation: 'x' }] });
  assert.ok(p.ok && languageIssues(p.content, EN).some((i) => i.path === 'examples.0.text'));
  const b = parseContent({ ...GOOD, blocks: [{ kind: 'declension', rows: [{ case: 'x', singular: 'a', plural: 'b' }] }] });
  assert.ok(b.ok && languageIssues(b.content, EN).some((i) => i.path === 'blocks.0'));
  const r = parseContent({ ...GOOD, examples: [{ text: 'I run', translation: 'x', ruby: [{ base: 'I run' }] }] });
  assert.ok(r.ok && languageIssues(r.content, EN).some((i) => i.path === 'examples.0.ruby'));
  for (const body of ['<script>alert(1)</script>', '{alert(1)}', '[x](javascript:alert(1))', '![i](x.png)', '<img src=x onerror=1>', 'import x from "y"']) {
    const x = parseContent({ ...GOOD, body });
    assert.ok(x.ok && languageIssues(x.content, EN).some((i) => i.path === 'body'), body);
  }
});

test('to‘liqlik va litsenziya darvozasi', () => {
  const thin = parseContent({ title: 'T' });
  assert.ok(thin.ok);
  if (thin.ok) {
    const paths = completenessIssues(thin.content, 'UNKNOWN').map((i) => i.path);
    for (const p of ['summary', 'examples', 'sources', 'provenance']) assert.ok(paths.includes(p), p);
  }
  const sa = parseContent({ ...GOOD, sources: [{ title: 'Wiki', license: 'CC BY-SA 4.0', shareAlike: true }] });
  assert.ok(sa.ok);
  if (sa.ok) {
    assert.equal(releaseLicenseIssues(sa.content, 'EXTERNAL').length, 1, 'ShareAlike: ALLOWED bo‘lmaguncha bloklanadi');
    const ok = parseContent({ ...GOOD, sources: [{ title: 'Wiki', license: 'CC BY-SA 4.0', shareAlike: true, licenseReview: { status: 'ALLOWED' } }] });
    assert.ok(ok.ok && releaseLicenseIssues(ok.content, 'EXTERNAL').length === 0);
    const bl = parseContent({ ...GOOD, sources: [{ title: 'X', license: 'x', licenseReview: { status: 'BLOCKED' } }] });
    assert.ok(bl.ok && releaseLicenseIssues(bl.content, 'ORIGINAL').length === 1);
  }
  const p = parseContent(GOOD);
  assert.ok(p.ok && releaseLicenseIssues(p.content, 'ORIGINAL').length === 0);
  assert.ok(p.ok && releaseLicenseIssues(p.content, 'UNKNOWN').length === 1);
});

test('contentHash: barqaror va kontentga sezgir', () => {
  const a = parseContent(GOOD);
  const b = parseContent({ ...GOOD, title: 'Articles!' });
  const a2 = parseContent(JSON.parse(JSON.stringify(GOOD)));
  assert.ok(a.ok && b.ok && a2.ok);
  if (a.ok && b.ok && a2.ok) {
    assert.equal(contentHash(a.content), contentHash(a2.content));
    assert.notEqual(contentHash(a.content), contentHash(b.content));
  }
});

// Client bilan paritet (client/src/lib/grammar/text.ts va mdx-lint.ts golden holatlari)
test('paritet: text.ts va mdx-lint.ts', () => {
  assert.equal(stripStress('вода́'), 'вода');
  assert.equal(stripStress('ёж'), 'ёж');
  assert.equal(stripStress('й'), 'й');
  assert.equal(hasAnyScript('abc', ['Latn']), true);
  assert.equal(hasAnyScript('abc', ['Cyrl']), false);
  assert.equal(hasAnyScript('てform', ['Jpan']), true);
  assert.deepEqual(lintMdxBody('Oddiy **matn** va `{kod}`.'), []);
  assert.equal(lintMdxBody('<Callout tone="info">ok</Callout>').length, 0);
  assert.equal(lintMdxBody('<Callout tone="evil">x</Callout>').length, 1);
  assert.equal(lintMdxBody('```\n{ ok }\n```').length, 0);
  assert.equal(lintMdxBody('```\nyopilmagan').length, 1);
});

test('release CLI: zaxira tekshiruvi', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  assert.match(backupProblem({}, now, {}) ?? '', /backup-at/);
  assert.equal(backupProblem({ 'backup-at': '2026-10-19T08:00:00Z' }, now, {}), null);
  assert.match(backupProblem({ 'backup-at': '2026-10-17T08:00:00Z' }, now, {}) ?? '', /eski/);
  assert.match(backupProblem({ 'backup-at': 'xato' }, now, {}) ?? '', /majburiy/);
  assert.match(backupProblem({ 'backup-at': '2026-10-19T13:00:00Z' }, now, {}) ?? '', /kelajak/);
  assert.equal(backupProblem({ 'allow-no-backup': true }, now, { NODE_ENV: 'development' }), null);
  assert.match(backupProblem({ 'allow-no-backup': true }, now, { NODE_ENV: 'production' }) ?? '', /productionda/);
  assert.equal(backupProblem({ 'backup-at': '2026-10-19T08:00:00Z' }, now, { GRAMMAR_BACKUP_MAX_AGE_H: '2' }) !== null, true);
});
