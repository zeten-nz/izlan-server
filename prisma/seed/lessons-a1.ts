/**
 * Ingliz tili darslari va mavzu testlari QORALAMA sifatida (nashr qilinmaydi).
 * A1: 4–41-darslar + 7 test. A2: 45 dars, B1–C2: 44 dars + 12 test (yetishmagan mavzular katalogga qo'shiladi,
 * takroriy katalog mavzulari qayta nomlanadi, tartib rejaga moslanadi).
 *
 *   npx tsx prisma/seed/lessons-a1.ts [--level A2|B1|B2|C1|C2] --tts <ro'yxat.txt>            # kerakli audiolar ro'yxati (TTS uchun)
 *   npx tsx prisma/seed/lessons-a1.ts [--level A2|B1|B2|C1|C2] --audio <mp3 papka> [--author ustoz_1] [--refresh] [--reorder]
 *       [--direction ingliz-tili] [--rename "eski=yangi"]   # production: yo'nalish slug'i va mavzuni qayta nomlash
 * - Daraja yo'q bo'lsa english.ts ma'lumoti bilan yaratiladi; mavjud mavzular o'chirilmaydi.
 *
 * - Bir xil nomli dars mavzuda allaqachon bo'lsa — o'tkaziladi (qayta ishga tushirish xavfsiz).
 * - Mavzu testi bo'lmasa — yaratiladi; faqat tegilmagan qoralama (rev 1, nashr va urinishsiz) bo'lsa — yangilanadi.
 * - Audio: <papka>/<nom>.mp3 → Asset ("(qoralama TTS)"). Rasm: joy + topshiriq (nima kerak, qidiruv so'zi).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDoc, publishIssues } from "../../src/lessons/doc.schema";
import { parseQuestions } from "../../src/quiz/quiz.rules";
import { LessonBuilder, quizQuestions, type AudioJob, type LessonSpec, type QuizSpec } from "./a1/builder";
import { MODULE0 } from "./a1/module0";
import { QUIZZES as A1_QUIZZES } from "./a1/quizzes";
import { TOPICS } from "./a1/topics";
import { A2_TOPIC_ORDER } from "./a2/catalog";
import { A2_PART1 } from "./a2/part1";
import { A2_PART2 } from "./a2/part2";
import { A2_PART3 } from "./a2/part3";
import { A2_QUIZZES } from "./a2/quizzes";
import { B1_RENAMES, B1_TOPIC_ORDER } from "./b1/catalog";
import { B1_PART1 } from "./b1/part1";
import { B1_PART2 } from "./b1/part2";
import { B1_PART3 } from "./b1/part3";
import { B1_QUIZZES } from "./b1/quizzes";
import { B2_RENAMES, B2_TOPIC_ORDER } from "./b2/catalog";
import { B2_PART1 } from "./b2/part1";
import { B2_PART2 } from "./b2/part2";
import { B2_PART3 } from "./b2/part3";
import { B2_QUIZZES } from "./b2/quizzes";
import { C1_RENAMES, C1_TOPIC_ORDER } from "./c1/catalog";
import { C1_PART1 } from "./c1/part1";
import { C1_PART2 } from "./c1/part2";
import { C1_PART3 } from "./c1/part3";
import { C1_QUIZZES } from "./c1/quizzes";
import { C2_RENAMES, C2_TOPIC_ORDER } from "./c2/catalog";
import { C2_PART1 } from "./c2/part1";
import { C2_PART2 } from "./c2/part2";
import { C2_PART3 } from "./c2/part3";
import { C2_QUIZZES } from "./c2/quizzes";
import { LEVELS } from "./english";

const prisma = new PrismaClient();
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const LEVEL = arg("level") ?? "A1";
/** Yo'nalish slug'i: lokalda "english", productionda boshqacha bo'lishi mumkin (masalan "ingliz-tili"). */
const DIRECTION = arg("direction") ?? "english";
/** Qo'shimcha qayta nomlash: --rename "test 1=Alifbo va o'qish" (faqat eski nom bor va yangisi yo'q bo'lsa). */
const CLI_RENAMES: Record<string, string> = Object.fromEntries(
  [arg("rename")].filter((x): x is string => !!x).map((r) => r.split("=").map((p) => p.trim()) as [string, string]),
);
const A1_TOPIC_ORDER = [...new Set([...MODULE0, ...TOPICS].map((s) => s.topic))];
const CONTENT: Record<string, { lessons: LessonSpec[]; quizzes: QuizSpec[]; topicOrder?: string[]; renames?: Record<string, string> }> = {
  A1: { lessons: [...MODULE0, ...TOPICS], quizzes: A1_QUIZZES, topicOrder: A1_TOPIC_ORDER },
  A2: { lessons: [...A2_PART1, ...A2_PART2, ...A2_PART3], quizzes: A2_QUIZZES, topicOrder: A2_TOPIC_ORDER },
  B1: { lessons: [...B1_PART1, ...B1_PART2, ...B1_PART3], quizzes: B1_QUIZZES, topicOrder: B1_TOPIC_ORDER, renames: B1_RENAMES },
  B2: { lessons: [...B2_PART1, ...B2_PART2, ...B2_PART3], quizzes: B2_QUIZZES, topicOrder: B2_TOPIC_ORDER, renames: B2_RENAMES },
  C1: { lessons: [...C1_PART1, ...C1_PART2, ...C1_PART3], quizzes: C1_QUIZZES, topicOrder: C1_TOPIC_ORDER, renames: C1_RENAMES },
  C2: { lessons: [...C2_PART1, ...C2_PART2, ...C2_PART3], quizzes: C2_QUIZZES, topicOrder: C2_TOPIC_ORDER, renames: C2_RENAMES },
};
if (!CONTENT[LEVEL]) throw new Error(`Noma'lum daraja: ${LEVEL}`);
const LESSONS = CONTENT[LEVEL].lessons;
const QUIZZES = CONTENT[LEVEL].quizzes;

/**
 * Daraja mavzulari rejadagi tartibda bo'lishi uchun: yo'q mavzular yaratiladi, ord rejaga moslanadi.
 * Rejada yo'q mavzular (ustoz qo'shgan bo'lsa) oxiriga suriladi — hech biri o'chirilmaydi.
 */
async function ensureTopicOrder(order: string[], renames: Record<string, string> = {}) {
  const level = await ensureLevel();
  await prisma.$transaction(async (tx) => {
    const topics = await tx.topic.findMany({ where: { levelId: level.id }, select: { id: true, title: true, ord: true } });
    // Qayta nomlash: faqat eski nom bor va yangi nom hali yo'q bo'lsa (mavzu ID, darslar va natijalar saqlanadi)
    for (const [from, to] of Object.entries(renames)) {
      const t = topics.find((x) => x.title === from);
      if (!t || topics.some((x) => x.title === to)) continue;
      await tx.topic.update({ where: { id: t.id }, data: { title: to } });
      t.title = to;
      console.log(`✎ mavzu qayta nomlandi: ${from} → ${to}`);
    }
    // Avval hammasini vaqtincha katta ord'ga suramiz (@@unique([levelId, ord]) to'qnashmasin)
    for (const t of topics) await tx.topic.update({ where: { id: t.id }, data: { ord: t.ord + 10_000 } });
    let ord = 0;
    for (const title of order) {
      const t = topics.find((x) => x.title === title);
      if (t) await tx.topic.update({ where: { id: t.id }, data: { ord: ++ord } });
      else {
        await tx.topic.create({ data: { levelId: level.id, ord: ++ord, title } });
        console.log(`+ yangi mavzu: ${title}`);
      }
    }
    for (const t of topics.filter((x) => !order.includes(x.title))) await tx.topic.update({ where: { id: t.id }, data: { ord: ++ord } });
  });
}

/** Daraja yo'q bo'lsa — english.ts dagi ma'lumot bilan yaratiladi (mavjudiga tegilmaydi). */
async function ensureLevel() {
  const direction = await prisma.direction.findUnique({ where: { slug: DIRECTION }, select: { id: true } });
  if (!direction) throw new Error(`Yo'nalish topilmadi: ${DIRECTION} (--direction <slug> bering)`);
  const found = await prisma.level.findFirst({ where: { directionId: direction.id, code: LEVEL }, select: { id: true } });
  if (found) return found;
  const idx = LEVELS.findIndex((l) => l.code === LEVEL);
  if (idx < 0) throw new Error(`english.ts da ${LEVEL} yo'q`);
  const lv = LEVELS[idx];
  const taken = await prisma.level.findMany({ where: { directionId: direction.id }, select: { ord: true } });
  const ord = taken.some((t) => t.ord === idx + 1) ? Math.max(0, ...taken.map((t) => t.ord)) + 1 : idx + 1;
  const created = await prisma.level.create({
    data: { directionId: direction.id, code: lv.code, ord, title: lv.title, summary: lv.summary, canDo: lv.canDo, vocabHint: lv.vocabHint },
    select: { id: true },
  });
  console.log(`+ yangi daraja: ${lv.code} · ${lv.title} (ord ${ord})`);
  return created;
}

/** TTS ro'yxati: "nom|ovoz|matn" (bitta) yoki "nom|+|ovoz:matn||ovoz:matn" (suhbat). */
async function writeTtsList(file: string) {
  const jobs = new Map<string, AudioJob>();
  for (const spec of LESSONS) {
    const b = new LessonBuilder();
    b.build(spec);
    for (const [k, v] of b.jobs) jobs.set(k, v);
  }
  const lines = [...jobs.values()].map((j) =>
    "text" in j ? `${j.name}|${j.voice}|${j.text}` : `${j.name}|+|${j.parts.map((p) => `${p.voice}:${p.text}`).join("||")}`,
  );
  await writeFile(file, lines.join("\n"), "utf8");
  console.log(`✔ ${lines.length} ta audio ro'yxati: ${file}`);
}

async function topicId(title: string) {
  const t = await prisma.topic.findFirst({ where: { title, level: { code: LEVEL, direction: { slug: DIRECTION } } }, select: { id: true } });
  if (!t) throw new Error(`Mavzu topilmadi: ${title}`);
  return t.id;
}

const assetCache = new Map<string, string>();
async function audioAsset(dir: string, ownerId: string, name: string) {
  const hit = assetCache.get(name);
  if (hit) return hit;
  const data = await readFile(path.join(dir, `${name}.mp3`));
  const row = await prisma.asset.create({ data: { ownerId, kind: "AUDIO", mime: "audio/mpeg", size: data.length, originalName: `${name}.mp3 (qoralama TTS)` } });
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, row.id), data);
  assetCache.set(name, row.id);
  return row.id;
}

/**
 * --refresh: qolip yoki matn o'zgarganda tegilmagan qoralamani joyida qayta quradi. Faqat bitta DRAFT (rev 1),
 * nashrsiz dars. Audio asset'lar blok ID bo'yicha eski hujjatdan olinadi (tuzilish bir xil bo'lishi shart).
 */
async function refresh(spec: LessonSpec, lesson: { id: string; publishedVersionId: string | null; versions: { id: string; status: string; rev: number; doc: unknown }[] }) {
  const v = lesson.versions;
  if (lesson.publishedVersionId || v.length !== 1 || v[0].status !== "DRAFT" || v[0].rev !== 1) {
    console.log(`• ${spec.title}: tahrirlangan yoki nashr qilingan — tegilmadi`);
    return;
  }
  const old = parseDoc(v[0].doc);
  if (!old.ok) throw new Error(`${spec.title}: eski hujjat yaroqsiz`);
  const oldAudio = new Map(old.doc.pages.flatMap((p) => p.blocks).filter((b) => b.type === "audio").map((b) => [b.id, b.type === "audio" ? b.assetId : null]));
  const b = new LessonBuilder();
  const doc = b.build(spec);
  for (const blk of doc.pages.flatMap((p) => p.blocks)) {
    if (blk.type !== "audio") continue;
    const assetId = oldAudio.get(blk.id);
    if (!assetId) throw new Error(`${spec.title}: ${blk.id} uchun eski audio topilmadi — tuzilish o'zgargan`);
    blk.assetId = assetId;
  }
  if (oldAudio.size !== b.audioRefs.size) throw new Error(`${spec.title}: audio bloklar soni o'zgargan`);
  const parsed = parseDoc(doc);
  if (!parsed.ok) throw new Error(`${spec.title}: ${JSON.stringify(parsed.issues)}`);
  await prisma.lessonVersion.update({ where: { id: v[0].id }, data: { doc: parsed.doc as object } });
  console.log(`↻ ${spec.title}: yangilandi`);
}

async function provision(dir: string, authorName: string) {
  const author = await prisma.user.findUnique({ where: { username: authorName }, select: { id: true, role: true } });
  if (!author || (author.role !== "ADMIN" && author.role !== "TEACHER")) throw new Error(`Muallif topilmadi yoki ustoz/admin emas: ${authorName}`);
  const order = CONTENT[LEVEL].topicOrder;
  if (order) await ensureTopicOrder(order, { ...CONTENT[LEVEL].renames, ...CLI_RENAMES });

  let created = 0;
  for (const spec of LESSONS) {
    const tid = await topicId(spec.topic);
    const existing = await prisma.lesson.findFirst({
      where: { topicId: tid, title: spec.title },
      select: { id: true, publishedVersionId: true, versions: { select: { id: true, status: true, rev: true, doc: true } } },
    });
    if (existing) {
      if (process.argv.includes("--refresh")) await refresh(spec, existing);
      else console.log(`• ${spec.title}: allaqachon bor`);
      continue;
    }
    const b = new LessonBuilder();
    const doc = b.build(spec);
    for (const p of doc.pages) {
      for (const blk of p.blocks) {
        const name = b.audioRefs.get(blk.id);
        if (name && blk.type === "audio") blk.assetId = await audioAsset(dir, author.id, name);
      }
    }
    const parsed = parseDoc(doc);
    if (!parsed.ok) throw new Error(`${spec.title}: ${JSON.stringify(parsed.issues)}`);
    const last = await prisma.lesson.aggregate({ where: { topicId: tid }, _max: { sortOrder: true } });
    const lesson = await prisma.lesson.create({ data: { topicId: tid, authorId: author.id, title: spec.title, sortOrder: (last._max.sortOrder ?? 0) + 100 } });
    await prisma.lessonVersion.create({ data: { lessonId: lesson.id, status: "DRAFT", doc: parsed.doc as object } });
    const left = publishIssues(parsed.doc);
    const notImage = left.filter((i) => !/rasm/.test(i.message));
    if (notImage.length) throw new Error(`${spec.title}: rasmdan boshqa nashr muammosi: ${JSON.stringify(notImage)}`);
    created++;
    console.log(`✔ ${spec.title}: ${parsed.doc.pages.length} sahifa · ${left.length} ta rasm joyi`);
  }

  // --reorder: rejadagi mavzular ichida darslarni «N-dars.» raqami bo'yicha tartiblaydi (raqamsizlar oxirida qoladi)
  if (process.argv.includes("--reorder")) {
    for (const topic of new Set(LESSONS.map((s) => s.topic))) {
      const tid = await topicId(topic);
      const rows = await prisma.lesson.findMany({ where: { topicId: tid }, select: { id: true, title: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
      // «N-dars.» raqami bo'yicha (boshqa skriptdan yaratilgan 1–3-darslar ham to'g'ri joyga tushadi); raqamsizlar oxirida
      const num = (t: string) => Number(/^(\d+)-dars\./.exec(t)?.[1] ?? Infinity);
      const ordered = [...rows].sort((a, b) => num(a.title) - num(b.title) || a.sortOrder - b.sortOrder);
      for (const [i, r] of ordered.entries()) if (r.sortOrder !== (i + 1) * 100) await prisma.lesson.update({ where: { id: r.id }, data: { sortOrder: (i + 1) * 100 } });
    }
    console.log("↕ darslar tartibi rejaga moslandi");
  }

  for (const q of QUIZZES) {
    const tid = await topicId(q.topic);
    const parsed = parseQuestions(quizQuestions(q), { forPublish: true });
    if (!parsed.ok) throw new Error(`${q.topic} testi: ${parsed.error}`);
    const questions = parsed.questions as unknown as object;
    const existing = await prisma.topicQuiz.findUnique({
      where: { topicId: tid },
      select: { id: true, versions: { select: { id: true, status: true, rev: true, _count: { select: { attempts: true } } } } },
    });
    if (!existing) {
      const quiz = await prisma.topicQuiz.create({ data: { topicId: tid, authorId: author.id, title: `${q.topic} — mavzu testi` } });
      await prisma.quizVersion.create({ data: { quizId: quiz.id, status: "DRAFT", questions } });
      console.log(`✔ Test «${q.topic}»: ${parsed.questions.length} savol`);
      continue;
    }
    const untouched = existing.versions.length === 1 && existing.versions[0].status === "DRAFT" && existing.versions[0].rev === 1 && existing.versions[0]._count.attempts === 0;
    if (!untouched) {
      console.log(`• Test «${q.topic}»: tahrirlangan yoki nashr qilingan — tegilmadi`);
      continue;
    }
    await prisma.quizVersion.update({ where: { id: existing.versions[0].id }, data: { questions } });
    console.log(`✔ Test «${q.topic}»: yangilandi (${parsed.questions.length} savol)`);
  }
  console.log(`Jami yangi darslar: ${created}`);
}

async function main() {
  const tts = arg("tts");
  if (tts) return writeTtsList(tts);
  const dir = arg("audio");
  if (!dir) throw new Error("--tts <fayl> yoki --audio <papka> kerak");
  await provision(dir, arg("author") ?? "ustoz_1");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
