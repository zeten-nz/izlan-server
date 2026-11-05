import type { CosmeticKind, PrismaClient, Rarity } from "@prisma/client";

/**
 * Boshlang'ich 12 ta bezak. Barqaror slug = dizayn kaliti (server/src/profile/cosmetic-registry.ts).
 * Faqat YO'Q bezaklar yaratiladi: mavjudiga (admin o'zgartirgan nom/holat) tegilmaydi. Narx berilmaydi, egalik berilmaydi.
 */
const ITEMS: { slug: string; kind: CosmeticKind; rarity: Rarity; name: string; description: string }[] = [
  { slug: "ramka-minimal", kind: "FRAME", rarity: "COMMON", name: "Minimal", description: "Toza, ikki qatlamli oddiy ramka." },
  { slug: "ramka-neon", kind: "FRAME", rarity: "RARE", name: "Neon", description: "Burchaklari yorqin ko'k va lime chiziqli ramka." },
  { slug: "ramka-koinot", kind: "FRAME", rarity: "EPIC", name: "Koinot", description: "Yulduzlar va orbita chizig'i bilan o'ralgan ramka." },
  { slug: "ramka-oltin-meros", kind: "FRAME", rarity: "LEGENDARY", name: "Oltin meros", description: "Toj shaklli oltin ramka, burchaklarida mustahkam qirralar." },
  { slug: "banner-izlanuvchi", kind: "BANNER", rarity: "COMMON", name: "Izlanuvchi", description: "Lime fon, nuqtalar va kattalashtirgich belgisi." },
  { slug: "banner-bilim-tolqini", kind: "BANNER", rarity: "RARE", name: "Bilim to'lqini", description: "Ko'k fon ustida uch qatlamli to'lqinlar." },
  { slug: "banner-ilm-galaktikasi", kind: "BANNER", rarity: "EPIC", name: "Ilm galaktikasi", description: "Qorong'u osmon, yulduzlar va sayyora orbitasi." },
  { slug: "banner-afsonaviy-tafakkur", kind: "BANNER", rarity: "LEGENDARY", name: "Afsonaviy tafakkur", description: "Oltin nurlar va tojli zigzag naqsh." },
  { slug: "unvon-yangi-izlanuvchi", kind: "TITLE", rarity: "COMMON", name: "Yangi izlanuvchi", description: "Yo'lni endi boshlaganlar uchun." },
  { slug: "unvon-bilimdon", kind: "TITLE", rarity: "RARE", name: "Bilimdon", description: "Bilimi barqaror o'sayotganlar uchun." },
  { slug: "unvon-ilm-kashfiyotchisi", kind: "TITLE", rarity: "EPIC", name: "Ilm kashfiyotchisi", description: "Yangi cho'qqilarni kashf etganlar uchun." },
  { slug: "unvon-bilim-afsonasi", kind: "TITLE", rarity: "LEGENDARY", name: "Bilim afsonasi", description: "Eng yuqori maqom." },
];

export async function seedCosmetics(prisma: PrismaClient): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];
  for (const i of ITEMS) {
    const found = await prisma.cosmeticItem.findUnique({ where: { slug: i.slug }, select: { id: true } });
    if (found) {
      existing.push(i.slug);
      continue;
    }
    await prisma.cosmeticItem.create({
      data: { ...i, priceXp: null, status: "ACTIVE", preview: { key: i.slug } },
    });
    created.push(i.slug);
  }
  return { created, existing };
}
