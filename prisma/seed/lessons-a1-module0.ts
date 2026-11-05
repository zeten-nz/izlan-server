/**
 * A1 · 0-modul "Alifbo va o'qish": dastlabki 3 dars QORALAMA sifatida (nashr qilinmaydi).
 *
 *   npx tsx prisma/seed/lessons-a1-module0.ts --audio <mp3 papka> [--author admin]
 *
 * - Mavzu "Alifbo va o'qish" ingliz tili A1 ning birinchi mavzusi qilib qo'shiladi (bo'lmasa).
 * - Bir xil nomli dars mavzuda allaqachon bo'lsa, o'tkazib yuboriladi (qayta ishga tushirish xavfsiz).
 * - Audio: <papka>/<nom>.mp3 → Asset. Rasm: hali yo'q, o'rniga "nima kerak + qidiruv so'zi" topshirig'i.
 * Talaffuz: amerikancha, [ ] ichida o'zbekcha yozuv (: cho'zish, ä, ə).
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDoc, publishIssues, type Block, type LessonDoc, type Page } from "../../src/lessons/doc.schema";
import { parseQuestions } from "../../src/quiz/quiz.rules";

const prisma = new PrismaClient();
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const AUDIO_DIR = arg("audio");
const AUTHOR = arg("author") ?? "admin";
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const TOPIC_TITLE = "Alifbo va o'qish";

// ───────────── Bloklar ─────────────

let seq = 0;
const nid = (p: string) => `${p}${++seq}`;
type Box = [x: number, y: number, w: number, h: number];
const frame = ([x, y, w, h]: Box) => ({ id: nid("b"), x, y, w, h, z: 0 });

const H = (text: string, box: Box = [80, 50, 1440, 90], level: 1 | 2 | 3 = 2, align: "left" | "center" = "left", caps = true): Block => ({
  ...frame(box),
  type: "heading",
  text,
  level,
  align,
  caps,
});
const T = (text: string, box: Box, align: "left" | "center" = "left"): Block => ({ ...frame(box), type: "text", text, align });
type Tone = "rule" | "example" | "tip" | "warning" | "info" | "success";
const C = (tone: Tone, title: string, text: string, box: Box): Block => ({ ...frame(box), type: "callout", tone, title, text });
const IMG = (alt: string, brief: string, search: string, box: Box): Block => ({
  ...frame(box),
  type: "image",
  assetId: null,
  alt,
  fit: "cover",
  brief,
  search,
});

/** Audio fayllar keyin (asset yaratilgach) ulanadi: bu yerda faqat nom saqlanadi. */
const audioRefs = new Map<string, string>(); // blockId → fayl nomi
const AUD = (file: string, caption: string, box: Box, transcript = ""): Block => {
  const b = { ...frame(box), type: "audio" as const, assetId: null, caption, transcript, brief: "", search: "" };
  audioRefs.set(b.id, file);
  return b;
};

const CH = (question: string, options: string[], correct: number, explanation: string, box: Box): Block => {
  const opts = options.map((text, i) => ({ id: `o${i + 1}`, text }));
  return { ...frame(box), type: "choice", question, options: opts, correctIds: [opts[correct].id], multiple: false, explanation };
};
const FB = (template: string, blanks: Record<string, string[]>, explanation: string, box: Box): Block => ({
  ...frame(box),
  type: "fillblank",
  template,
  blanks: Object.entries(blanks).map(([id, answers]) => ({ id, answers, caseSensitive: false })),
  explanation,
});

const page = (title: string, gate: Page["gate"], blocks: Block[]): Page => ({ id: nid("p"), title, gate, blocks });

// ───────────── Harf kartochkalari ─────────────

type Letter = { l: string; name: string; word: string; uz: string; brief: string; search: string };
const LETTERS: Record<string, Letter> = Object.fromEntries(
  (
    [
      ["A", "[ey]", "apple", "olma", "Bitta qizil olma, oq fonda", "red apple isolated white background"],
      ["B", "[bi:]", "book", "kitob", "Yopiq, rangli muqovali bitta kitob", "closed book isolated white background"],
      ["C", "[si:]", "cat", "mushuk", "O'tirgan yoqimli mushuk, oddiy fonda", "cute cat sitting white background"],
      ["D", "[di:]", "door", "eshik", "Yopiq yog'och eshik (old tomondan)", "wooden door front view isolated"],
      ["E", "[i:]", "egg", "tuxum", "Bitta oq yoki jigarrang tuxum", "single egg isolated white background"],
      ["F", "[ef]", "fish", "baliq", "Rangli baliq (yon tomondan), illustratsiya", "fish side view flat illustration"],
      ["G", "[ji:]", "girl", "qiz", "Tabassum qilayotgan qizcha (o'smir), oddiy fonda", "smiling teenage girl portrait plain background"],
      ["H", "[eych]", "house", "uy", "Oddiy kichik uy, illustratsiya", "small house flat illustration"],
      ["I", "[ay]", "ice cream", "muzqaymoq", "Vafli stakanchadagi muzqaymoq", "ice cream cone isolated"],
      ["J", "[jey]", "juice", "sharbat", "Bir stakan apelsin sharbati", "glass of orange juice isolated"],
      ["K", "[key]", "key", "kalit", "Bitta metall kalit", "metal key isolated white background"],
      ["L", "[el]", "lemon", "limon", "Butun sariq limon", "lemon isolated white background"],
      ["M", "[em]", "milk", "sut", "Bir stakan sut", "glass of milk isolated white background"],
      ["N", "[en]", "nose", "burun", "Yuzning burun qismi ko'rsatilgan sodda illustratsiya", "nose face part illustration for kids"],
      ["O", "[ou]", "orange", "apelsin", "Butun apelsin", "orange fruit isolated white background"],
      ["P", "[pi:]", "pen", "ruchka", "Bitta ko'k ruchka", "blue pen isolated white background"],
      ["Q", "[kyu:]", "queen", "qirolicha", "Toj kiygan qirolicha, multfilm uslubida", "queen with crown cartoon illustration"],
      ["R", "[ar]", "red", "qizil", "Qizil rangli bo'yoq dog'i yoki qizil kvadrat", "red color paint swatch"],
      ["S", "[es]", "sun", "quyosh", "Charaqlab turgan quyosh, illustratsiya", "sun flat illustration"],
      ["T", "[ti:]", "tree", "daraxt", "Yashil barg yozgan bitta daraxt", "green tree isolated illustration"],
      ["U", "[yu:]", "umbrella", "soyabon", "Ochiq rangli soyabon", "open umbrella isolated"],
      ["V", "[vi:]", "vegetables", "sabzavotlar", "Sabzavotlar to'plami: sabzi, pomidor, bodring", "fresh vegetables isolated white background"],
      ["W", "[dəbəl-yu:]", "water", "suv", "Bir stakan toza suv", "glass of water isolated white background"],
      ["X", "[eks]", "box", "quti", "Karton quti (x so'z oxirida: bo-x)", "cardboard box isolated"],
      ["Y", "[way]", "yellow", "sariq", "Sariq rang (sariq bo'yoq dog'i yoki sariq shar)", "yellow color paint swatch"],
      ["Z", "[zi:]", "zebra", "zebra", "Zebra, yon tomondan", "zebra side view isolated"],
    ] as const
  ).map(([l, name, word, uz, brief, search]) => [l, { l, name, word, uz, brief, search }]),
);

/** Harflar sahifasi: har harf — katta harf, nomi, rasm joyi, so'z va audio. */
function letterPage(title: string, letters: string[]): Page {
  const narrow = letters.length > 4;
  const gap = narrow ? 30 : 40;
  const w = (1440 - gap * (letters.length - 1)) / letters.length;
  // Tor (5 ustunli) kartochkada nom va so'z ikki qatorga tushishi mumkin: ularga joy ko'proq
  const y = narrow ? { name: [255, 90], img: [355, 200], word: [565, 100], aud: [675, 115] } : { name: [262, 60], img: [335, 240], word: [590, 70], aud: [670, 120] };
  const blocks: Block[] = [H(title)];
  letters.forEach((key, i) => {
    const L = LETTERS[key];
    const x = 80 + i * (w + gap);
    blocks.push(
      H(`${L.l} ${L.l.toLowerCase()}`, [x, 150, w, narrow ? 100 : 110], 1, "center", false),
      H(L.name, [x, y.name[0], w, y.name[1]], 3, "center", false),
      IMG(`${L.word} — ${L.uz}`, `${L.uz[0].toUpperCase()}${L.uz.slice(1)} (${L.word}): ${L.brief}`, L.search, [x, y.img[0], w, y.img[1]]),
      T(narrow ? `**${L.word}**\n${L.uz}` : `**${L.word}** — ${L.uz}`, [x, y.word[0], w, y.word[1]], "center"),
      AUD(`L_${L.l}`, `${L.l} … ${L.word}`, [x, y.aud[0], w, y.aud[1]]),
    );
  });
  return page(title, "free", blocks);
}

/** Uch ustunli "tinglang va tanlang" mashqi. */
function listenColumns(items: { audio: string; q: string; options: string[]; correct: number; why: string }[]): Block[] {
  const w = (1440 - 40 * (items.length - 1)) / items.length;
  return items.flatMap((it, i) => {
    const x = 80 + i * (w + 40);
    return [AUD(it.audio, `${i + 1}-savol`, [x, 230, w, 110]), CH(it.q, it.options, it.correct, it.why, [x, 370, w, 340])];
  });
}

// ───────────── 1-dars ─────────────

function lesson1(): LessonDoc {
  const words: [string, string, string][] = [
    ["hi", "[hay]", "salom"],
    ["bye", "[bay]", "xayr"],
    ["yes", "[yes]", "ha"],
    ["no", "[nou]", "yo'q"],
    ["please", "[pli:z]", "iltimos"],
    ["I", "[ay]", "men"],
    ["you", "[yu:]", "sen, siz"],
    ["my", "[may]", "mening"],
    ["name", "[neym]", "ism"],
    ["book", "[buk]", "kitob"],
    ["pen", "[pen]", "ruchka"],
    ["key", "[ki:]", "kalit"],
  ];
  const wordBlocks = words.flatMap(([en, tr, uz], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 80 + col * 370;
    const y = 225 + row * 220;
    return [T(`**${en}** ${tr}\n${uz}`, [x, y, 330, 95], "center"), AUD(`W_${en}`, "", [x, y + 100, 330, 100])];
  });

  return {
    schemaVersion: 1,
    pages: [
      page("Kirish", "free", [
        H("Ingliz alifbosi", [80, 60, 1440, 110], 1),
        T(
          "Ingliz alifbosida **26 ta harf** bor. Ularning ko'pchiligi o'zbek lotin harflariga o'xshaydi — lekin **boshqacha aytiladi**.\nBugun birinchi 13 ta harfni (A dan M gacha) o'rganasiz.",
          [80, 190, 860, 230],
        ),
        C("example", "Misol", "O'zbekchada: B — [be]\nInglizchada: B — ==[bi:]==", [80, 440, 860, 190]),
        C("tip", "Bugun nimani o'rganasiz", "- A–M harflarining nomi\n- Har bir harfga bitta so'z\n- 12 ta birinchi so'z va kichik suhbat", [80, 660, 860, 210]),
        IMG(
          "Ingliz alifbosi plakati",
          "Ingliz alifbosi plakati: 26 ta harf, katta va kichik (Aa Bb Cc …), rangli, oddiy fonda. Bolalarcha emas — o'smir va kattalar uchun toza dizayn.",
          "english alphabet poster uppercase lowercase clean design",
          [1000, 190, 520, 680],
        ),
      ]),
      page("Qavs [ ] nimani bildiradi?", "free", [
        H("Qavs [ ] nimani bildiradi?"),
        T(
          "Inglizchada so'z **bir xil yoziladi, lekin boshqacha o'qiladi**. Shuning uchun har bir harf va so'z yonida **[ ]** ichida uning qanday AYTILISHI yoziladi.\n[ ] ichini xuddi o'zbekcha o'qiganday o'qing.",
          [80, 160, 1440, 190],
        ),
        C("rule", "Qoida", "- **[ ]** — qavs ichida so'z qanday aytilishi yozilgan\n- **:** — oldingi tovushni ==cho'zib== ayting", [80, 380, 700, 240]),
        C("example", "Misol", "- B → [bi:] — «bii» deb cho'zing\n- E → [i:] — «ii»\n- K → [key] — cho'zilmaydi", [820, 380, 700, 240]),
        C("tip", "Eslatma", "Har doim avval 🔊 audioni tinglang, keyin **ovoz chiqarib** o'zingiz takrorlang. Faqat ko'z bilan o'qish yetmaydi!", [80, 660, 1440, 170]),
      ]),
      letterPage("A, B, C, D", ["A", "B", "C", "D"]),
      letterPage("E, F, G, H", ["E", "F", "G", "H"]),
      letterPage("I, J, K, L, M", ["I", "J", "K", "L", "M"]),
      page("Diqqat: adashtirmang!", "free", [
        H("Diqqat: adashtirmang!"),
        C(
          "warning",
          "E va I — o'zbekchaga teskari!",
          "- **E** harfi ==[i:]== deb aytiladi\n- **I** harfi ==[ay]== deb aytiladi\nO'zbekchada aksincha, shuning uchun ko'pchilik shu yerda adashadi.",
          [80, 160, 700, 320],
        ),
        C("warning", "G va J", "- **G** → ==[ji:]==\n- **J** → ==[jey]==\nIkkalasi ham «j» bilan boshlanadi — farqi oxirida: [i:] va [ey].", [820, 160, 700, 320]),
        AUD("L_E", "E … egg", [80, 505, 700, 110]),
        AUD("L_I", "I … ice cream", [820, 505, 700, 110]),
        AUD("L_G", "G … girl", [80, 630, 700, 110]),
        AUD("L_J", "J … juice", [820, 630, 700, 110]),
        C("tip", "Eslab qoling", "**E** = [i:]   ·   **I** = [ay]   ·   **G** = [ji:]   ·   **J** = [jey]", [80, 765, 1440, 115]),
      ]),
      page("Mashq 1", "correct", [
        H("Mashq 1. Qaysi harfni eshitdingiz?"),
        T("🔊 Audioni tinglang va to'g'ri harfni tanlang.", [80, 150, 1440, 60]),
        ...listenColumns([
          { audio: "N_I", q: "Qaysi harf?", options: ["E", "I", "A"], correct: 1, why: "[ay] — bu **I** harfi. E esa [i:] deb aytiladi." },
          { audio: "N_E", q: "Qaysi harf?", options: ["I", "E", "H"], correct: 1, why: "[i:] — bu **E** harfi. O'zbekchadagi «i» ga o'xshaydi, lekin cho'ziladi." },
          { audio: "N_J", q: "Qaysi harf?", options: ["G", "J", "K"], correct: 1, why: "[jey] — bu **J**. G esa [ji:] deb aytiladi." },
        ]),
      ]),
      page("Mashq 2", "correct", [
        H("Mashq 2. Harf qanday aytiladi?"),
        CH("**G** harfi qanday aytiladi?", ["[ji:]", "[jey]", "[ge]"], 0, "G → [ji:]. [jey] — bu J harfi.", [80, 170, 453, 360]),
        CH("**H** harfi qanday aytiladi?", ["[ha]", "[eych]", "[hi:]"], 1, "H → [eych]. O'zbekchadagi «ha» emas.", [573, 170, 453, 360]),
        CH("**A** harfi qanday aytiladi?", ["[a]", "[ey]", "[i:]"], 1, "A → [ey]. [i:] — bu E harfi.", [1066, 170, 453, 360]),
        C("tip", "Maslahat", "Ikkilansangiz, oldingi sahifalarga qaytib audioni yana tinglang.", [80, 580, 1440, 130]),
      ]),
      page("Mashq 3", "correct", [
        H("Mashq 3. Qaysi harf yo'q?"),
        T("Alifbo tartibini eslang va bo'sh joyga harfni yozing.", [80, 150, 1440, 60]),
        FB("A   B   [[a]]   D   E", { a: ["C"] }, "A B **C** D E", [80, 240, 700, 140]),
        FB("F   G   [[b]]   I   J", { b: ["H"] }, "F G **H** I J", [820, 240, 700, 140]),
        FB("J   K   [[c]]   M", { c: ["L"] }, "J K **L** M", [80, 420, 700, 140]),
        FB("[[d]]   B   C   D", { d: ["A"] }, "**A** B C D", [820, 420, 700, 140]),
        C("example", "Alifbo (A–M)", "A · B · C · D · E · F · G · H · I · J · K · L · M", [80, 610, 1440, 150]),
      ]),
      page("Birinchi so'zlaringiz", "free", [
        H("Birinchi so'zlaringiz"),
        T("Har bir so'zni 🔊 tinglang va ovoz chiqarib takrorlang.", [80, 145, 1440, 60]),
        ...wordBlocks,
      ]),
      page("Kichik suhbat", "free", [
        H("Kichik suhbat"),
        IMG(
          "Ikki o'smir salomlashmoqda",
          "Ikki o'smir (o'g'il va qiz) salomlashmoqda: o'g'il qo'l silkitmoqda, qiz tabassum qilmoqda. Maktab hovlisi yoki park fonida, illustratsiya uslubi.",
          "two teenagers saying hello waving illustration",
          [80, 160, 620, 660],
        ),
        C("example", "Suhbat", "**Ali:** Hi! My name is Ali.\n**Lola:** Hi, Ali! My name is Lola.\n**Ali:** Bye, Lola!\n**Lola:** Bye!", [760, 160, 760, 300]),
        AUD("DIALOG1", "Suhbatni tinglang", [760, 485, 760, 110], "Ali: Hi! My name is Ali.\nLola: Hi, Ali! My name is Lola.\nAli: Bye, Lola!\nLola: Bye!"),
        C("tip", "Siz ham ayting", "**My name is …** — «Mening ismim …».\nO'z ismingizni qo'yib, ovoz chiqarib ayting: My name is …", [760, 620, 760, 200]),
      ]),
      page("Mashq 4", "correct", [
        H("Mashq 4. So'zlarni tekshiring"),
        CH("«Xayr» inglizcha qanday?", ["hi", "bye", "yes"], 1, "**bye** — xayr. hi — salom.", [80, 160, 453, 330]),
        CH("**name** so'zining tarjimasi?", ["ism", "kitob", "kalit"], 0, "**name** [neym] — ism.", [573, 160, 453, 330]),
        CH("«Ha» inglizcha qanday?", ["no", "yes", "please"], 1, "**yes** — ha. no — yo'q.", [1066, 160, 453, 330]),
        FB("My [[n]] is Ali.", { n: ["name"] }, "**My name is …** — «Mening ismim …».", [80, 540, 1440, 140]),
      ]),
      page("Xulosa", "free", [
        H("Bugun o'rgandingiz"),
        C(
          "success",
          "Xulosa",
          "- A dan M gacha 13 ta harf\n- ==E = [i:]==, ==I = [ay]== — adashtirmang!\n- 12 ta yangi so'z: hi, bye, yes, no, please, I, you, my, name, book, pen, key\n- **My name is …** bilan o'zingizni tanishtirish",
          [80, 170, 900, 420],
        ),
        C("info", "Keyingi dars", "N dan Z gacha harflar va so'zni harfma-harf aytish: **How do you spell …?**", [80, 630, 900, 180]),
        IMG("Dars tugadi", "Dars tugaganini bildiruvchi quvnoq illustratsiya: kubok yoki yulduzcha", "trophy star celebration flat illustration", [1040, 170, 480, 480]),
      ]),
    ],
  };
}

// ───────────── 2-dars ─────────────

function lesson2(): LessonDoc {
  const spell = [
    ["SP_cat", "cat"],
    ["SP_pen", "pen"],
    ["SP_box", "box"],
    ["SP_key", "key"],
  ] as const;
  const spellBlocks = spell.flatMap(([audio, word], i) => {
    const x = 80 + i * 370;
    return [
      AUD(audio, `${i + 1}-so'z`, [x, 240, 330, 110]),
      FB(`So'z: [[w${i}]]`, { [`w${i}`]: [word] }, `${word.split("").map((c) => c.toUpperCase()).join("-")} → **${word}**`, [x, 380, 330, 140]),
    ];
  });

  return {
    schemaVersion: 1,
    pages: [
      page("Takrorlash", "correct", [
        H("Avval takrorlaymiz"),
        T("O'tgan darsdan 3 ta savol. 🔊 Tinglang va tanlang.", [80, 150, 1440, 60]),
        AUD("N_G", "1-savol", [80, 230, 453, 110]),
        CH("Qaysi harf?", ["G", "J", "E"], 0, "[ji:] — bu **G**. J esa [jey].", [80, 370, 453, 340]),
        AUD("N_K", "2-savol", [573, 230, 453, 110]),
        CH("Qaysi harf?", ["K", "Q", "C"], 0, "[key] — bu **K**.", [573, 370, 453, 340]),
        CH("Qaysi harf **[i:]** deb aytiladi?", ["I", "E", "Y"], 1, "**E** → [i:]. I esa [ay].", [1066, 230, 453, 480]),
      ]),
      letterPage("N, O, P, Q", ["N", "O", "P", "Q"]),
      letterPage("R, S, T, U", ["R", "S", "T", "U"]),
      letterPage("V, W, X, Y, Z", ["V", "W", "X", "Y", "Z"]),
      page("Yangi belgi: ə", "free", [
        H("Yangi belgi: ə", undefined, 2, "left", false),
        C(
          "rule",
          "ə belgisi",
          "**ə** — qisqa va bo'sh tovush. Og'zingizni bo'shashtiring va juda qisqa, yengil «a» deng.",
          [80, 160, 860, 230],
        ),
        C("example", "Misol", "W → [**də**bəl-yu:]\n«də» va «bəl» — ikkalasi ham qisqa va yengil.", [80, 420, 860, 210]),
        AUD("L_W", "W … water", [80, 660, 860, 110]),
        C("tip", "Bilib qo'ying", "**ə** — inglizchada ==eng ko'p uchraydigan== tovush. Keyingi darslarda uni tez-tez ko'rasiz.", [1000, 160, 520, 380]),
      ]),
      page("Tuzoq harflar", "free", [
        H("Diqqat: tuzoq harflar"),
        C("warning", "Q — o'zbekcha «q» emas", "Q harfi ==[kyu:]== deb aytiladi.\nSo'zda deyarli doim **qu** bo'lib keladi: **qu**een.", [80, 160, 700, 300]),
        C("warning", "X — o'zbekcha «x» emas", "X harfi ==[eks]== deb aytiladi.\nSo'zda «ks» deb o'qiladi: bo**x** → «boks».", [820, 160, 700, 300]),
        C("warning", "R", "R harfi ==[ar]== deb aytiladi.\nO'zbekchadagi «er» emas.", [80, 490, 700, 260]),
        C("warning", "Y", "Y harfi ==[way]== deb aytiladi.\nSo'z boshida esa «y» tovushi: **y**es, **y**ellow.", [820, 490, 700, 260]),
      ]),
      page("Mashq 1", "correct", [
        H("Mashq 1. Qaysi harfni eshitdingiz?"),
        T("🔊 Audioni tinglang va to'g'ri harfni tanlang.", [80, 150, 1440, 60]),
        ...listenColumns([
          { audio: "N_Q", q: "Qaysi harf?", options: ["K", "Q", "U"], correct: 1, why: "[kyu:] — bu **Q** harfi." },
          { audio: "N_Y", q: "Qaysi harf?", options: ["Y", "I", "W"], correct: 0, why: "[way] — bu **Y** harfi. I esa [ay]." },
          { audio: "N_R", q: "Qaysi harf?", options: ["A", "R", "E"], correct: 1, why: "[ar] — bu **R** harfi." },
        ]),
      ]),
      page("Harfma-harf aytish", "free", [
        H("So'zni harfma-harf aytish"),
        T("Inglizlar ism yoki notanish so'zni **harfma-harf** aytib berishadi. Buning uchun shunday so'rashadi:", [80, 150, 1440, 100]),
        C("example", "Savol", "**How do you spell your name?**\nIsmingiz qanday yoziladi? (harflab ayting)", [80, 270, 700, 220]),
        C("example", "Javob", "**A-L-I** → [ey] – [el] – [ay]\n**L-O-L-A** → [el] – [ou] – [el] – [ey]", [820, 270, 700, 220]),
        AUD("SP_ali", "How do you spell your name? … A-L-I", [80, 520, 1440, 110], "How do you spell your name? — A-L-I. Ali."),
        C("tip", "Siz ham ayting", "O'z ismingizni harflab, ovoz chiqarib ayting. Telefon orqali gaplashganda yoki hujjat to'ldirganda bu juda kerak bo'ladi!", [80, 660, 1440, 170]),
      ]),
      page("Mashq 2. Diktant", "correct", [
        H("Mashq 2. Diktant"),
        T("🔊 Harflarni tinglang va so'zni yozing.", [80, 150, 1440, 60]),
        ...spellBlocks,
        C("tip", "Maslahat", "Har bir harfni eshitganingizda daftaringizga yozib boring, keyin so'zni yig'ing.", [80, 570, 1440, 140]),
      ]),
      page("Butun alifbo", "free", [
        H("Butun alifbo"),
        AUD("ALPHABET", "A dan Z gacha — tinglang va birga ayting", [80, 150, 1440, 110]),
        C(
          "example",
          "Alifbo",
          "A [ey] · B [bi:] · C [si:] · D [di:] · E [i:] · F [ef] · G [ji:]\nH [eych] · I [ay] · J [jey] · K [key] · L [el] · M [em] · N [en]\nO [ou] · P [pi:] · Q [kyu:] · R [ar] · S [es] · T [ti:] · U [yu:]\nV [vi:] · W [dəbəl-yu:] · X [eks] · Y [way] · Z [zi:]",
          [80, 285, 1440, 300],
        ),
        C(
          "success",
          "Xulosa",
          "- Endi 26 ta harfning hammasini bilasiz\n- Tuzoq harflar: ==Q [kyu:]==, ==X [eks]==, ==R [ar]==, ==Y [way]==\n- **How do you spell …?** — harflab aytish",
          [80, 610, 1440, 250],
        ),
      ]),
    ],
  };
}

// ───────────── 3-dars ─────────────

function lesson3(): LessonDoc {
  const consonants = [
    ["D", "[di:]", "dog", "[dog]", "it", "S_dog", "Yoqimli kuchukcha (dog), oddiy fonda", "cute dog isolated white background"],
    ["M", "[em]", "milk", "[milk]", "sut", "S_milk", "Bir stakan sut (milk)", "glass of milk isolated white background"],
    ["S", "[es]", "sun", "[sən]", "quyosh", "S_sun", "Charaqlab turgan quyosh (sun), illustratsiya", "sun flat illustration"],
  ] as const;
  const consonantBlocks = consonants.flatMap(([l, name, word, tr, uz, audio, brief, search], i) => {
    const x = 80 + i * 493;
    return [
      C("example", l, `Nomi: ${name}\nTovushi: **${word[0]}** → **${word}** ${tr} — ${uz}`, [x, 240, 453, 210]),
      AUD(audio, word, [x, 470, 453, 110]),
      IMG(`${word} — ${uz}`, brief, search, [x, 600, 453, 260]),
    ];
  });

  return {
    schemaVersion: 1,
    pages: [
      page("Bitta savol", "free", [
        H("Bitta savol"),
        C("example", "O'ylab ko'ring", "C harfining nomi [si:].\nUnda **cat** so'zini «si-at» deb o'qiymizmi?", [80, 160, 860, 250]),
        AUD("S_cat", "cat", [80, 440, 860, 110]),
        C("warning", "Javob: yo'q!", "**cat** — [kät] (mushuk). So'z ichida C harfi o'z nomi bilan emas, ==tovushi== bilan o'qiladi.", [80, 580, 860, 240]),
        IMG("cat — mushuk", "O'tirgan yoqimli mushuk (cat), oddiy fonda", "cute cat sitting white background", [1000, 160, 520, 660]),
      ]),
      page("Nomi va tovushi", "free", [
        H("Harfning nomi va tovushi"),
        C(
          "rule",
          "Qoida",
          "Har bir harfning ikkita «yuzi» bor:\n- **Nomi** — alifboda aytiladi: B → [bi:]\n- **Tovushi** — so'z ichida o'qiladi: **b**us → [bəs]\nO'qiyotganda ==tovushga== qarang, nomiga emas!",
          [80, 160, 860, 400],
        ),
        AUD("S_bee_bus", "B harfining nomi … va bus so'zi", [80, 590, 860, 110]),
        IMG("bus — avtobus", "Sariq avtobus (bus), yon tomondan, illustratsiya", "yellow bus side view illustration", [1000, 160, 520, 420]),
        C("example", "Misol", "**bus** [bəs] — avtobus", [1000, 610, 520, 160]),
      ]),
      page("Yangi belgi: ä", "free", [
        H("Yangi belgi: ä", undefined, 2, "left", false),
        C("rule", "ä belgisi", "**ä** — «a» va «e» orasidagi tovush. Og'zingizni ==keng oching== va «e» deyishga harakat qiling.", [80, 160, 860, 250]),
        C("example", "Misol", "- **cat** → [kät] — mushuk\n- **apple** → [äpəl] — olma", [80, 440, 860, 200]),
        AUD("S_cat", "cat", [80, 670, 420, 110]),
        AUD("S_apple", "apple", [520, 670, 420, 110]),
        IMG(
          "ä tovushida og'iz holati",
          "Talaffuz sxemasi: og'izning yon ko'rinishi, [ä] (cat) tovushida og'iz keng ochilgan, til pastda. Yoki og'iz keng ochilgan odam yuzi.",
          "mouth position diagram ae sound cat pronunciation",
          [1000, 160, 520, 620],
        ),
      ]),
      page("Undoshlar", "free", [
        H("Undoshlarda: nom va tovush yaqin"),
        T("Ko'p undosh harflarda tovush — nomining bir qismi. Shuning uchun ular oson:", [80, 150, 1440, 70]),
        ...consonantBlocks,
      ]),
      page("Unlilar", "free", [
        H("Unlilarda: nom ≠ tovush"),
        C("warning", "Diqqat: unli harflar", "Unli harflarda (A, E, I, O, U) nom va tovush ==butunlay farq qiladi==.", [80, 160, 1440, 150]),
        C("example", "A", "Nomi: [ey]\nTovushi: **a**pple → [äpəl] — olma", [80, 340, 700, 220]),
        AUD("S_apple", "apple", [80, 580, 700, 110]),
        C("example", "I", "Nomi: [ay]\nTovushi: **i**nk → [ink] — siyoh", [820, 340, 700, 220]),
        AUD("S_ink", "ink", [820, 580, 700, 110]),
        C("tip", "Eslab qoling", "Unlilar haqida keyingi darslarda batafsil o'rganamiz. Hozircha: unli harf so'zda ==o'z nomidan boshqacha== o'qilishi mumkin.", [80, 720, 1440, 150]),
      ]),
      page("Bir harf — ikki tovush", "free", [
        H("Bir harf — ikki tovush"),
        C("example", "C harfi", "- **c**at → [kät] — «k» tovushi\n- **c**ity → [siti] — «s» tovushi (shahar)", [80, 160, 860, 260]),
        AUD("S_cat", "cat", [80, 450, 420, 110]),
        AUD("S_city", "city", [520, 450, 420, 110]),
        IMG("city — shahar", "Shahar manzarasi (city): baland binolar, oddiy illustratsiya", "city skyline flat illustration", [1000, 160, 520, 400]),
        C("tip", "Bilib qo'ying", "Qachon «k», qachon «s» bo'lishini keyingi darslarda o'rganamiz. Hozircha: bitta harf ==bir nechta tovush== berishi mumkin.", [80, 600, 1440, 180]),
      ]),
      page("Mashq 1", "correct", [
        H("Mashq 1. Birinchi harf qaysi?"),
        T("🔊 So'zni tinglang va birinchi harfini tanlang.", [80, 150, 1440, 60]),
        ...listenColumns([
          { audio: "Q_dog", q: "Birinchi harf?", options: ["D", "T", "B"], correct: 0, why: "**d**og — D harfi, tovushi «d»." },
          { audio: "Q_milk", q: "Birinchi harf?", options: ["N", "M", "W"], correct: 1, why: "**m**ilk — M harfi, tovushi «m»." },
          { audio: "Q_sun", q: "Birinchi harf?", options: ["S", "Z", "C"], correct: 0, why: "**s**un — S harfi. C ham «s» deb o'qilishi mumkin, lekin sun S bilan yoziladi." },
        ]),
      ]),
      page("Mashq 2", "correct", [
        H("Mashq 2. Nom yoki tovush?"),
        CH("**[bi:]** — bu nima?", ["B harfining nomi", "bus so'zidagi tovush"], 0, "[bi:] — B harfining **nomi**. bus so'zida esa faqat «b» tovushi.", [80, 170, 453, 380]),
        CH("**cat** so'zida C qanday o'qiladi?", ["[si:]", "[k]", "[s]"], 1, "cat → [kät]: C bu yerda «k» deb o'qiladi.", [573, 170, 453, 380]),
        CH("**apple** so'zida A qanday o'qiladi?", ["[ey]", "[ä]", "[a:]"], 1, "apple → [äpəl]: A bu yerda [ä].", [1066, 170, 453, 380]),
      ]),
      page("Xulosa", "free", [
        H("Bugun o'rgandingiz"),
        C(
          "success",
          "Xulosa",
          "- Alifboda — harfning **nomi**: B [bi:]\n- So'zda — harfning **tovushi**: **b**us [bəs]\n- Undoshlarda nom va tovush yaqin, ==unlilarda esa boshqacha==\n- Bitta harf bir nechta tovush berishi mumkin: **c**at [k], **c**ity [s]\n- Yangi belgi: **ä** — cat [kät]",
          [80, 160, 1440, 430],
        ),
        C("info", "Keyingi dars", "O'zbekchaga o'xshash undoshlar — eng oson qism!", [80, 630, 1440, 160]),
      ]),
    ],
  };
}

// ───────────── Bazaga yozish ─────────────

async function ensureTopic(): Promise<string> {
  const english = await prisma.direction.findUnique({ where: { slug: "english" }, select: { id: true } });
  if (!english) throw new Error("Ingliz tili yo'nalishi yo'q: avval `npm run db:seed:catalog -- --missing`");
  const a1 = await prisma.level.findFirst({ where: { directionId: english.id, code: "A1" }, select: { id: true } });
  if (!a1) throw new Error("A1 darajasi topilmadi");
  const existing = await prisma.topic.findFirst({ where: { levelId: a1.id, title: TOPIC_TITLE }, select: { id: true } });
  if (existing) return existing.id;
  return prisma.$transaction(async (tx) => {
    // Mavjud mavzularni bittaga suramiz (yuqoridan pastga — @@unique([levelId, ord]) buzilmasin)
    const topics = await tx.topic.findMany({ where: { levelId: a1.id }, orderBy: { ord: "desc" }, select: { id: true, ord: true } });
    for (const t of topics) await tx.topic.update({ where: { id: t.id }, data: { ord: t.ord + 1 } });
    const created = await tx.topic.create({ data: { levelId: a1.id, ord: 1, title: TOPIC_TITLE } });
    return created.id;
  });
}

const assetCache = new Map<string, string>();
async function audioAsset(ownerId: string, name: string): Promise<string> {
  const hit = assetCache.get(name);
  if (hit) return hit;
  const data = await readFile(path.join(AUDIO_DIR!, `${name}.mp3`));
  const row = await prisma.asset.create({ data: { ownerId, kind: "AUDIO", mime: "audio/mpeg", size: data.length, originalName: `${name}.mp3 (qoralama TTS)` } });
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, row.id), data);
  assetCache.set(name, row.id);
  return row.id;
}

async function main() {
  if (!AUDIO_DIR) throw new Error("--audio <papka> kerak");
  const author = await prisma.user.findUnique({ where: { username: AUTHOR }, select: { id: true, role: true } });
  if (!author || (author.role !== "ADMIN" && author.role !== "TEACHER")) throw new Error(`Muallif topilmadi yoki ustoz/admin emas: ${AUTHOR}`);
  const topicId = await ensureTopic();

  const lessons: [string, () => LessonDoc][] = [
    ["1-dars. Alifbo: A dan M gacha", lesson1],
    ["2-dars. Alifbo: N dan Z gacha", lesson2],
    ["3-dars. Harfning nomi va tovushi", lesson3],
  ];
  for (const [title, build] of lessons) {
    if (await prisma.lesson.findFirst({ where: { topicId, title }, select: { id: true } })) {
      console.log(`• ${title}: allaqachon bor, o'tkazildi`);
      continue;
    }
    seq = 0;
    audioRefs.clear();
    const doc = build();
    for (const p of doc.pages) {
      for (const b of p.blocks) {
        const file = audioRefs.get(b.id);
        if (file && b.type === "audio") b.assetId = await audioAsset(author.id, file);
      }
    }
    // Asset UUID'lari ulangach sxema bo'yicha tekshiramiz (qoralama saqlash talabi)
    for (const p of doc.pages) for (const b of p.blocks) if ("assetId" in b && b.assetId === null && b.type === "audio") throw new Error(`Audio ulanmadi: ${b.id}`);
    const parsed = parseDoc(doc);
    if (!parsed.ok) throw new Error(`${title}: ${JSON.stringify(parsed.issues)}`);

    const last = await prisma.lesson.aggregate({ where: { topicId }, _max: { sortOrder: true } });
    const lesson = await prisma.lesson.create({
      data: { id: randomUUID(), topicId, authorId: author.id, title, sortOrder: (last._max.sortOrder ?? 0) + 100 },
    });
    await prisma.lessonVersion.create({ data: { lessonId: lesson.id, status: "DRAFT", doc: parsed.doc as object } });
    const left = publishIssues(parsed.doc);
    console.log(`✔ ${title}: ${parsed.doc.pages.length} sahifa · nashrgacha ${left.length} ta ish qoldi (asosan rasmlar)`);
  }

  await ensureQuiz(topicId, author.id);
}

// ───────────── Mavzu testi ─────────────

/** [savol, variantlar, to'g'ri variant indeksi] — faqat 1–3-darslarda o'tilgan narsalar. */
const QUIZ: [string, string[], number][] = [
  // Harf nomlari
  ["Qaysi harf [ay] deb aytiladi?", ["E", "I", "A", "Y"], 1],
  ["Qaysi harf [i:] deb aytiladi?", ["I", "A", "E", "Y"], 2],
  ["G harfi qanday aytiladi?", ["[ji:]", "[jey]", "[ge]", "[gi:]"], 0],
  ["J harfi qanday aytiladi?", ["[ji:]", "[je]", "[jay]", "[jey]"], 3],
  ["H harfi qanday aytiladi?", ["[ha]", "[eych]", "[hi:]", "[ey]"], 1],
  ["Q harfi qanday aytiladi?", ["[q]", "[ku:]", "[kyu:]", "[kvi:]"], 2],
  ["X harfi qanday aytiladi?", ["[eks]", "[x]", "[iks]", "[xe]"], 0],
  ["Qaysi harf [way] deb aytiladi?", ["W", "V", "U", "Y"], 3],
  ["R harfi qanday aytiladi?", ["[er]", "[ar]", "[ra]", "[ri:]"], 1],
  ["W harfi qanday aytiladi?", ["[ve]", "[vi:]", "[dəbəl-yu:]", "[yu:]"], 2],
  // Alifbo tartibi
  ["Alifboda K dan keyin qaysi harf keladi?", ["J", "L", "M", "N"], 1],
  ["Alifboda qaysi harf P va R orasida turadi?", ["Q", "O", "S", "T"], 0],
  // Harflab aytish
  ["[si:] – [ey] – [ti:] deb harflab aytilgan so'z qaysi?", ["city", "kit", "cat", "sat"], 2],
  ["pen so'zi qanday harflab aytiladi?", ["[pe] – [e] – [en]", "[pi:] – [i:] – [en]", "[pi:] – [ay] – [en]"], 1],
  ["«How do you spell your name?» savoli nimani so'raydi?", ["Ismingiz nima?", "Necha yoshdasiz?", "Ismingizni harfma-harf ayting"], 2],
  // So'zlar
  ["«name» so'zining tarjimasi qaysi?", ["ism", "kitob", "kalit", "mening"], 0],
  ["«Xayr» inglizcha qanday?", ["hi", "yes", "please", "bye"], 3],
  ["«iltimos» inglizcha qanday?", ["you", "please", "yes", "no"], 1],
  ["«My name is Ali» gapining tarjimasi qaysi?", ["Bu Ali", "Ali qayerda?", "Mening ismim Ali", "Sening isming Ali"], 2],
  // Nom va tovush, belgilar
  ["[bi:] — bu nima?", ["B harfining nomi", "bus so'zining talaffuzi", "B harfining so'z ichidagi tovushi"], 0],
  ["cat so'zida C harfi qanday o'qiladi?", ["[s]", "[k]", "[si:]", "[ch]"], 1],
  ["city so'zida C harfi qanday o'qiladi?", ["[k]", "[si:]", "[ch]", "[s]"], 3],
  ["apple so'zida A harfi qanday o'qiladi?", ["[ey]", "[a:]", "[ä]", "[ə]"], 2],
  ["[ ] ichidagi : belgisi nimani bildiradi?", ["Tovushni cho'zib aytish", "Bir oz to'xtab olish", "So'z tugaganini"], 0],
  ["ä belgisi qanday tovush?", ["Cho'zilgan «a»", "«a» va «e» orasidagi tovush, og'iz keng ochiladi", "Qisqa va bo'sh tovush", "«o» tovushi"], 1],
  ["ə belgisi qanday tovush?", ["«a» va «e» orasidagi tovush", "Cho'zilgan «e»", "Qisqa va bo'sh tovush", "«u» tovushi"], 2],
  ["Unli harflar (A, E, I, O, U) haqida qaysi gap to'g'ri?", ["Nomi va so'zdagi tovushi doim bir xil", "So'zda nomidan boshqacha o'qilishi mumkin", "So'zda umuman o'qilmaydi"], 1],
];

async function ensureQuiz(topicId: string, authorId: string) {
  if (await prisma.topicQuiz.findUnique({ where: { topicId }, select: { id: true } })) {
    console.log("• Mavzu testi: allaqachon bor, o'tkazildi");
    return;
  }
  const raw = QUIZ.map(([text, options, correct], i) => ({
    id: `q${i + 1}`,
    text,
    options: options.map((t, j) => ({ id: `q${i + 1}o${j + 1}`, text: t })),
    correctId: `q${i + 1}o${correct + 1}`,
  }));
  const parsed = parseQuestions(raw, { forPublish: true });
  if (!parsed.ok) throw new Error(`Mavzu testi: ${parsed.error}`);
  const quiz = await prisma.topicQuiz.create({ data: { topicId, authorId, title: "Alifbo va o'qish — mavzu testi" } });
  await prisma.quizVersion.create({ data: { quizId: quiz.id, status: "DRAFT", questions: parsed.questions as unknown as object } });
  console.log(`✔ Mavzu testi: ${parsed.questions.length} ta savol (qoralama)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
