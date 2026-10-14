import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOT_BY_KIND, equipError, initials, publicProfileView } from './profile.rules';

const user = { username: 'ali_v', firstName: 'Ali', lastName: 'Valiyev' };
const open = { bio: 'Salom', isPublic: true, showFullName: false, showAchievements: false, showStats: false };

test('yopiq profil faqat username qaytaradi', () => {
  assert.deepEqual(publicProfileView({ user, profile: null }), { username: 'ali_v', isPrivate: true });
  assert.deepEqual(publicProfileView({ user, profile: { ...open, isPublic: false, showFullName: true } }), { username: 'ali_v', isPrivate: true });
});

test('ochiq profil: to‘liq ism standart yashirin, maxfiy maydonlar umuman yo‘q', () => {
  const v = publicProfileView({ user, profile: open });
  assert.equal(v.isPrivate, false);
  assert.equal((v as { displayName: string | null }).displayName, null);
  const keys = Object.keys(v).join(',');
  for (const bad of ['email', 'birthYear', 'izl', 'xp', 'wallet', 'firstName', 'lastName']) assert.ok(!keys.toLowerCase().includes(bad.toLowerCase()), bad);
});

test('showFullName yoqilganda ism ko‘rinadi', () => {
  const v = publicProfileView({ user, profile: { ...open, showFullName: true } });
  assert.equal((v as { displayName: string | null }).displayName, 'Ali Valiyev');
});

test('equipError: egalik, tur va mavjudlik', () => {
  const frame = { kind: 'FRAME' as const, status: 'ACTIVE' as const };
  assert.equal(equipError(null, 'FRAME', true), 'Bezak topilmadi');
  assert.equal(equipError(frame, 'FRAME', false), "Bu bezak sizda yo'q");
  assert.equal(equipError(frame, 'BANNER', true), 'Bezak turi mos kelmaydi');
  assert.equal(equipError(frame, 'FRAME', true), null);
  // Katalogdan o'chirilgan (DISABLED) bezak egasida qoladi
  assert.equal(equipError({ ...frame, status: 'DISABLED' }, 'FRAME', true), null);
});

test('har tur alohida ustunga bog‘langan (bitta turdan bittadan)', () => {
  assert.equal(new Set(Object.values(SLOT_BY_KIND)).size, 4);
});

test('initials: ism bo‘lmasa username', () => {
  assert.equal(initials('ali', 'valiyev', 'x'), 'AV');
  assert.equal(initials('', '', 'zebra'), 'Z');
});

test('dizayn registri: 12 ta kalit, har tur 4 tadan, tur mosligi tekshiriladi', async () => {
  const { COSMETIC_DESIGNS, DESIGN_KEYS, designMatchesKind } = await import('./cosmetic-registry');
  assert.equal(DESIGN_KEYS.length, 12);
  for (const kind of ['FRAME', 'BANNER', 'TITLE'] as const) assert.equal(Object.values(COSMETIC_DESIGNS).filter((k) => k === kind).length, 4);
  assert.equal(designMatchesKind('ramka-neon', 'FRAME'), true);
  assert.equal(designMatchesKind('ramka-neon', 'BANNER'), false);
  // noma'lum / prototip kalitlari rad etiladi
  for (const bad of ['', 'nope', '<svg onload=1>', 'constructor', '__proto__', 'toString']) assert.equal(designMatchesKind(bad, 'FRAME'), false, bad);
});
