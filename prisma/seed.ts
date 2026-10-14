/**
 * Boshlang'ich ma'lumotlar (QO'LDA ishga tushiriladi). Takroriy ishga tushirish xavfsiz: mavjud ADMIN, uning paroli va
 * Admin panel orqali yaratilgan/o'zgartirilgan katalogni hech qachon ustiga yozmaydi yoki o'chirmaydi.
 *
 *   npm run db:seed            # admin + katalog (ikkalasi ham xavfsiz)
 *   npm run db:seed:admin      # faqat dastlabki ADMIN
 *   npm run db:seed:catalog    # faqat demo katalog (faqat katalog bo'sh bo'lsa)
 *   npm run db:seed:cosmetics  # boshlang'ich 12 ta bezak (faqat yo'qlarini yaratadi; narx/egalik yo'q)
 *   npm run db:seed:catalog -- --missing   # faqat yo'q yo'nalishlarni qo'shadi (mavjudiga tegmaydi)
 *
 * Dastlabki ADMIN muhit o'zgaruvchilaridan olinadi (parol kodda yo'q): ./seed/admin.ts ga qarang.
 * PRODUCTIONDA (NODE_ENV=production) tasodifan ishga tushmasligi uchun `--confirm` (yoki SEED_CONFIRM=yes) shart.
 * `prisma migrate deploy` seed'ni ishga tushirmaydi; faqat dev'dagi `migrate dev|reset` ishga tushiradi.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedAdmin } from "./seed/admin";
import { seedCatalog } from "./seed/catalog";
import { seedCosmetics } from "./seed/cosmetics";

type Part = "admin" | "catalog" | "cosmetics" | "all";

async function main() {
  const args = process.argv.slice(2);
  const part = (args.find((a) => !a.startsWith("--")) ?? "all") as Part;
  if (!["admin", "catalog", "cosmetics", "all"].includes(part)) throw new Error(`Noma'lum bo'lim: ${part} (admin | catalog | cosmetics | all)`);

  if (process.env.NODE_ENV === "production" && !args.includes("--confirm") && process.env.SEED_CONFIRM !== "yes") {
    throw new Error("Productionda seed faqat ongli ravishda ishga tushiriladi: --confirm bayrog'ini bering (yoki SEED_CONFIRM=yes).");
  }

  const prisma = new PrismaClient();
  try {
    if (part === "admin" || part === "all") {
      const r = await seedAdmin(prisma);
      if (r.status === "created") console.log(`✔ Dastlabki ADMIN yaratildi: ${r.username} (${r.email}). /login orqali kiring, so'ng SEED_ADMIN_PASSWORD ni muhitdan olib tashlang.`);
      else if (r.status === "exists") console.log(`• ADMIN allaqachon bor (${r.count} ta): akkaunt va parolga tegilmadi.`);
      else console.log(`• ${r.reason}`);
    }
    if (part === "catalog" || part === "all") {
      const r = await seedCatalog(prisma, { onlyIfEmpty: !args.includes("--missing") });
      if (r.skipped) console.log(`• ${r.skipped}`);
      else {
        const c = r.counts;
        console.log(
          `✔ Katalog: yaratildi [${r.created.join(", ") || "—"}]; mavjud, tegilmadi [${r.existing.join(", ") || "—"}]` +
            (r.created.length ? ` — ${c.levels} daraja, ${c.topics} mavzu, ${c.rules} qoida, ${c.questions} savol` : ""),
        );
      }
    }
    if (part === "cosmetics" || part === "all") {
      const r = await seedCosmetics(prisma);
      console.log(`✔ Bezaklar: yaratildi ${r.created.length} ta, mavjud (tegilmadi) ${r.existing.length} ta. Narx va egalik berilmadi.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
