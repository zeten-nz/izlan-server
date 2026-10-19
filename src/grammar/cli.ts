/**
 * Grammatika boshqaruv CLI (HTTP'dan ALOHIDA — production aktivlash faqat shu orqali, ADR-001 D2).
 *   node dist/grammar/cli.js status
 *   node dist/grammar/cli.js import --from <content/grammar> [--apply]            (standart: dry-run)
 *   node dist/grammar/cli.js candidate [--note "..."]                                (nomzod yaratadi, aktivlamaydi)
 *   node dist/grammar/cli.js activate --release <id> --expect-hash <h> --actor <pipeline> --reason "..." --backup-at <ISO>
 *   node dist/grammar/cli.js export --release <id> --out <dir>
 * Zaxira tekshiruvi: `--backup-at` GRAMMAR_BACKUP_MAX_AGE_H (standart 24) soatdan eski bo'lmasligi shart.
 * `--allow-no-backup` faqat NODE_ENV !== 'production' da ishlaydi.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GrammarContentService } from './content.service';
import { exportRelease, runImport } from './import-export';
import { GrammarReleaseService } from './release.service';

function args(argv: string[]) {
  const o: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true;
    else {
      o[k] = v;
      i++;
    }
  }
  return o;
}

export function backupProblem(a: Record<string, string | true>, now = Date.now(), env = process.env): string | null {
  if (a['allow-no-backup'] === true) return env.NODE_ENV === 'production' ? '--allow-no-backup productionda taqiqlangan' : null;
  const at = typeof a['backup-at'] === 'string' ? Date.parse(a['backup-at']) : NaN;
  if (Number.isNaN(at)) return '--backup-at <ISO vaqt> majburiy (oxirgi muvaffaqiyatli zaxira vaqti)';
  const maxH = Number(env.GRAMMAR_BACKUP_MAX_AGE_H ?? 24);
  if (now - at > maxH * 3_600_000) return `zaxira ${maxH} soatdan eski`;
  if (at > now + 60_000) return 'zaxira vaqti kelajakda';
  return null;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const prisma = new PrismaService();
  await prisma.$connect();
  const content = new GrammarContentService(prisma);
  const releases = new GrammarReleaseService(prisma, content);
  try {
    if (cmd === 'status') {
      console.log(JSON.stringify(await releases.status(), null, 2));
    } else if (cmd === 'import') {
      if (typeof a.from !== 'string') throw new Error('--from <papka> majburiy');
      const r = await runImport(prisma as unknown as PrismaClient, a.from, { dryRun: a.apply !== true });
      console.log(JSON.stringify(r, null, 2));
      if (!r.ok) process.exitCode = 2;
    } else if (cmd === 'candidate') {
      const r = await releases.createCandidate({ id: null }, { note: typeof a.note === 'string' ? a.note : undefined });
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'activate') {
      for (const k of ['release', 'expect-hash', 'actor', 'reason']) if (typeof a[k] !== 'string') throw new Error(`--${k} majburiy`);
      const bp = backupProblem(a);
      if (bp) throw new Error(`Zaxira tekshiruvi: ${bp}`);
      const r = await releases.activate({ releaseId: a.release as string, expectHash: a['expect-hash'] as string, actor: a.actor as string, reason: a.reason as string });
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'export') {
      if (typeof a.release !== 'string' || typeof a.out !== 'string') throw new Error('--release va --out majburiy');
      console.log(JSON.stringify(await exportRelease(prisma as unknown as PrismaClient, await releases.bundle(a.release), a.release, a.out)));
    } else {
      console.error('Buyruqlar: status | import | candidate | activate | export');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
