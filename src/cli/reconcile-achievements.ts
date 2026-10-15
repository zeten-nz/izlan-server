/**
 * Achievement reconciliation (qo'lda): mavjud o'quv tarixiga ko'ra haqiqatan earned badge'larni beradi.
 * XP/IZL/bezak BERMAYDI. Idempotent: qayta ishga tushirish xavfsiz.
 *
 *   npm run build
 *   npm run achievements:reconcile                 # development
 *   npm run achievements:reconcile -- --dry-run    # faqat nimalar berilishini ko'rsatadi
 *   npm run achievements:reconcile -- --confirm    # production'da (NODE_ENV=production) majburiy
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { AchievementsService } from '../achievements/achievements.service';
import type { PrismaService } from '../prisma/prisma.service';

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  if (process.env.NODE_ENV === 'production' && !args.includes('--confirm')) {
    throw new Error("Productionda reconcile faqat ongli ravishda: --confirm bayrog'ini bering.");
  }
  const prisma = new PrismaClient();
  const svc = new AchievementsService(prisma as unknown as PrismaService);
  try {
    // Faqat o'quv faoliyati bor foydalanuvchilar
    const users = await prisma.user.findMany({
      where: { role: 'STUDENT', OR: [{ lessonProgress: { some: { completedAt: { not: null } } } }, { quizAttempts: { some: {} } }, { topicCompletions: { some: {} } }] },
      select: { id: true },
    });
    let granted = 0;
    for (const u of users) {
      if (dry) {
        const m = await svc.metrics(prisma as unknown as PrismaService, u.id);
        console.log(u.id, JSON.stringify(m));
        continue;
      }
      granted += (await svc.reconcileUser(u.id)).length;
    }
    console.log(dry ? `Tekshirildi: ${users.length} foydalanuvchi (hech narsa yozilmadi)` : `Tayyor: ${users.length} foydalanuvchi tekshirildi, ${granted} ta yangi badge berildi.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
