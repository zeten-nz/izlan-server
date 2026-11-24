/**
 * Ingliz tili daraja aniqlash savollari — 2-to'plam (2026-11-24).
 *
 * `english.ts` dagi 72 ta boshlang'ich savol (en-a1-01 … en-c2-12) katalog seed'i bilan yaratiladi. Bu fayl:
 *  - FIXES: shu savollardan noaniq yoki noto'g'ri darajadagilarini tuzatadi (kalit saqlanadi, mazmun yangilanadi);
 *  - NEW_RULES: daraja mavzularini qamrash uchun yangi xato qoidalari (mavzu NOMI bo'yicha bog'lanadi — bazadagi
 *    hozirgi nomlar; lessons seed'i mavzularni qayta nomlagan, ord bo'yicha bog'lash ishonchsiz);
 *  - NEW_QUESTIONS: har darajaga 18 tadan yangi savol (grammatika + lug'at). Natija: har darajada 30 ta.
 *
 * Kalitlar: `en-<daraja>-x<NN>` — ro'yxatdagi tartib bo'yicha. Mavjud elementlar tartibini O'ZGARTIRMANG
 * (kalit = savol identifikatori, o'quvchi xatolari unga bog'langan); yangisini faqat oxiriga qo'shing.
 *
 * Har bir savolda bitta to'g'ri javob bo'lishi shart: distraktorlar grammatik yoki ma'no jihatidan aniq noto'g'ri.
 * Qo'llash: `npm run db:seed:placement` (idempotent; faqat yaratadi yoki shu fayldagi farqni yangilaydi).
 */
import type { QuestionSeed } from "./english";

export type PlacementRuleSeed = {
  key: string;
  level: string;
  /** Bazadagi mavzu nomi (aniq moslik) */
  topic: string;
  title: string;
  tipTitle: string;
  tipBody: string;
  remember: string;
};

export type PlacementQuestionSeed = QuestionSeed & { level: string };

const R = (key: string, level: string, topic: string, title: string, tipTitle: string, body: string[], remember: string): PlacementRuleSeed => ({
  key,
  level,
  topic,
  title,
  tipTitle,
  tipBody: body.join("\n"),
  remember,
});

type Opts = [string, string, string, string];
const Q = (rule: string, prompt: string, options: Opts, correct: 0 | 1 | 2 | 3, note: string): QuestionSeed => ({ rule, prompt, options, correct, note });

// ───────────────────────────── Yangi qoidalar ─────────────────────────────

export const NEW_RULES: PlacementRuleSeed[] = [
  // A1
  R("a1-can", "A1", "Can / can't", "Can / can't: qobiliyat va ruxsat", "can'dan keyin nima keladi?", [
    "**can** barcha shaxslarda bir xil: I can, he **can** (cans emas).",
    "Keyin fe'l o'zgarmaydi va **to** qo'yilmaydi: She can **swim**.",
    "So'roq: **Can** you swim? Inkor: I **can't** swim.",
  ], "can / can't + oddiy fe'l (to siz, -s siz)."),
  R("a1-pronouns", "A1", "Salomlashish va tanishuv", "Olmoshlar: I / me / my", "Qaysi olmosh shakli?", [
    "- Ega: **I, he, she, we, they** — gap boshida, fe'ldan oldin.",
    "- To'ldiruvchi: **me, him, her, us, them** — fe'l yoki predlogdan keyin: help **me**.",
    "- Egalik: **my, your, his, her, our, their** + ot: **his** name.",
  ], "Ega — I/he, fe'ldan keyin — me/him, egalik — my/his + ot."),
  R("a1-question-words", "A1", "Salomlashish va tanishuv", "So'roq so'zlari: what / where / when / how", "Qaysi so'roq so'zi?", [
    "- **Where** — joy (qayerda?)",
    "- **When** — vaqt (qachon?)",
    "- **Who** — kishi (kim?)",
    "- **How old** — yosh, **How much** — narx/miqdor",
    "- **What** — narsa (nima?)",
  ], "Javobga qarang: joy → where, vaqt → when, yosh → how old."),
  R("a1-vocab", "A1", "Salomlashish va tanishuv", "A1 so'z boyligi: kundalik so'zlar", "So'z ma'nosi", [
    "A1 darajasida oila, kunlar, raqamlar, kiyim, ovqat va kundalik harakatlar bilan bog'liq ~500 so'z bilinishi kerak.",
    "Gapdagi kalit so'zga qarang: **thirsty** (chanqagan) → water, **cold** (sovuq) → coat.",
  ], "Gapdagi kalit so'z to'g'ri javobga ishora qiladi."),
  // A2
  R("a2-present-continuous", "A2", "Present Continuous", "Present Continuous: am / is / are + -ing", "Hozir yoki odatda?", [
    "Hozir, ayni paytda bo'layotgan yoki vaqtinchalik ish: **am / is / are + fe'l-ing**.",
    "Belgilar: now, at the moment, today, Look!, Listen!",
    "Odatiy, takrorlanadigan ish uchun Present Simple: I usually **walk**.",
  ], "Hozir / vaqtincha → is + -ing; odatda → Present Simple."),
  R("a2-past-continuous", "A2", "Past Continuous", "Past Continuous: was / were + -ing", "Qaysi harakat davom etayotgan edi?", [
    "O'tmishda ma'lum paytda davom etayotgan ish: **was / were + -ing**: I **was watching** TV at 8.",
    "Uzun harakatni qisqa harakat bo'ladi → qisqasi Past Simple: I was watching TV when you **called**.",
  ], "Uzun fon — was/were + -ing, uni bo'lgan qisqa voqea — Past Simple."),
  R("a2-present-perfect", "A2", "Present Perfect", "Present Perfect: have / has + V3", "Qachon Present Perfect?", [
    "**have / has + V3** — tajriba (ever, never), natija hozir muhim (already, just, yet), hozirgacha davom etayotgan holat (for, since).",
    "- **for** + muddat: for five years",
    "- **since** + boshlanish nuqtasi: since 2019",
  ], "have/has + V3; for — muddat, since — boshlanish nuqtasi."),
  R("a2-modals", "A2", "Modal fe'llar", "must / have to / should", "Majburiyat, maslahat yoki zarurat yo'qligi?", [
    "- **must / have to** — majburiyat (qoida, qonun).",
    "- **mustn't** — taqiq (mumkin emas).",
    "- **don't have to** — shart emas (lekin mumkin).",
    "- **should** — maslahat.",
  ], "mustn't = taqiq, don't have to = shart emas."),
  R("a2-prepositions", "A2", "Predloglar: vaqt va joy", "Vaqt predloglari: in / on / at", "in, on yoki at?", [
    "- **at** + aniq vaqt: at 9 o'clock, at night",
    "- **on** + kun va sana: on Monday, on 5 June",
    "- **in** + oy, yil, fasl, kun qismi: in May, in 2020, in the morning",
  ], "at — soat, on — kun/sana, in — oy/yil/fasl."),
  R("a2-adverbs", "A2", "Sifat va ravishlar", "Sifat yoki ravish: good / well, careful / carefully", "Sifatmi, ravishmi?", [
    "Sifat otni tasvirlaydi: a **careful** driver.",
    "Ravish fe'lni tasvirlaydi: drive **carefully**. Ko'pincha sifat + **-ly**.",
    "Istisno: good → **well**, fast → fast, hard → hard.",
  ], "Fe'l qanday bajariladi → ravish (-ly); good → well."),
  R("a2-vocab", "A2", "Takrorlash: A1 dan A2 ga", "A2 so'z boyligi: tez-tez adashtiriladigan so'zlar", "Ma'nosi yaqin so'zlar", [
    "- **lend** — qarzga bermoq; **borrow** — qarzga olmoq.",
    "- **book** a table / a room — oldindan band qilmoq.",
  ], "lend — beraman, borrow — olaman."),
  // B1
  R("b1-ppc", "B1", "Present Perfect Continuous", "Present Perfect Continuous: have been + -ing", "Qachon have been + -ing?", [
    "O'tmishda boshlanib hozirgacha davom etayotgan yoki hozir natijasi ko'rinib turgan jarayon: **have / has been + -ing**.",
    "How long **have** you **been learning** English? It **has been raining** since morning.",
  ], "Jarayon hozirgacha → have/has been + -ing."),
  R("b1-narrative", "B1", "O'tmishni hikoya qilish", "Hikoya zamonlari: Past Perfect va used to", "Qaysi voqea oldin bo'lgan?", [
    "O'tmishdagi voqeadan **oldin** bo'lgan ish — Past Perfect: **had + V3**: When we arrived, the film **had** already **started**.",
    "Ilgari bo'lib, endi yo'q odat — **used to + fe'l**: I **used to** play tennis.",
  ], "Oldingi voqea — had + V3; eski odat — used to + fe'l."),
  R("b1-future", "B1", "Kelajak shakllari", "Kelajak: going to, will, Present Simple (jadval)", "Qaysi kelajak shakli?", [
    "- **going to** — oldindan qilingan reja yoki ko'rinib turgan belgi.",
    "- **will** — shu zahoti qaror, va'da, taxmin.",
    "- **Present Simple** — jadval va dastur: The train **leaves** at 6.45.",
  ], "Reja — going to, jadval — Present Simple, shu zahoti — will."),
  R("b1-second-conditional", "B1", "Second conditional va wish", "Second conditional va wish (hozir)", "Xayoliy hozirgi holat", [
    "Xayoliy yoki ehtimoli kam hozirgi holat: **If + Past Simple, would + fe'l**: If I **had** money, I **would travel**.",
    "be — barcha shaxslarda ko'pincha **were**: If I **were** you…",
    "Hozirgi holatdan norozilik: **I wish + Past Simple**: I wish I **were** taller.",
  ], "If + o'tgan zamon, would + fe'l; wish + o'tgan zamon."),
  R("b1-modals", "B1", "Modal fe'llar: ehtimol va maslahat", "Taxmin modallari: must / might / can't; ought to", "Qanchalik ishonchli?", [
    "- **must** — deyarli aniq (ha).",
    "- **might / may / could** — ehtimol.",
    "- **can't** — deyarli aniq (yo'q).",
    "Modaldan keyin **to** yo'q; istisno: **ought to**.",
  ], "must — aniq ha, can't — aniq yo'q, might — balki."),
  R("b1-relative", "B1", "Nisbiy gaplar", "Nisbiy olmoshlar: who / which / that / whose", "Qaysi nisbiy olmosh?", [
    "- **who** — odam, **which** — narsa, **that** — ikkalasi (aniqlovchi gapda).",
    "- **whose** — egalik: the man **whose** car…",
  ], "Odam — who, narsa — which/that, egalik — whose."),
  R("b1-questions", "B1", "Savol shakllari va muloqot", "Tag questions va bilvosita savollar", "So'z tartibi va qo'shimcha savol", [
    "Tag question: darak gap ijobiy bo'lsa — inkor dum: You're from Bukhara, **aren't you**?",
    "Bilvosita savolda darak tartib: Could you tell me where the station **is**? (where is the station emas).",
  ], "Ijobiy gap — inkor dum; bilvosita savol — ega + fe'l."),
  R("b1-phrasal", "B1", "Frazali fe'llar va iboralar", "Frazali fe'llar", "Ma'no ikkinchi qismga bog'liq", [
    "Frazali fe'lning ma'nosi ko'pincha so'zma-so'z emas: **take off** — yechmoq, **look forward to** — intiqlik bilan kutmoq.",
    "look forward **to** + -ing: I'm looking forward to **seeing** you.",
  ], "Frazali fe'llarni ibora sifatida yodlang."),
  R("b1-vocab", "B1", "Fikr bildirish va yozish", "Fikr bildirish iboralari", "Turg'un iboralar", [
    "Fikr bildirish: **In my opinion**, …; **As far as I'm concerned**, …; **I believe that** …",
    "«In my mind» — xayolimda (fikrimcha emas).",
  ], "Fikrimcha = In my opinion."),
  // B2
  R("b2-wish", "B2", "Afsus va orzu: wish, if only, I'd rather", "wish / if only / it's time", "Qaysi zamon?", [
    "- O'tmishdan afsus: **wish + Past Perfect**: I wish I **hadn't spent** so much.",
    "- Hozirgi qobiliyat: **wish + could**: She wishes she **could** speak French.",
    "- **It's time + ega + Past Simple**: It's time we **went** home.",
  ], "O'tmishga afsus — had + V3; hozir — Past Simple / could."),
  R("b2-future-perfect", "B2", "Kelajak: Future Perfect", "Future Perfect va Future Continuous", "Kelajakdagi qaysi nuqta?", [
    "- **will have + V3** — kelajakdagi muddatgacha tugagan bo'ladi: By 2030 I **will have finished**.",
    "- **will be + -ing** — kelajakdagi paytda davom etayotgan bo'ladi: This time next week I'**ll be lying** on a beach.",
  ], "by + muddat → will have + V3; this time next week → will be + -ing."),
  R("b2-modals-past", "B2", "Modal fe'llar o'tmishda", "O'tmish modallari: may have / should have / needn't have", "O'tmish haqida taxmin yoki afsus", [
    "- **may / might have + V3** — o'tmish haqida ehtimol.",
    "- **should have + V3** — qilinishi kerak edi (qilinmagan).",
    "- **needn't have + V3** — qilingan, lekin keragi yo'q edi.",
  ], "should have — qilmadim (afsus), needn't have — qildim (keraksiz)."),
  R("b2-passive", "B2", "Passive: murakkab shakllar", "Murakkab passiv: is believed to have, need to be done", "Passiv qanday quriladi?", [
    "- **is said / believed / thought + to + fe'l** (hozir) yoki **to have + V3** (o'tmish): He is believed **to have left** last week.",
    "- Narsa harakatni bajarmasa — passiv infinitiv: The documents need **to be signed**.",
  ], "O'tmish haqida — to have + V3; narsa bajarmaydi — to be + V3."),
  R("b2-emphasis", "B2", "Urg'u va inversiya", "Urg'uli tuzilmalar: What I need is…, It was … who", "Qismni ajratib ko'rsatish", [
    "- **What** + ega + fe'l + **is/was** …: **What** I need is a holiday.",
    "- **It is/was** + ajratilgan qism + **who/that** …: It was my sister **who** told me.",
  ], "What I need is…; It was X who/that…"),
  R("b2-linkers", "B2", "Bog'lovchilar va matn tuzish", "Bog'lovchilar: despite / although, so that / in order to", "Keyin nima keladi?", [
    "- **despite / in spite of** + ot yoki -ing; **although** + to'liq gap.",
    "- **so that** + gap (ko'pincha can/could); **in order to** + fe'l.",
  ], "despite + -ing/ot, although + gap; so that + gap, in order to + fe'l."),
  R("b2-word-formation", "B2", "So'z yasash va iboralar", "-ed / -ing sifatlar va so'z turkumlari", "Qaysi so'z turkumi kerak?", [
    "- **-ing** sifat — narsa qanday: a **boring** film.",
    "- **-ed** sifat — odam o'zini qanday his qiladi: I was **bored**.",
    "Passivda fe'lning 3-shakli: forbid → **forbidden**.",
  ], "Narsa — boring, odam — bored."),
  R("b2-formal", "B2", "Rasmiy yozuv va nutq", "Rasmiy xat iboralari", "Rasmiy uslub", [
    "Rasmiy xat: I am writing **to complain about** / **to enquire about** / **to apply for** …",
    "to'dan keyin fe'lning oddiy shakli keladi: to **complain** (complaint — ot).",
  ], "I am writing to + fe'l."),
  // C1
  R("c1-cleft", "C1", "Urg'u va axborot tuzilishi", "Cleft gaplar: It wasn't until…, All I want is…", "Ajratilgan qism", [
    "- **It wasn't until** … **that** …: It wasn't until I left home **that** I realised…",
    "- **All** I want **is** … (birlik fe'l).",
    "- **The reason why** … **is** …",
  ], "It wasn't until X that…; All I want is…"),
  R("c1-participle", "C1", "Participle clauses", "Participle clauses: having done, built, sitting", "Qaysi sifatdosh?", [
    "- **-ing** — faol, bir vaqtda: The man **sitting** next to me…",
    "- **V3** — passiv: **Built** in 1890, the bridge…",
    "- **Having + V3** — oldin tugagan faol harakat: **Having sent** the email, she…",
  ], "Faol — -ing, passiv — V3, oldin tugagan — having + V3."),
  R("c1-hedging", "C1", "Akademik til: nominalizatsiya va hedging", "Hedging va nominalizatsiya", "Ehtiyotkor va rasmiy ifoda", [
    "Akademik matnda qat'iylik yumshatiladi: The results **suggest** that… (prove emas), There is a **possibility** that…",
    "Nominalizatsiya: fe'l o'rniga ot: decide → **decision**.",
  ], "suggest / indicate / may — ehtiyotkor; fe'l → ot."),
  R("c1-ellipsis", "C1", "Murakkab tuzilmalar: subjunctive va ellipsis", "Ellipsis: yordamchi fe'l bilan qisqartirish", "Takrorlamaslik", [
    "Oldingi fe'l takrorlanmaydi, faqat yordamchi fe'l qoladi: She said she would finish it, and she **did**.",
    "I'd love to, but I **can't**. (come takrorlanmaydi)",
  ], "Takrorlanadigan qism tushiriladi, yordamchi fe'l qoladi."),
  R("c1-vocab", "C1", "C1 so'z boyligi", "C1 so'z boyligi: paronimlar va kollokatsiyalar", "O'xshash so'zlar", [
    "Shakli o'xshash, ma'nosi boshqa so'zlar: **adopt** (qabul qilmoq) / **adapt** (moslashtirmoq); **conscious** / **conscience**; **compelling** / **compulsory**.",
    "Fe'l + to'ldiruvchi to'g'ridan-to'g'ri: **address** a problem (deal **with** a problem).",
  ], "Paronimlarni ma'nosi bilan birga yodlang."),
  R("c1-academic", "C1", "Akademik yozuv", "Akademik bog'lovchilar", "Fikrlar orasidagi munosabat", [
    "- **On the whole** — umuman olganda.",
    "- **On the contrary** — aksincha (oldingi fikrni rad etadi).",
    "- **while** + sifat/gap — garchi: This approach, **while** effective, is expensive.",
  ], "Bog'lovchi ma'nosi fikrlar munosabatiga mos bo'lsin."),
  // C2
  R("c2-idioms", "C2", "Idiomatik ifoda va frazeologiya", "Idiomalar", "Turg'un ibora", [
    "Idioma so'zlari almashtirilmaydi: **bury the hatchet** (yarashmoq), **play it by ear** (vaziyatga qarab), **learn the ropes** (ishni o'rganmoq), **beat about the bush** (aylantirib gapirmoq).",
  ], "Idiomani to'liq, o'zgartirmasdan yodlang."),
  R("c2-ellipsis", "C2", "Ellipsis va siqiq nutq", "Ellipsis va substitution: so / not", "Qisqa javob", [
    "Fikrni qaytarmaslik uchun: I hope **so** / I hope **not**; I'm afraid **not**.",
    "Fe'l o'rnida yordamchi fe'l: He promised to help, but he never **did**.",
  ], "I hope so / I hope not; yordamchi fe'l fe'lni almashtiradi."),
  R("c2-nuance", "C2", "Ma'no nozikliklari", "Ma'no nozikliklari: yaqin va o'xshash so'zlar", "Aniq so'z tanlash", [
    "C2 darajasida ma'nosi yaqin so'zlarning farqi muhim: **tactless** (beodob) / **tactful** (odobli) / **tactical** (taktik).",
    "Kollokatsiya: **tarnish** a reputation, prices **soar**, **circumstantial** evidence.",
  ], "So'zni kontekst va kollokatsiya bilan tanlang."),
  R("c2-grammar", "C2", "Grammatik nozikliklar", "Shartli inversiya va rasmiy tuzilmalar", "Rasmiy so'z tartibi", [
    "- **Should** you require… = If you require…",
    "- **Were it not for** … = If it weren't for …",
    "- **No sooner** had … **than** …; **Little did** he know…",
  ], "Should/Were + ega …; No sooner … than; Little did + ega."),
  R("c2-academic", "C2", "Ilmiy yozuv", "Ilmiy uslub: aniqlik va ehtiyotkorlik", "Ilmiy kollokatsiyalar", [
    "interpret **with caution**; data are **consistent with** previous research.",
    "Ilmiy matnda xulosa ehtiyotkor ifodalanadi.",
  ], "with caution; consistent with."),
  R("c2-pragmatics", "C2", "Pragmatika va nutq madaniyati", "Pragmatika: muloyim javoblar", "So'zma-so'z emas, ma'no", [
    "«Would you mind…?» — «Qarshi emasmisiz?». Rozilik javobi — **Not at all** / **No, of course not** (ya'ni qarshi emasman).",
    "«Yes» bu yerda «qarshiman» degani bo'ladi.",
  ], "Would you mind…? — Not at all = mayli."),
];

// ───────────────────────────── Tuzatishlar (mavjud kalitlar) ─────────────────────────────

export const FIXES: Record<string, PlacementQuestionSeed> = {
  // "She is the teacher" ham grammatik — ikki javobli edi
  "en-a1-08": { level: "A1", ...Q("a1-articles", "Is there _____ bank near here?", ["a", "an", "the", "some"], 0, "Birinchi marta, istalgan bitta bank → a; bank undosh tovush bilan boshlanadi.") },
  // B1 dagi Present Perfect savollari A2 mavzusi edi → B1 mavzusi Present Perfect Continuous
  "en-b1-01": { level: "B1", ...Q("b1-ppc", "How long _____ you been learning English?", ["have", "did", "are", "were"], 0, "How long + have + been + -ing: jarayon hozirgacha davom etmoqda.") },
  "en-b1-02": { level: "B1", ...Q("b1-ppc", "It _____ since this morning, and the streets are flooded.", ["has been raining", "is raining", "rains", "was rain"], 0, "since + hozirgacha davom etgan jarayon → has been + -ing.") },
  "en-b1-03": { level: "B1", ...Q("b1-ppc", "Your eyes are red. _____ you been crying?", ["Have", "Did", "Are", "Were"], 0, "Hozir ko'rinib turgan natija → Have you been + -ing?") },
  // "will melt" ham to'g'ri edi
  "en-b1-05": { level: "B1", ...Q("b1-first-conditional", "If you heat ice, it _____.", ["melts", "melt", "melted", "melting"], 0, "Zero conditional — umumiy haqiqat: Present Simple, it → -s.") },
  // Second conditional (B1) savoli B2 da edi
  "en-b2-06": { level: "B2", ...Q("b2-conditionals-23", "If I _____ the alarm, I wouldn't have missed the flight.", ["had heard", "heard", "would hear", "have heard"], 0, "Third conditional: If + had + V3, would have + V3.") },
  // "is" ham mumkin edi (holat davom etsa backshift shart emas)
  "en-b2-07": { level: "B2", ...Q("b2-reported-speech", "At the party last night, she said she _____ tired and went home early.", ["was", "is", "will be", "has been"], 0, "Holat o'tmishda tugagan: am → was.") },
  // "live" ham mumkin edi
  "en-b2-08": { level: "B2", ...Q("b2-reported-speech", "He asked me where I _____ the night before.", ["had been", "have been", "am", "was being"], 0, "the night before — undan oldingi o'tmish: had been.") },
  // "soaked to the bone" ham ishlatiladi
  "en-c2-03": { level: "C2", ...Q("c2-collocations", "We got caught in the storm and were soaked to the _____.", ["skin", "flesh", "body", "clothes"], 0, "soaked to the skin — turg'un ibora.") },
};

// ───────────────────────────── Yangi savollar ─────────────────────────────

export const NEW_QUESTIONS: Record<string, QuestionSeed[]> = {
  A1: [
    Q("a1-can", "_____ you swim?", ["Can", "Do", "Are", "Does"], 0, "Qobiliyat so'rog'i: Can + ega + fe'l."),
    Q("a1-can", "My grandmother can't _____ English.", ["speak", "speaks", "speaking", "to speak"], 0, "can't dan keyin fe'l o'zgarmaydi, to yo'q."),
    Q("a1-can", "He _____ play the guitar very well.", ["can", "cans", "is can", "do can"], 0, "can barcha shaxslarda bir xil: he can."),
    Q("a1-pronouns", "This is my brother. _____ name is Aziz.", ["His", "He", "Her", "Him"], 0, "Erkak kishining narsasi → his."),
    Q("a1-pronouns", "Hello! I'm Malika. What's _____ name?", ["you", "your", "yours", "you're"], 1, "Egalik + ot: your name."),
    Q("a1-pronouns", "Can you help _____? I'm lost.", ["I", "my", "me", "mine"], 2, "Fe'ldan keyin to'ldiruvchi shakl: me."),
    Q("a1-question-words", "_____ old are you? — I'm fourteen.", ["How", "What", "Where", "Who"], 0, "Yosh so'raladi: How old."),
    Q("a1-question-words", "_____ do you live? — In Samarkand.", ["What", "Where", "When", "Who"], 1, "Javob joy → Where."),
    Q("a1-question-words", "_____ is your birthday? — In May.", ["Where", "Who", "When", "Which"], 2, "Javob vaqt → When."),
    Q("a1-present-simple-s", "_____ your parents work in a bank?", ["Does", "Do", "Are", "Is"], 1, "your parents = they → Do."),
    Q("a1-present-simple-s", "What time _____ she get up?", ["do", "does", "is", "has"], 1, "she → does; asosiy fe'l o'zgarmaydi."),
    Q("a1-be", "_____ your brother at home now?", ["Is", "Are", "Am", "Does"], 0, "your brother = he → Is."),
    Q("a1-vocab", "My mother's sister is my _____.", ["aunt", "uncle", "cousin", "niece"], 0, "Onaning opa-singlisi — aunt (xola)."),
    Q("a1-vocab", "We usually eat breakfast in the _____.", ["morning", "night", "evening", "afternoon"], 0, "breakfast — nonushta, ertalab."),
    Q("a1-vocab", "Monday, Tuesday, _____, Thursday.", ["Wednesday", "Friday", "Sunday", "Saturday"], 0, "Haftaning 3-kuni — Wednesday."),
    Q("a1-vocab", "It's very cold today. Put on your _____.", ["coat", "shorts", "sandals", "T-shirt"], 0, "cold (sovuq) → coat (palto)."),
    Q("a1-vocab", "I'm thirsty. Can I have some _____?", ["water", "bread", "rice", "cheese"], 0, "thirsty — chanqagan → water."),
    Q("a1-vocab", "Ten plus five is _____.", ["fifteen", "fifty", "five", "fourteen"], 0, "10 + 5 = 15 — fifteen (fifty = 50)."),
  ],
  A2: [
    Q("a2-present-continuous", "Be quiet! The baby _____.", ["sleeps", "is sleeping", "sleep", "slept"], 1, "Hozir bo'layotgan ish: is + -ing."),
    Q("a2-present-continuous", "Look! Those boys _____ football in the rain.", ["are playing", "play", "plays", "is playing"], 0, "Look! — hozir; boys (ko'plik) → are + -ing."),
    Q("a2-present-continuous", "I usually walk to school, but today I _____ the bus.", ["take", "am taking", "takes", "took"], 1, "today — vaqtinchalik holat → am + -ing."),
    Q("a2-past-continuous", "I _____ TV when you called me.", ["watched", "was watching", "am watching", "were watching"], 1, "Uzun fon harakat → was + -ing."),
    Q("a2-past-continuous", "What _____ you doing at 8 o'clock last night?", ["were", "did", "was", "are"], 0, "O'tmishdagi aniq payt + you → were … -ing."),
    Q("a2-past-continuous", "While she was cooking, the lights suddenly _____ out.", ["went", "were going", "go", "was going"], 0, "Uzun harakatni bo'lgan qisqa voqea → Past Simple."),
    Q("a2-present-perfect", "Have you ever _____ to London?", ["been", "went", "go", "was"], 0, "Have you ever + V3 (be → been)."),
    Q("a2-present-perfect", "She has already _____ her homework.", ["done", "did", "do", "doing"], 0, "has already + V3 (do – did – done)."),
    Q("a2-present-perfect", "We have lived here _____ 2019.", ["since", "for", "from", "ago"], 0, "Boshlanish nuqtasi → since."),
    Q("a2-modals", "You _____ wear a seatbelt in the car. It's the law.", ["must", "mustn't", "don't have to", "can't"], 0, "Qonun — majburiyat → must."),
    Q("a2-modals", "It's Sunday tomorrow, so I _____ get up early.", ["don't have to", "mustn't", "have to", "must"], 0, "Shart emas → don't have to (mustn't = taqiq)."),
    Q("a2-modals", "You look tired. You _____ go to bed early.", ["should", "shouldn't", "mustn't", "can't"], 0, "Maslahat → should."),
    Q("a2-prepositions", "My birthday is _____ 5 June.", ["on", "in", "at", "by"], 0, "Sana → on."),
    Q("a2-prepositions", "The meeting starts _____ 9 o'clock.", ["at", "on", "in", "for"], 0, "Aniq soat → at."),
    Q("a2-adverbs", "She speaks English very _____.", ["good", "well", "nice", "goodly"], 1, "Fe'lni tasvirlaydi → ravish: well."),
    Q("a2-adverbs", "Please drive _____. The road is wet.", ["careful", "carefully", "care", "caring"], 1, "Qanday haydash → ravish: carefully."),
    Q("a2-vocab", "I'd like to _____ a table for two, please.", ["book", "buy", "take", "write"], 0, "book a table — stol band qilmoq."),
    Q("a2-vocab", "Can you _____ me your pen? I'll give it back.", ["lend", "borrow", "rent", "owe"], 0, "lend — qarzga bermoq (borrow — qarzga olmoq)."),
  ],
  B1: [
    Q("b1-narrative", "When we got to the cinema, the film _____ already started.", ["had", "has", "was", "did"], 0, "Kinoteatrga kelishdan oldin boshlangan → had + V3."),
    Q("b1-narrative", "I _____ play tennis a lot when I was younger, but now I don't.", ["used to", "use to", "was used to", "am used to"], 0, "Eski odat → used to + fe'l."),
    Q("b1-future", "I've just bought some paint. I _____ paint my room this weekend.", ["am going to", "will", "would", "am"], 0, "Oldindan qilingan reja → going to."),
    Q("b1-future", "The train _____ at 6.45 tomorrow morning, so don't be late.", ["leaves", "leave", "leaving", "has left"], 0, "Jadval bo'yicha kelajak → Present Simple."),
    Q("b1-second-conditional", "If I _____ more money, I would travel around the world.", ["had", "have", "will have", "would have"], 0, "Second conditional: If + Past Simple."),
    Q("b1-second-conditional", "What would you do if you _____ a ghost?", ["saw", "see", "will see", "would see"], 0, "Xayoliy holat: if + Past Simple."),
    Q("b1-second-conditional", "I wish I _____ taller.", ["were", "am", "will be", "be"], 0, "Hozirgi holatdan norozilik: wish + were."),
    Q("b1-modals", "She isn't answering her phone. She _____ be asleep.", ["might", "must to", "can to", "should to"], 0, "Ehtimol → might + fe'l (modaldan keyin to yo'q)."),
    Q("b1-modals", "That _____ be Tom at the door — he's in Japan this week.", ["can't", "must", "might", "should"], 0, "Imkonsiz → can't."),
    Q("b1-modals", "You _____ to see a doctor about that cough.", ["ought", "should", "must", "had"], 0, "Faqat ought keyin to oladi: ought to."),
    Q("b1-relative", "The man _____ car was stolen called the police.", ["whose", "who", "which", "that"], 0, "Egalik (uning mashinasi) → whose."),
    Q("b1-relative", "Is this the bag _____ you bought yesterday?", ["that", "who", "whose", "where"], 0, "Narsa → that / which."),
    Q("b1-questions", "You're from Bukhara, _____ you?", ["aren't", "don't", "isn't", "won't"], 0, "You are → aren't you?"),
    Q("b1-questions", "Could you tell me where the station _____?", ["is", "is it", "does", "it is the"], 0, "Bilvosita savol: ega + fe'l (where the station is)."),
    Q("b1-phrasal", "Please _____ your shoes before you come in.", ["take off", "take on", "take out", "take up"], 0, "take off — yechmoq."),
    Q("b1-phrasal", "I'm looking _____ to the holidays.", ["forward", "after", "for", "up"], 0, "look forward to — intiqlik bilan kutmoq."),
    Q("b1-vocab", "In my _____, social media does more harm than good.", ["opinion", "mind", "thinking", "idea"], 0, "Fikrimcha = In my opinion."),
    Q("b1-gerund-infinitive", "I'm not used to _____ up so early.", ["getting", "get", "got", "have got"], 0, "be used to + -ing (to — predlog)."),
  ],
  B2: [
    Q("b2-wish", "I wish I _____ so much money last weekend.", ["hadn't spent", "didn't spend", "haven't spent", "wouldn't spend"], 0, "O'tmishdan afsus → wish + had + V3."),
    Q("b2-wish", "She wishes she _____ speak French.", ["could", "can", "will", "is able"], 0, "Hozirgi qobiliyat haqida orzu → wish + could."),
    Q("b2-wish", "It's nearly midnight. It's time we _____ home.", ["went", "go", "will go", "are going"], 0, "It's time + ega + Past Simple."),
    Q("b2-future-perfect", "By 2030, I _____ my degree.", ["will have finished", "will finish", "finish", "am finishing"], 0, "by + kelajak muddati → will have + V3."),
    Q("b2-future-perfect", "This time next week, we _____ on a beach in Turkey.", ["will be lying", "will lie", "lie", "will have lain"], 0, "Kelajakdagi paytda davom etadi → will be + -ing."),
    Q("b2-modals-past", "You _____ have called a taxi — I could have driven you.", ["needn't", "mustn't", "can't", "couldn't"], 0, "Qilingan, lekin keragi yo'q edi → needn't have + V3."),
    Q("b2-modals-past", "Ali isn't here yet. He _____ missed the bus.", ["may have", "may", "has to", "must to"], 0, "O'tmish haqida ehtimol → may have + V3."),
    Q("b2-modals-past", "I _____ have studied harder. Now I've failed the exam.", ["should", "must", "can", "would to"], 0, "Afsus → should have + V3."),
    Q("b2-passive", "He is believed _____ the country last week.", ["to have left", "to leave", "leaving", "that he left"], 0, "O'tmishdagi ish haqida → is believed to have + V3."),
    Q("b2-passive", "My bike _____ while I was in the shop.", ["was stolen", "stole", "has stolen", "is stealing"], 0, "Velosiped o'g'irlamaydi → passiv: was + V3."),
    Q("b2-passive", "These documents need _____ by Friday.", ["to be signed", "to sign", "sign", "be signed"], 0, "Hujjat o'zi imzolamaydi → to be + V3."),
    Q("b2-emphasis", "_____ I need is a long holiday.", ["What", "That", "Which", "It"], 0, "What I need is… — urg'uli tuzilma."),
    Q("b2-emphasis", "It was my sister _____ told me the news.", ["who", "which", "what", "whom"], 0, "It was + odam + who…"),
    Q("b2-linkers", "_____ being very tired, she finished the report.", ["Despite", "Although", "However", "Even"], 0, "Despite + -ing (Although + to'liq gap)."),
    Q("b2-linkers", "He saved money _____ he could buy a car.", ["so that", "in order to", "because", "so as"], 0, "Maqsad + to'liq gap → so that."),
    Q("b2-word-formation", "The film was really _____ — I fell asleep.", ["boring", "bored", "bore", "boredom"], 0, "Film (narsa) qanday → boring."),
    Q("b2-word-formation", "Smoking is _____ in all public buildings.", ["forbidden", "forbid", "forbidding", "forbade"], 0, "Passiv: is + V3 (forbid – forbade – forbidden)."),
    Q("b2-formal", "I am writing to _____ about the poor service I received.", ["complain", "complaint", "complaining", "complained"], 0, "to + fe'l: complain (complaint — ot)."),
  ],
  C1: [
    Q("c1-cleft", "It wasn't until I left home _____ I realised how much my parents did for me.", ["that", "when", "which", "then"], 0, "It wasn't until … that …"),
    Q("c1-cleft", "All I want _____ a bit of peace and quiet.", ["is", "are", "be", "being"], 0, "All I want is … — birlik fe'l."),
    Q("c1-cleft", "The reason _____ I called is to apologise.", ["why", "which", "what", "because"], 0, "The reason why …"),
    Q("c1-participle", "_____ the email, she closed her laptop.", ["Having sent", "Sent", "Having been sent", "To send"], 0, "Oldin tugagan faol harakat → Having + V3."),
    Q("c1-participle", "The man _____ next to me on the plane was a famous chef.", ["sitting", "who sitting", "sits", "to sitting"], 0, "Faol sifatdosh: the man sitting …"),
    Q("c1-participle", "_____ in 1890, the bridge is still in use today.", ["Built", "Building", "Having built", "Being building"], 0, "Ko'prik qurilgan (passiv) → V3."),
    Q("c1-hedging", "The results _____ that the treatment may be effective.", ["suggest", "prove", "insist", "deny"], 0, "may bilan ehtiyotkor xulosa → suggest."),
    Q("c1-hedging", "There is a _____ that prices will rise further.", ["possibility", "possible", "possibly", "possibilities"], 0, "a + birlik ot → possibility."),
    Q("c1-hedging", "The government's _____ to raise taxes was unpopular.", ["decision", "decide", "decisive", "deciding"], 0, "Nominalizatsiya: egalikdan keyin ot → decision."),
    Q("c1-ellipsis", "She said she would finish it on time, and she _____.", ["did", "was", "has", "made"], 0, "Fe'l takrorlanmaydi: and she did."),
    Q("c1-ellipsis", "I'd love to come to the party, but I'm afraid I _____.", ["can't", "don't", "won't to", "haven't"], 0, "I'm afraid I can't (come)."),
    Q("c1-vocab", "The company has _____ a new policy on remote work.", ["adopted", "adapted", "adept", "adjusted"], 0, "adopt a policy — siyosatni qabul qilmoq."),
    Q("c1-vocab", "Her argument was so _____ that nobody could disagree.", ["compelling", "compulsive", "compulsory", "competing"], 0, "compelling — ishonarli."),
    Q("c1-vocab", "We need to _____ the problem before it gets worse.", ["address", "deal", "cope", "handle with"], 0, "address a problem (deal/cope with)."),
    Q("c1-vocab", "The meeting has been _____ until next Monday.", ["postponed", "delayed off", "cancelled out", "put up"], 0, "postpone — keyinga qoldirmoq."),
    Q("c1-vocab", "He made a _____ effort to be polite.", ["conscious", "conscience", "conscientious", "consciousness"], 0, "a conscious effort — ongli harakat."),
    Q("c1-academic", "_____, the data supports our original hypothesis.", ["On the whole", "On the contrary", "In contrast", "Otherwise"], 0, "Umuman olganda → On the whole."),
    Q("c1-academic", "This approach, _____ effective, is extremely expensive.", ["while", "despite", "however", "whereas"], 0, "while + sifat — garchi."),
  ],
  C2: [
    Q("c2-idioms", "After months of arguing, they finally decided to bury the _____.", ["hatchet", "axe", "sword", "knife"], 0, "bury the hatchet — yarashmoq."),
    Q("c2-idioms", "I'm not sure about the plan — let's play it by _____.", ["ear", "eye", "hand", "heart"], 0, "play it by ear — vaziyatga qarab ish tutmoq."),
    Q("c2-idioms", "The new manager is still learning the _____.", ["ropes", "strings", "lines", "wires"], 0, "learn the ropes — ishning nozik tomonlarini o'rganmoq."),
    Q("c2-idioms", "Stop beating about the _____ and tell me what happened.", ["bush", "tree", "field", "garden"], 0, "beat about the bush — aylantirib gapirmoq."),
    Q("c2-ellipsis", "He promised to help, but he never _____.", ["did", "done", "has", "made"], 0, "Fe'l o'rnida yordamchi: never did."),
    Q("c2-ellipsis", "'Will it rain tomorrow?' — 'I hope _____.'", ["not", "no", "don't", "not to"], 0, "Inkor substitution: I hope not."),
    Q("c2-nuance", "The scandal _____ his reputation beyond repair.", ["tarnished", "polished", "painted", "brightened"], 0, "tarnish a reputation — obro'ga dog' tushirmoq."),
    Q("c2-nuance", "She gave a _____ account of the events, leaving nothing out.", ["meticulous", "meddlesome", "menial", "mediocre"], 0, "meticulous — o'ta sinchkov, batafsil."),
    Q("c2-nuance", "His _____ remarks offended many people at the dinner.", ["tactless", "tactful", "tactical", "tactile"], 0, "tactless — beodob, nozik bo'lmagan."),
    Q("c2-nuance", "The evidence was purely _____; there was no direct proof.", ["circumstantial", "circumstance", "circumspect", "circular"], 0, "circumstantial evidence — bilvosita dalil."),
    Q("c2-nuance", "Prices have _____ over the past year, almost doubling.", ["soared", "sored", "soured", "sowed"], 0, "prices soar — narxlar keskin oshadi."),
    Q("c2-grammar", "Should you _____ any further assistance, please do not hesitate to contact us.", ["require", "required", "requiring", "to require"], 0, "Should + ega + oddiy fe'l = If you require."),
    Q("c2-grammar", "Were it not _____ your help, I would never have finished.", ["for", "of", "by", "with"], 0, "Were it not for … = If it weren't for …"),
    Q("c2-grammar", "No sooner had we sat down _____ the phone rang.", ["than", "when", "then", "that"], 0, "No sooner … than …"),
    Q("c2-grammar", "Little _____ that his life was about to change forever.", ["did he know", "he knew", "knew he", "he did know"], 0, "Little gap boshida → inversiya: did he know."),
    Q("c2-academic", "These findings should be interpreted with _____, given the small sample size.", ["caution", "cautious", "cautiously", "cautioning"], 0, "with + ot → caution."),
    Q("c2-academic", "The data are _____ with previous research.", ["consistent", "constant", "consisting", "insistent"], 0, "consistent with — mos keladi."),
    Q("c2-pragmatics", "'Would you mind closing the window?' — '_____.'", ["Not at all", "Yes, I mind", "No, I don't close", "Of course I mind"], 0, "Would you mind…? — Not at all = mayli, qarshi emasman."),
  ],
};

/** Yangi savol kalitlari: en-<daraja>-xNN (ro'yxatdagi o'rni bo'yicha) */
export const newQuestionKey = (level: string, index: number) => `en-${level.toLowerCase()}-x${String(index + 1).padStart(2, "0")}`;
