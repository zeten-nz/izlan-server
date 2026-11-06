/**
 * A1 darslari uchun umumiy qolip: ixcham mazmun (LessonSpec) → dars hujjati (LessonDoc).
 * Har dars bir xil tuzilishda: kirish → qoida → misollar → diqqat → mashq 1 (tinglash) → mashq 2 (yozish)
 * → yangi so'zlar → [suhbat] → mashq 3 (aralash) → xulosa. Talaffuz: amerikancha, [ ] ichida o'zbekcha yozuv.
 */
import { createHash } from "node:crypto";
import type { Block, LessonDoc, Page } from "../../../src/lessons/doc.schema";

export type Ex = { en: string; tr?: string; uz: string; say?: string };
export type Listen = { say: string; q: string; options: string[]; correct: number; why: string };
export type Write = { t: string; a: string[]; why: string };
export type Choice = { q: string; options: string[]; correct: number; why: string };
export type Word = [en: string, tr: string, uz: string];

export interface LessonSpec {
  topic: string;
  title: string;
  intro: string;
  goals: string[];
  cover: [brief: string, search: string];
  rule: { head: string; text: string; example: string };
  side: { img: [brief: string, search: string] } | { tip: [title: string, text: string] };
  examples: Ex[];
  warning: [title: string, text: string];
  tip?: [title: string, text: string];
  listen: Listen[];
  write: Write[];
  hint: string;
  words: Word[];
  dialog?: { lines: [speaker: string, text: string][]; img: [brief: string, search: string]; tip: string };
  mix: Choice[];
  mixWrite: Write;
  summary: string[];
  next: string;
}

/** Audio: bir xil (ovoz, matn) bitta faylga tushadi. Suhbat — bir nechta qismdan yig'iladi. */
export type Voice = "Zira" | "David";
export type AudioJob = { name: string; voice: Voice; text: string } | { name: string; parts: { voice: Voice; text: string }[] };

const plain = (s: string) => s.replace(/\*\*|==/g, "").replace(/\s*[·→]\s*/g, ". ").trim();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

export class LessonBuilder {
  private seq = 0;
  /** blockId → audio fayl nomi (asset keyin ulanadi) */
  readonly audioRefs = new Map<string, string>();
  readonly jobs = new Map<string, AudioJob>();

  private id(p: string) {
    return `${p}${++this.seq}`;
  }
  private frame([x, y, w, h]: number[]) {
    return { id: this.id("b"), x, y, w, h, z: 0 };
  }
  H(text: string, box = [80, 50, 1440, 90], level: 1 | 2 | 3 = 2): Block {
    return { ...this.frame(box), type: "heading", text, level, align: "left", caps: true };
  }
  T(text: string, box: number[], align: "left" | "center" = "left"): Block {
    return { ...this.frame(box), type: "text", text, align };
  }
  C(tone: "rule" | "example" | "tip" | "warning" | "info" | "success", title: string, text: string, box: number[]): Block {
    return { ...this.frame(box), type: "callout", tone, title, text };
  }
  IMG([brief, search]: [string, string], box: number[]): Block {
    return { ...this.frame(box), type: "image", assetId: null, alt: brief.split(/[.:—]/)[0].trim().slice(0, 120), fit: "cover", brief, search };
  }
  /** Bitta ovozli audio. */
  AUD(text: string, caption: string, box: number[], voice: Voice = "Zira", transcript = ""): Block {
    const t = plain(text);
    const name = `a_${hash(`${voice}|${t}`)}`;
    this.jobs.set(name, { name, voice, text: t });
    return this.attach(name, caption, box, transcript);
  }
  /** Suhbat: navbatma-navbat ikki ovoz. */
  DIALOG(lines: [string, string][], caption: string, box: number[]): Block {
    const speakers = [...new Set(lines.map(([s]) => s))];
    const parts = lines.map(([s, t]) => ({ voice: (speakers.indexOf(s) % 2 === 0 ? "David" : "Zira") as Voice, text: plain(t) }));
    const name = `d_${hash(JSON.stringify(parts))}`;
    this.jobs.set(name, { name, parts });
    return this.attach(name, caption, box, lines.map(([s, t]) => `${s}: ${t}`).join("\n"));
  }
  private attach(name: string, caption: string, box: number[], transcript: string): Block {
    const b = { ...this.frame(box), type: "audio" as const, assetId: null, caption, transcript, brief: "", search: "" };
    this.audioRefs.set(b.id, name);
    return b;
  }
  CH(c: Choice, box: number[]): Block {
    const options = c.options.map((text, i) => ({ id: `o${i + 1}`, text }));
    return { ...this.frame(box), type: "choice", question: c.q, options, correctIds: [options[c.correct].id], multiple: false, explanation: c.why };
  }
  FB(w: Write, box: number[]): Block {
    const ids = [...w.t.matchAll(/\[\[([A-Za-z0-9_-]+)\]\]/g)].map((m) => m[1]);
    if (ids.length !== 1) throw new Error(`Bitta bo'sh joy kutilgan: ${w.t}`);
    return { ...this.frame(box), type: "fillblank", template: w.t, blanks: [{ id: ids[0], answers: w.a, caseSensitive: false }], explanation: w.why };
  }
  page(title: string, gate: Page["gate"], blocks: Block[]): Page {
    return { id: this.id("p"), title, gate, blocks };
  }

  build(s: LessonSpec): LessonDoc {
    const short = s.title.replace(/^\d+-dars\.\s*/, "");
    const card = (e: Ex) => `**${e.en.replace(/\*\*/g, "")}**${e.tr ? ` ${e.tr}` : ""}\n${e.uz}`;
    const pages: Page[] = [];

    pages.push(
      this.page("Kirish", "free", [
        this.H(short, [80, 50, 1440, 130]),
        this.T(s.intro, [80, 200, 860, 250]),
        this.C("tip", "Bugun nimani o'rganasiz", s.goals.map((g) => `- ${g}`).join("\n"), [80, 480, 860, 320]),
        this.IMG(s.cover, [1000, 200, 520, 600]),
      ]),
    );

    pages.push(
      this.page("Qoida", "free", [
        this.H(s.rule.head),
        this.C("rule", "Qoida", s.rule.text, [80, 160, 860, 440]),
        this.C("example", "Misol", s.rule.example, [80, 630, 860, 200]),
        "img" in s.side ? this.IMG(s.side.img, [1000, 160, 520, 670]) : this.C("tip", s.side.tip[0], s.side.tip[1], [1000, 160, 520, 670]),
      ]),
    );

    pages.push(
      this.page("Misollar", "free", [
        this.H("Misollar"),
        ...s.examples.slice(0, 6).flatMap((e, i) => {
          const x = i % 2 === 0 ? 80 : 820;
          // Uzun gap + tarjima 3–4 qator bo'lishi mumkin: 175 px matn, ostida audio, qatorlar 240 px oraliqda
          const y = 150 + Math.floor(i / 2) * 240;
          return [this.T(card({ ...e, en: e.en }), [x, y, 700, 175]), this.AUD(e.say ?? e.en, "", [x, y + 180, 700, 55])];
        }),
      ]),
    );

    pages.push(
      this.page("Diqqat", "free", [
        this.H("Diqqat!"),
        this.C("warning", s.warning[0], s.warning[1], [80, 160, 1440, 340]),
        ...(s.tip ? [this.C("tip", s.tip[0], s.tip[1], [80, 530, 1440, 240])] : []),
      ]),
    );

    const cols = (n: number) => (1440 - 40 * (n - 1)) / n;
    pages.push(
      this.page("Mashq 1", "correct", [
        this.H("Mashq 1. Tinglang va tanlang"),
        this.T("🔊 Audioni tinglang va to'g'ri javobni tanlang.", [80, 145, 1440, 60]),
        ...s.listen.flatMap((l, i) => {
          const w = cols(s.listen.length);
          const x = 80 + i * (w + 40);
          return [this.AUD(l.say, `${i + 1}-savol`, [x, 225, w, 110], "David"), this.CH(l, [x, 360, w, 360])];
        }),
      ]),
    );

    pages.push(
      this.page("Mashq 2", "answered", [
        this.H("Mashq 2. Yozing"),
        this.T("Bo'sh joyni to'ldiring.", [80, 145, 1440, 60]),
        ...s.write.slice(0, 4).map((w, i) => this.FB(w, [i % 2 === 0 ? 80 : 820, 230 + Math.floor(i / 2) * 190, 700, 160])),
        this.C("tip", "Yordam", s.hint, [80, 620, 1440, 170]),
      ]),
    );

    for (let k = 0; k < s.words.length; k += 9) {
      const chunk = s.words.slice(k, k + 9);
      pages.push(
        this.page("Yangi so'zlar", "free", [
          this.H(k === 0 ? "Yangi so'zlar" : "Yangi so'zlar (davomi)"),
          ...chunk.flatMap(([en, tr, uz], i) => {
            const x = 80 + (i % 3) * 493;
            const y = 150 + Math.floor(i / 3) * 245;
            // «child / children [chayld / childrən]» kabi juftliklar 3 qatorga tushadi — joy shunga yetadi
            return [this.T(`**${en}** ${tr}\n${uz}`, [x, y, 453, 150], "center"), this.AUD(en, "", [x, y + 155, 453, 60])];
          }),
        ]),
      );
    }

    if (s.dialog) {
      pages.push(
        this.page("Suhbat", "free", [
          this.H("Suhbat"),
          this.IMG(s.dialog.img, [80, 150, 620, 680]),
          this.C("example", "Suhbat", s.dialog.lines.map(([who, t]) => `**${who}:** ${t}`).join("\n"), [760, 150, 760, 360]),
          this.DIALOG(s.dialog.lines, "Suhbatni tinglang", [760, 535, 760, 100]),
          this.C("tip", "Siz ham ayting", s.dialog.tip, [760, 660, 760, 170]),
        ]),
      );
    }

    pages.push(
      this.page("Mashq 3", "correct", [
        this.H("Mashq 3. Aralash"),
        ...s.mix.map((c, i) => this.CH(c, [80 + i * 493, 150, 453, 370])),
        this.FB(s.mixWrite, [80, 560, 1440, 150]),
      ]),
    );

    pages.push(
      this.page("Xulosa", "free", [
        this.H("Bugun o'rgandingiz"),
        this.C("success", "Xulosa", s.summary.map((x) => `- ${x}`).join("\n"), [80, 150, 900, 460]),
        this.C("info", "Keyingi dars", s.next, [80, 640, 900, 180]),
        this.C(
          "tip",
          "Uyda mashq",
          "- Yangi so'zlarni ovoz chiqarib 3 marta ayting\n- Audiolarni yana bir bor tinglang\n- Daftaringizga 3 ta o'z misolingizni yozing",
          [1020, 150, 500, 460],
        ),
      ]),
    );

    return { schemaVersion: 1, pages };
  }
}

// ───────────── Mavzu testlari ─────────────

export type QuizSpec = { topic: string; questions: [q: string, options: string[], correct: number][] };

/** To'g'ri javob o'rnini savol tartibiga qarab aylantiradi — hammasi "A" bo'lib qolmasin. */
export function quizQuestions(spec: QuizSpec) {
  return spec.questions.map(([text, options, correct], i) => {
    const n = options.length;
    // 7i+3: ikki variantlida navbatma-navbat, uch-to'rt variantlida aylanib chiqadi
    const shift = (i * 7 + 3) % n;
    const rotated = options.map((_, j) => options[(j + shift) % n]);
    const correctIdx = (correct - shift + n) % n;
    const id = `q${i + 1}`;
    return { id, text, options: rotated.map((t, j) => ({ id: `${id}o${j + 1}`, text: t })), correctId: `${id}o${correctIdx + 1}` };
  });
}
