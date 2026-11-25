/**
 * Ingliz tili daraja aniqlash banki — idempotent sync (placement-en.ts).
 *  - Yangi qoidalar: kalit bo'yicha, yo'q bo'lsa yaratiladi (mavjudiga tegilmaydi — admin tahrirlagan bo'lishi mumkin).
 *  - Savollar: kalit bo'yicha; yo'q bo'lsa yaratiladi, fayldagidan farq qilsa yangilanadi. Hech narsa o'chirilmaydi
 *    (UserMistake savolga bog'langan).
 *  - Mavzu NOMI bo'yicha topiladi (lessons seed mavzularni qayta nomlagan/qo'shgan). Topilmasa — xato, hech narsa yozilmaydi.
 * Bitta tranzaksiya: yarim yozilgan holat qolmaydi.
 */
import type { PrismaClient } from "@prisma/client";
import { INSTRUCTION, QUESTIONS, type QuestionSeed } from "./english";
import { FIXES, NEW_QUESTIONS, NEW_RULES, newQuestionKey, type PlacementQuestionSeed } from "./placement-en";

export type PlacementSeedResult = {
  rulesCreated: string[];
  created: string[];
  updated: string[];
  unchanged: number;
  perLevel: Record<string, number>;
};

/** Seed'dan oldingi statik tekshiruv (DB'siz, testda ham ishlatiladi). Xatolar ro'yxati; bo'sh — toza. */
export function validatePlacementBank(): string[] {
  const errors: string[] = [];
  const ruleLevel = new Map<string, string>();
  for (const r of NEW_RULES) {
    if (ruleLevel.has(r.key)) errors.push(`takroriy qoida: ${r.key}`);
    ruleLevel.set(r.key, r.level);
    if (!r.key.startsWith(r.level.toLowerCase() + "-")) errors.push(`qoida kaliti darajaga mos emas: ${r.key}`);
  }
  const all = finalBank();
  const prompts = new Map<string, string>();
  for (const q of all) {
    const at = `${q.key}`;
    if (q.options.length !== 4) errors.push(`${at}: 4 ta variant bo'lishi kerak`);
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length) errors.push(`${at}: takroriy variant`);
    if (q.correct < 0 || q.correct >= q.options.length) errors.push(`${at}: to'g'ri javob indeksi noto'g'ri`);
    if ((q.prompt.match(/_____/g) ?? []).length !== 1 && !q.prompt.includes("→")) errors.push(`${at}: bitta "_____" bo'lishi kerak`);
    if (!q.note.trim()) errors.push(`${at}: izoh yo'q`);
    const lvl = ruleLevel.get(q.rule) ?? q.rule.slice(0, 2).toUpperCase();
    if (lvl !== q.level) errors.push(`${at}: qoida (${q.rule}) darajasi ${lvl}, savol ${q.level}`);
    const p = q.prompt.trim().toLowerCase();
    if (prompts.has(p)) errors.push(`${at}: matni ${prompts.get(p)} bilan bir xil`);
    prompts.set(p, at);
  }
  return errors;
}

/**
 * Variantlar tartibi kalitdan deterministik: placement-en.ts da to'g'ri javob ko'pincha birinchi yozilgan (qulay
 * mualliflik), lekin o'quvchiga "doim birinchisi" qolipi ko'rinmasligi kerak. Bir xil kalit — doim bir xil tartib
 * (qayta seed savolni o'zgartirmaydi). Boshlang'ich 72 ta savolga ham qo'llanadi (ularda javob ko'pincha 2-variant edi).
 * Tartib o'zgarsa, o'quvchilarning UserMistake.lastChoice indekslari variant matni bo'yicha qayta moslanadi (seedPlacement).
 */
export function shuffleForKey<T extends { options: [string, string, string, string]; correct: 0 | 1 | 2 | 3 }>(key: string, q: T): T {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const idx = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const options = idx.map((i) => q.options[i]) as T["options"];
  return { ...q, options, correct: idx.indexOf(q.correct) as T["correct"] };
}

/** english.ts dagi 72 ta savol (FIXES qo'llangan) + yangilari — yakuniy bank. */
export function finalBank(): Array<PlacementQuestionSeed & { key: string }> {
  const out: Array<PlacementQuestionSeed & { key: string }> = [];
  for (const [level, list] of Object.entries(QUESTIONS)) {
    list.forEach((q: QuestionSeed, i) => {
      const key = `en-${level.toLowerCase()}-${String(i + 1).padStart(2, "0")}`;
      const fix = FIXES[key];
      out.push({ key, ...shuffleForKey(key, fix ?? { level, ...q }) });
    });
  }
  for (const [level, list] of Object.entries(NEW_QUESTIONS)) {
    list.forEach((q, i) => {
      const key = newQuestionKey(level, i);
      out.push({ key, level, ...shuffleForKey(key, q) });
    });
  }
  return out;
}

export async function seedPlacement(prisma: PrismaClient, opts: { dryRun?: boolean } = {}): Promise<PlacementSeedResult> {
  const errors = validatePlacementBank();
  if (errors.length) throw new Error(`Savol banki xato:\n- ${errors.join("\n- ")}`);

  const result: PlacementSeedResult = { rulesCreated: [], created: [], updated: [], unchanged: 0, perLevel: {} };
  const direction = await prisma.direction.findUnique({
    where: { slug: "english" },
    include: { levels: { include: { topics: { select: { id: true, title: true } } } } },
  });
  if (!direction) throw new Error("english yo'nalishi topilmadi: avval `npm run db:seed:catalog`");
  const levelByCode = new Map(direction.levels.map((l) => [l.code, l]));

  const topicId = (level: string, title: string) => {
    const lv = levelByCode.get(level);
    const t = lv?.topics.find((x) => x.title === title);
    if (!t) throw new Error(`Mavzu topilmadi: ${level} / "${title}" (lessons seed ishga tushirilganmi?)`);
    return t.id;
  };

  await prisma.$transaction(
    async (tx) => {
      // 1) Qoidalar
      for (const r of NEW_RULES) {
        const exists = await tx.rule.findUnique({ where: { key: r.key }, select: { id: true } });
        if (exists) continue;
        const tId = topicId(r.level, r.topic);
        if (!opts.dryRun) {
          await tx.rule.create({ data: { key: r.key, topicId: tId, title: r.title, tipTitle: r.tipTitle, tipBody: r.tipBody, remember: r.remember } });
        }
        result.rulesCreated.push(r.key);
      }

      // 2) Savollar
      const rules = new Map((await tx.rule.findMany({ select: { id: true, key: true, topicId: true } })).map((r) => [r.key, r]));
      for (const q of finalBank()) {
        const level = levelByCode.get(q.level);
        if (!level) throw new Error(`Daraja topilmadi: ${q.level}`);
        const rule = rules.get(q.rule);
        if (!rule) {
          // dry-run: qoida hali yaratilmagan — savol yaratiladimi yoki yangilanadimi, kalit bo'yicha aniqlanadi
          if (opts.dryRun && result.rulesCreated.includes(q.rule)) {
            result.perLevel[q.level] = (result.perLevel[q.level] ?? 0) + 1;
            const exists = await tx.question.findUnique({ where: { key: q.key }, select: { id: true } });
            (exists ? result.updated : result.created).push(q.key);
            continue;
          }
          throw new Error(`Qoida topilmadi: ${q.rule} (${q.key})`);
        }
        const data = {
          directionId: direction.id,
          levelId: level.id,
          topicId: rule.topicId,
          ruleId: rule.id,
          prompt: q.prompt,
          instruction: INSTRUCTION,
          options: q.options,
          correctIndex: q.correct,
          correctSentence: q.prompt.includes("_____") ? q.prompt.replace("_____", q.options[q.correct]) : q.prompt,
          note: q.note,
        };
        result.perLevel[q.level] = (result.perLevel[q.level] ?? 0) + 1;
        const cur = await tx.question.findUnique({ where: { key: q.key } });
        if (!cur) {
          if (!opts.dryRun) await tx.question.create({ data: { key: q.key, ...data } });
          result.created.push(q.key);
          continue;
        }
        const same =
          cur.levelId === data.levelId &&
          cur.topicId === data.topicId &&
          cur.ruleId === data.ruleId &&
          cur.prompt === data.prompt &&
          cur.instruction === data.instruction &&
          cur.correctIndex === data.correctIndex &&
          cur.correctSentence === data.correctSentence &&
          cur.note === data.note &&
          JSON.stringify(cur.options) === JSON.stringify(data.options);
        if (same) {
          result.unchanged++;
          continue;
        }
        if (!opts.dryRun) {
          await tx.question.update({ where: { key: q.key }, data });
          // Variantlar faqat joyi almashgan bo'lsa — xatolardagi "oxirgi tanlov" indeksini matn bo'yicha moslash
          const sameSet = cur.options.length === data.options.length && cur.options.every((o) => data.options.includes(o));
          if (sameSet && JSON.stringify(cur.options) !== JSON.stringify(data.options)) {
            const OFFSET = 100; // ikki bosqich: indekslar o'zaro to'qnashmasin
            for (const [oldIdx, text] of cur.options.entries()) {
              await tx.userMistake.updateMany({ where: { questionId: cur.id, lastChoice: oldIdx }, data: { lastChoice: data.options.indexOf(text) + OFFSET } });
            }
            await tx.userMistake.updateMany({ where: { questionId: cur.id, lastChoice: { gte: OFFSET } }, data: { lastChoice: { decrement: OFFSET } } });
          }
        }
        result.updated.push(q.key);
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  return result;
}
