import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Format: scrypt$<salt hex>$<hash hex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** "Foydalanuvchi topilmadi" holatida ham login vaqti bir xil bo'lishi uchun. */
export const DUMMY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(SCRYPT.keylen)}`;

/** Faqat raqamlardan iborat 6 xonali kod (kriptografik tasodifiy, bosh nol ham mumkin). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Kod bazada ochiq saqlanmaydi: HMAC(secret, maqsad:email:kod). */
export function hashOtp(secret: string, scope: string, code: string): string {
  return createHmac('sha256', secret).update(`${scope}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSessionToken(token) };
}
