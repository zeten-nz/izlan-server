/**
 * A1: 4–37-darslar va 7 ta mavzu testi QORALAMA sifatida (nashr qilinmaydi).
 *
 *   npx tsx prisma/seed/lessons-a1.ts --tts <ro'yxat.txt>             # kerakli audiolar ro'yxati (TTS uchun)
 *   npx tsx prisma/seed/lessons-a1.ts --audio <mp3 papka> [--author ustoz_1]
 *
 * - Bir xil nomli dars mavzuda allaqachon bo'lsa — o'tkaziladi (qayta ishga tushirish xavfsiz).
 * - Mavzu testi bo'lmasa — yaratiladi; faqat tegilmagan qoralama (rev 1, nashr va urinishsiz) bo'lsa — yangilanadi.
 * - Audio: <papka>/<nom>.mp3 → Asset ("(qoralama TTS)"). Rasm: joy + topshiriq (nima kerak, qidiruv so'zi).
 */
import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDoc, publishIssues } from "../../src/lessons/doc.schema";
import { parseQuestions } from "../../src/quiz/quiz.rules";
import { LessonBuilder, quizQuestions, type AudioJob, type LessonSpec } from "./a1/builder";
import { MODULE0 } from "./a1/module0";
import { QUIZZES } from "./a1/quizzes";
import { TOPICS } from "./a1/topics";

const prisma = new PrismaClient();
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const LESSONS: LessonSpec[] = [...MODULE0, ...TOPICS];

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
  const t = await prisma.topic.findFirst({ where: { title, level: { code: "A1", direction: { slug: "english" } } }, select: { id: true } });
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

async function provision(dir: string, authorName: string) {
  const author = await prisma.user.findUnique({ where: { username: authorName }, select: { id: true, role: true } });
  if (!author || (author.role !== "ADMIN" && author.role !== "TEACHER")) throw new Error(`Muallif topilmadi yoki ustoz/admin emas: ${authorName}`);

  let created = 0;
  for (const spec of LESSONS) {
    const tid = await topicId(spec.topic);
    if (await prisma.lesson.findFirst({ where: { topicId: tid, title: spec.title }, select: { id: true } })) {
      console.log(`• ${spec.title}: allaqachon bor`);
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
