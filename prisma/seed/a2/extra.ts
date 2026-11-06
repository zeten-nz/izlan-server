/** A2 ga keyin qo'shilgan dars (o'quvchi ko'zi bilan tekshiruvdan keyin, 2026-11-06). */
import type { LessonSpec } from "../a1/builder";
import { REVIEW } from "./catalog";

export const OBJECT_PRONOUNS: LessonSpec = {
  topic: REVIEW,
  title: "2-dars. me, him, her, them: kimni? kimga?",
  intro: "«U **meni** taniydi», «**Unga** qo'ng'iroq qil». Fe'ldan keyin **I, he, she** emas, boshqa shakl keladi: **me, him, her, them**. Bu shakllar har kuni kerak!",
  goals: ["me, you, him, her, it, us, them", "Fe'l va predlogdan keyin", "I va me farqi"],
  cover: ["Qiz telefonda: «Call me!», yigit unga qo'l silkitmoqda", "girl on phone call me illustration"],
  rule: {
    head: "Kimni? Kimga?",
    text: "- I → **me** · you → **you** · he → **him** · she → **her**\n- it → **it** · we → **us** · they → **them**\n- **Fe'ldan keyin**: She loves **him**. Call **me**!\n- **Predlogdan keyin**: with **us**, for **her**, to **them**\n- Gap boshida (kim?) — **I, he, she**; fe'ldan keyin (kimni?) — **me, him, her**",
    example: "**I** like Lola, and **she** likes **me** too. We often study with **them**.",
  },
  side: { tip: ["Uch qator", "I — my — me\nhe — his — him\nshe — her — her\nwe — our — us\nthey — their — them"] },
  examples: [
    { en: "Can you help me?", uz: "Menga yordam bera olasizmi?" },
    { en: "I know him. He's my neighbor.", uz: "Men uni taniyman. U qo'shnim." },
    { en: "Call her tonight.", uz: "Bugun kechqurun unga qo'ng'iroq qil." },
    { en: "This present is for you.", uz: "Bu sovg'a senga." },
    { en: "Come with us!", uz: "Biz bilan yur!" },
    { en: "I don't like them.", uz: "Men ularni yoqtirmayman." },
  ],
  warning: ["I yoki me?", "❌ Me am a student. ✅ **I** am a student.\n❌ She loves he. ✅ She loves **him**.\n❌ Come with we. ✅ Come with **us**."],
  tip: ["Me too!", "Qisqa javobda ham **me**: Who wants tea? — **Me!** · I'm hungry. — **Me too.**"],
  listen: [
    { say: "Please call me tomorrow.", q: "Kimga qo'ng'iroq qilish kerak?", options: ["gapiruvchiga", "uning do'stiga"], correct: 0, why: "me — menga." },
    { say: "I see them every day.", q: "Kimni ko'radi?", options: ["ularni", "uni"], correct: 0, why: "them — ularni." },
    { say: "This is for her.", q: "Kim uchun?", options: ["ayol uchun", "erkak uchun"], correct: 0, why: "her — ayol." },
  ],
  write: [
    { t: "Can you help [[a]]? (men)", a: ["me"], why: "fe'ldan keyin — **me**" },
    { t: "I love my brother. I often call [[b]].", a: ["him"], why: "brother — **him**" },
    { t: "Lola is here. Talk to [[c]].", a: ["her"], why: "Lola — **her**" },
    { t: "My friends are nice. I like [[d]].", a: ["them"], why: "friends — **them**" },
  ],
  hint: "me · you · him · her · it · us · them — fe'l va predlogdan keyin",
  words: [
    ["me", "[mi:]", "meni, menga"],
    ["him", "[him]", "uni, unga (erkak)"],
    ["her", "[hər]", "uni, unga (ayol)"],
    ["us", "[əs]", "bizni, bizga"],
    ["them", "[ðem]", "ularni, ularga"],
    ["help", "[help]", "yordam bermoq"],
    ["call", "[ko:l]", "qo'ng'iroq qilmoq"],
    ["present", "[**pre**zənt]", "sovg'a"],
    ["with", "[wið]", "bilan"],
  ],
  mix: [
    { q: "She loves ___.", options: ["him", "he", "his"], correct: 0, why: "fe'ldan keyin — him." },
    { q: "___ am a teacher.", options: ["I", "Me", "My"], correct: 0, why: "gap boshida — I." },
    { q: "Come with ___!", options: ["us", "we", "our"], correct: 0, why: "predlogdan keyin — us." },
  ],
  mixWrite: { t: "Where are my keys? I can't find [[a]].", a: ["them"], why: "keys — **them**" },
  summary: ["==me, him, her, us, them== — kimni? kimga?", "Fe'l va predlogdan keyin", "I — my — me uchligi"],
  next: "Ko'plik: -s, -es va children",
};
