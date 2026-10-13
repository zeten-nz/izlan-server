import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/auth/crypto.util";
import { PASSWORD_MSG, PASSWORD_RE, USERNAME_RE } from "../../src/auth/dto";

/**
 * Dastlabki ADMIN: ma'lumotlar muhit o'zgaruvchilaridan olinadi (kodda hardcode yo'q):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD,
 *   SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME, SEED_ADMIN_BIRTH_YEAR
 *
 * Qoidalar (takroran ishga tushirish xavfsiz):
 * - Bazada allaqachon ADMIN bo'lsa hech narsa qilinmaydi (parol, email, boshqa admin — o'zgarmaydi).
 * - Email/username boshqa (admin bo'lmagan) foydalanuvchida band bo'lsa — XATO; hech kim admin qilinmaydi
 *   (mavjudini admin qilish uchun: `npm run admin:create -- --email ... --promote`).
 * - O'zgaruvchilar umuman berilmagan bo'lsa — o'tkazib yuboriladi (katalog seed'i ishlayveradi).
 */

const KEYS = [
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_USERNAME",
  "SEED_ADMIN_PASSWORD",
  "SEED_ADMIN_FIRST_NAME",
  "SEED_ADMIN_LAST_NAME",
  "SEED_ADMIN_BIRTH_YEAR",
] as const;

export type AdminSeedResult =
  | { status: "created"; username: string; email: string }
  | { status: "exists"; count: number }
  | { status: "skipped"; reason: string };

export async function seedAdmin(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env): Promise<AdminSeedResult> {
  // Allaqachon admin bor: parolga ham, akkauntga ham tegilmaydi
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins > 0) return { status: "exists", count: admins };

  const given = KEYS.filter((k) => (env[k] ?? "").trim() !== "");
  if (given.length === 0) {
    return { status: "skipped", reason: `${KEYS.join(", ")} berilmagan: ADMIN yaratilmadi. (Keyinroq: npm run admin:create)` };
  }
  const missing = KEYS.filter((k) => !given.includes(k));
  if (missing.length) throw new Error(`ADMIN yaratish uchun yetishmayotgan o'zgaruvchilar: ${missing.join(", ")}`);

  const email = env.SEED_ADMIN_EMAIL!.trim().toLowerCase();
  const username = env.SEED_ADMIN_USERNAME!.trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD!;
  const firstName = env.SEED_ADMIN_FIRST_NAME!.trim();
  const lastName = env.SEED_ADMIN_LAST_NAME!.trim();
  const birthYear = Number(env.SEED_ADMIN_BIRTH_YEAR);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("SEED_ADMIN_EMAIL noto'g'ri");
  if (!USERNAME_RE.test(username)) throw new Error("SEED_ADMIN_USERNAME: 3-24 belgi, kichik lotin harf, raqam, nuqta yoki _");
  if (!PASSWORD_RE.test(password)) throw new Error(`SEED_ADMIN_PASSWORD: ${PASSWORD_MSG}`);
  if (firstName.length < 2 || lastName.length < 2) throw new Error("SEED_ADMIN_FIRST_NAME va SEED_ADMIN_LAST_NAME kamida 2 belgi");
  if (!Number.isInteger(birthYear) || birthYear < 1940 || birthYear > new Date().getFullYear() - 18) {
    throw new Error("SEED_ADMIN_BIRTH_YEAR noto'g'ri (kamida 18 yosh)");
  }

  const clash = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true, role: true } });
  if (clash) {
    throw new Error(
      `Bu email yoki username allaqachon band (${clash.role}). Hech narsa o'zgartirilmadi. ` +
        `Mavjudini admin qilish uchun: npm run admin:create -- --email ${clash.email} --promote`,
    );
  }

  const user = await prisma.user.create({
    data: { email, username, firstName, lastName, birthYear, passwordHash: await hashPassword(password), role: "ADMIN", emailVerifiedAt: new Date() },
  });
  return { status: "created", username: user.username, email: user.email };
}
