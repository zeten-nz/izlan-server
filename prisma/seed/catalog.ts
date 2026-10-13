import type { DirectionKind, PrismaClient } from "@prisma/client";
import { INSTRUCTION, LEVELS, QUESTIONS, RULES } from "./english";

/**
 * Demo/boshlang'ich katalog: Yo'nalishlar ro'yxati va Ingliz tili (A1-C2, mavzu, qoida, savol).
 *
 * Qoidalar (takroran ishga tushirish xavfsiz):
 * - HECH QACHON mavjud yozuvni yangilamaydi yoki o'chirmaydi (admin CRUD o'zgarishlari saqlanadi).
 * - Standart rejim: faqat katalog BO'SH bo'lsa (bitta ham yo'nalish yo'q) yaratadi.
 * - `--missing` rejimi: faqat bazada yo'q yo'nalishlarni (slug bo'yicha) butun ichki tarkibi bilan yaratadi;
 *   mavjud yo'nalishning daraja/mavzu/savollariga tegmaydi.
 */

type DirectionSeed = { slug: string; kind: DirectionKind; title: string; description: string; active: boolean };

/** Hozircha faqat inglis tili to'liq (daraja, mavzu, savol); qolganlari "Tez orada". */
const DIRECTIONS: DirectionSeed[] = [
  { slug: "english", kind: "LANGUAGE", title: "Ingliz tili", description: "A1 dan C2 gacha: grammatika, lug'at va mashqlar.", active: true },
  { slug: "russian", kind: "LANGUAGE", title: "Rus tili", description: "Noldan ravon gapirishgacha.", active: false },
  { slug: "german", kind: "LANGUAGE", title: "Nemis tili", description: "Study va ish uchun asos.", active: false },
  { slug: "turkish", kind: "LANGUAGE", title: "Turk tili", description: "Kundalik muloqot va grammatika.", active: false },
  { slug: "korean", kind: "LANGUAGE", title: "Koreys tili", description: "Hangul va asosiy iboralar.", active: false },
  { slug: "math", kind: "SUBJECT", title: "Matematika", description: "Maktab dasturi va abituriyentlar uchun.", active: false },
  { slug: "physics", kind: "SUBJECT", title: "Fizika", description: "Tushunib o'rganish, formulalarsiz yodlashsiz.", active: false },
  { slug: "chemistry", kind: "SUBJECT", title: "Kimyo", description: "Reaksiyalar va masalalar.", active: false },
  { slug: "biology", kind: "SUBJECT", title: "Biologiya", description: "Hayot haqidagi fan.", active: false },
  { slug: "history", kind: "SUBJECT", title: "Tarix", description: "O'zbekiston va jahon tarixi.", active: false },
];

export type CatalogSeedResult = {
  skipped?: string;
  created: string[];
  existing: string[];
  counts: { levels: number; topics: number; rules: number; questions: number };
};

export async function seedCatalog(prisma: PrismaClient, opts: { onlyIfEmpty: boolean }): Promise<CatalogSeedResult> {
  const result: CatalogSeedResult = { created: [], existing: [], counts: { levels: 0, topics: 0, rules: 0, questions: 0 } };
  if (opts.onlyIfEmpty && (await prisma.direction.count()) > 0) {
    result.skipped = "Katalog bo'sh emas: hech narsa o'zgartirilmadi (faqat bo'sh bazaga demo katalog yaratiladi).";
    return result;
  }

  for (const d of DIRECTIONS) {
    if (await prisma.direction.findUnique({ where: { slug: d.slug }, select: { id: true } })) {
      result.existing.push(d.slug);
      continue;
    }
    // Yo'nalish va uning ichki tarkibi bitta tranzaksiyada: yarim yaratilgan holat qolmaydi
    await prisma.$transaction(
      async (tx) => {
        const max = await tx.direction.aggregate({ _max: { sortOrder: true } });
        const direction = await tx.direction.create({ data: { ...d, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
        if (d.slug === "english") await createEnglish(tx, direction.id, result.counts);
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    result.created.push(d.slug);
  }
  return result;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function createEnglish(tx: Tx, directionId: string, counts: CatalogSeedResult["counts"]) {
  const levelIds = new Map<string, string>(); // code → id
  const topicIds = new Map<string, string>(); // `${code}:${ord}` → id
  for (const [li, lv] of LEVELS.entries()) {
    const level = await tx.level.create({
      data: { directionId, code: lv.code, ord: li + 1, title: lv.title, summary: lv.summary, canDo: lv.canDo, vocabHint: lv.vocabHint },
    });
    levelIds.set(lv.code, level.id);
    counts.levels++;
    for (const [ti, title] of lv.topics.entries()) {
      const topic = await tx.topic.create({ data: { levelId: level.id, ord: ti + 1, title } });
      topicIds.set(`${lv.code}:${ti + 1}`, topic.id);
      counts.topics++;
    }
  }

  const ruleIds = new Map<string, { id: string; topicId: string; levelCode: string }>();
  for (const r of RULES) {
    const topicId = topicIds.get(`${r.level}:${r.topic}`);
    if (!topicId) throw new Error(`Mavzu topilmadi: ${r.key}`);
    const row = await tx.rule.create({
      data: { key: r.key, topicId, title: r.title, tipTitle: r.tipTitle, tipBody: r.tipBody, remember: r.remember },
    });
    ruleIds.set(r.key, { id: row.id, topicId, levelCode: r.level });
    counts.rules++;
  }

  for (const [code, list] of Object.entries(QUESTIONS)) {
    for (const [i, q] of list.entries()) {
      const rule = ruleIds.get(q.rule);
      if (!rule || rule.levelCode !== code) throw new Error(`Qoida mos emas: ${code} / ${q.rule}`);
      if (!q.prompt.includes("_____") && !q.prompt.includes("→")) throw new Error(`Bo'sh joy yo'q: ${q.prompt}`);
      const blankFilled = q.prompt.includes("_____") ? q.prompt.replace("_____", q.options[q.correct]) : q.prompt;
      await tx.question.create({
        data: {
          key: `en-${code.toLowerCase()}-${String(i + 1).padStart(2, "0")}`,
          directionId,
          levelId: levelIds.get(code)!,
          topicId: rule.topicId,
          ruleId: rule.id,
          prompt: q.prompt,
          instruction: INSTRUCTION,
          options: q.options,
          correctIndex: q.correct,
          correctSentence: blankFilled,
          note: q.note,
        },
      });
      counts.questions++;
    }
  }
}
