/**
 * Admin yaratish (terminal orqali, productionda ham):
 *
 *   npm run build
 *   npm run admin:create -- --email admin@izlan.uz --username admin --first Ism --last Familya --birth-year 1995
 *
 * Parol so'raladi (yozilganda ekranda ko'rinmaydi). Skript ishlamaydigan joyda (CI, Docker) parolni
 * ADMIN_PASSWORD muhit o'zgaruvchisi bilan bering (buyruq tarixida qolmasligi uchun --password YO'Q).
 *
 * Mavjud foydalanuvchini admin qilish:  --email mavjud@mail.uz --promote
 * Ma'lumotlar bazasi: .env dagi DATABASE_URL (productionda server muhit o'zgaruvchilari).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/crypto.util';
import { PASSWORD_MSG, PASSWORD_RE, USERNAME_RE } from '../auth/dto';

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Noma'lum argument: ${a}`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** Terminalda yashirin kiritish (echo yo'q). */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Terminal (TTY) yo\'q. Parolni ADMIN_PASSWORD o\'zgaruvchisi bilan bering.'));
    process.stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          return process.exit(130);
        }
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

const need = (args: Args, key: string): string => {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`--${key} kerak`);
  return v.trim();
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = need(args, 'email').toLowerCase();
  const prisma = new PrismaClient();
  try {
    if (args.promote === true) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) throw new Error(`${email} bilan foydalanuvchi topilmadi`);
      if (existing.role === 'ADMIN') return console.log(`${email} allaqachon admin.`);
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
      return console.log(`✔ ${existing.username} (${email}) endi admin.`);
    }

    const username = need(args, 'username').toLowerCase();
    const firstName = need(args, 'first');
    const lastName = need(args, 'last');
    const birthYear = Number(need(args, 'birth-year'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Email noto'g'ri");
    if (!USERNAME_RE.test(username)) throw new Error("Username 3-24 belgi: kichik lotin harf, raqam, nuqta yoki _");
    if (!Number.isInteger(birthYear) || birthYear < 1940 || birthYear > new Date().getFullYear() - 18) {
      throw new Error("--birth-year noto'g'ri (kamida 18 yosh)");
    }

    let password = process.env.ADMIN_PASSWORD ?? '';
    if (!password) {
      password = await askHidden('Parol: ');
      const again = await askHidden('Parolni qayta kiriting: ');
      if (password !== again) throw new Error('Parollar mos kelmadi');
    }
    if (!PASSWORD_RE.test(password)) throw new Error(PASSWORD_MSG);

    const clash = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true, username: true } });
    if (clash) {
      throw new Error(
        `Bunday foydalanuvchi bor (${clash.email === email ? 'email' : 'username'} band). Mavjudini admin qilish uchun: --email ${email} --promote`,
      );
    }

    const user = await prisma.user.create({
      data: { email, username, firstName, lastName, birthYear, passwordHash: await hashPassword(password), role: 'ADMIN', emailVerifiedAt: new Date() },
    });
    console.log(`✔ Admin yaratildi: ${user.username} (${user.email}). /login orqali kiring.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
