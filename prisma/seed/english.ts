/**
 * Inglis tili: CEFR darajalari (A1-C2), mavzu sarlavhalari, xato qoidalari (tushuntirishlar) va daraja aniqlash savollari.
 * Manba: CEFR can-do tavsiflari (Cambridge / Council of Europe) asosida tuzilgan BOSHLANG'ICH to'plam.
 * Mavzu mazmuni va yangi savollarni keyinroq ustoz/admin qo'shadi; so'z sonlari manbaga qarab farq qiladi (taxminiy).
 */

export type LevelSeed = {
  code: string;
  title: string;
  summary: string;
  vocabHint: string;
  canDo: string[];
  topics: string[];
};

export type RuleSeed = {
  key: string;
  level: string;
  topic: number; // mavzu tartib raqami (1 dan)
  title: string;
  tipTitle: string;
  tipBody: string;
  remember: string;
};

export type QuestionSeed = {
  rule: string;
  prompt: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  note: string;
};

export const LEVELS: LevelSeed[] = [
  {
    code: "A1",
    title: "Boshlang'ich",
    summary: "Eng oddiy kundalik iboralar va tanishuv.",
    vocabHint: "taxminan 500 ta so'z",
    canDo: [
      "O'zingizni tanishtirish, salomlashish va oddiy shaxsiy savollarga javob berish",
      "\"to be\", Present Simple va \"can\" bilan oddiy gaplar tuzish",
      "Raqamlar, kunlar, ranglar, oila va uy-ro'zg'or buyumlari kabi mavzulardagi ~500 ta so'z",
      "Sekin va aniq aytilgan oddiy gaplarni tushunish",
      "Do'kon, kafe, yo'l so'rash kabi eng oddiy vaziyatlarda gaplashish",
    ],
    topics: [
      "Salomlashish va tanishuv",
      "\"To be\" fe'li (am / is / are)",
      "Present Simple",
      "Artikllar: a / an / the",
      "There is / There are",
      "Can / can't",
    ],
  },
  {
    code: "A2",
    title: "Elementar",
    summary: "Kundalik mavzularda oddiy suhbat.",
    vocabHint: "taxminan 1000-1500 ta so'z",
    canDo: [
      "O'tgan voqealarni (Past Simple) va hozirgi jarayonni (Present Continuous) aytib berish",
      "Rejalarni going to / will bilan ifodalash",
      "Narsalarni solishtirish (bigger, the best) va miqdor so'zlarini (much / many / some / any) to'g'ri ishlatish",
      "Ovqatlanish, xarid, sayohat kabi tanish vaziyatlarda oddiy suhbat",
      "Qisqa xabar va oddiy xat yozish",
    ],
    topics: [
      "Past Simple",
      "Present Continuous",
      "Taqqoslash: comparatives va superlatives",
      "Miqdor so'zlari: some / any / much / many",
      "Kelasi zamon: going to va will",
      "Predloglar: vaqt va joy",
    ],
  },
  {
    code: "B1",
    title: "O'rta",
    summary: "Tanish mavzularda mustaqil muloqot.",
    vocabHint: "taxminan 2000-3000 ta so'z",
    canDo: [
      "Tajriba va voqealarni Present Perfect va Past Continuous bilan bayon qilish",
      "Zero va First conditional bilan shartli gaplar tuzish",
      "Passiv (Passive Voice) va modal fe'llardan foydalanish",
      "Ish, o'qish, sayohat va sevimli mashg'ulotlar haqida fikr bildirish va asoslash",
      "Tanish mavzudagi aniq nutq va oddiy matnlarni tushunish",
    ],
    topics: [
      "Present Perfect",
      "Past Continuous",
      "Zero va First conditional",
      "Modal fe'llar: must / have to / should",
      "Passive Voice",
      "Gerund va Infinitive",
    ],
  },
  {
    code: "B2",
    title: "O'rtadan yuqori",
    summary: "Murakkab mavzularda erkin va tabiiy muloqot.",
    vocabHint: "taxminan 4000-5000 ta so'z",
    canDo: [
      "Past Perfect, Second va Third conditional bilan murakkab gaplar tuzish",
      "Reported speech va relative clauses'ni to'g'ri ishlatish",
      "Ona tili egasi bilan tayyorgarliksiz, ravon suhbatlashish",
      "Mavhum va texnik mavzulardagi matnlarning asosiy g'oyasini tushunish",
      "Aniq, batafsil matn va insho yozish, fikrning ijobiy va salbiy tomonlarini ko'rsatish",
    ],
    topics: [
      "Past Perfect",
      "Second va Third conditional",
      "Reported speech",
      "Relative clauses",
      "Wish / If only",
      "Future Perfect va Future Continuous",
    ],
  },
  {
    code: "C1",
    title: "Ilg'or",
    summary: "Uzun va murakkab matn, ish va akademik muhit.",
    vocabHint: "taxminan 8000 ta so'z",
    canDo: [
      "Inversion, mixed conditional va causative (have something done) kabi murakkab tuzilmalarni ishlatish",
      "O'tmish haqidagi taxminlarni must have / can't have / should have bilan ifodalash",
      "Aniq tuzilmagan, tez nutqni ham tushunish",
      "Ish va akademik maqsadlarda fikrni ravon va moslashuvchan bayon qilish",
      "Uzun, murakkab matnlarni tushunish va yaxshi tuzilgan batafsil matn yozish",
    ],
    topics: [
      "Inversion (so'z tartibi o'zgarishi)",
      "Mixed conditionals",
      "Causative: have / get something done",
      "O'tmish modallari: must have, can't have, should have",
      "Cleft sentences",
      "Participle clauses",
    ],
  },
  {
    code: "C2",
    title: "Mukammal",
    summary: "Ona tili egasiga yaqin daraja.",
    vocabHint: "taxminan 16000 va undan ko'p so'z",
    canDo: [
      "Eshitgan va o'qigan deyarli hamma narsani osongina tushunish",
      "Ma'no nozikliklarini, ayniqsa murakkab vaziyatlarda, aniq ifodalash",
      "Collocation va idiomalarni tabiiy ishlatish",
      "Rasmiy uslub, subjunctive va murakkab bog'lovchi so'zlarni bemalol qo'llash",
      "Turli manbalardagi ma'lumotni jamlab, mantiqiy tuzilgan matn yozish",
    ],
    topics: [
      "Collocations va idiomalar",
      "Subjunctive va rasmiy uslub",
      "Bog'lovchi so'zlar (discourse markers)",
      "So'z yasalishi (word formation)",
      "Ellipsis va almashtirish",
      "Ma'no nozikliklari",
    ],
  },
];

export const RULES: RuleSeed[] = [
  // ───────── A1 ─────────
  {
    key: "a1-be",
    level: "A1",
    topic: 2,
    title: "\"To be\" fe'li: am / is / are",
    tipTitle: "Nima uchun aynan shu shakl kerak?",
    tipBody: [
      "\"To be\" fe'li ega (subject) ga qarab o'zgaradi:",
      "- I → **am**",
      "- he / she / it va bitta narsa → **is**",
      "- we / you / they va ko'plik → **are**",
      "Gapda boshqa fe'l bo'lmasa (masalan, \"She a student\"), \"to be\" qo'yish shart.",
    ].join("\n"),
    remember: "I am, He/She/It is, We/You/They are.",
  },
  {
    key: "a1-present-simple-s",
    level: "A1",
    topic: 3,
    title: "Present Simple: he / she / it + -s",
    tipTitle: "Nima uchun fe'lga -s qo'shiladi?",
    tipBody: [
      "Present Simple'da he / she / it (3-shaxs birlik) bilan fe'lga **-s / -es** qo'shiladi: play → plays, study → studies.",
      "Inkor va so'roq gaplarda yordamchi fe'l ishlatiladi: **do / does**. Bunda asosiy fe'l o'zgarmaydi:",
      "- He **doesn't like** coffee. (likes emas)",
      "- **Does** she **work** here?",
      "Ya'ni -s faqat darak gapda, yordamchi fe'l yo'q paytda qo'shiladi.",
    ].join("\n"),
    remember: "3-shaxs birlikda: darak gapda fe'l+s, inkor/so'roqda does + oddiy fe'l.",
  },
  {
    key: "a1-articles",
    level: "A1",
    topic: 4,
    title: "Artikllar: a / an / the",
    tipTitle: "Qaysi artikl kerak?",
    tipBody: [
      "- **a** — undosh tovush bilan boshlangan birinchi marta tilga olingan sanaladigan ot oldida: a teacher, a book.",
      "- **an** — unli TOVUSH bilan boshlansa: an apple, an hour (h aytilmaydi).",
      "- **the** — aniq, ikkala tomonga ma'lum yoki yagona narsa oldida: the moon, the sun.",
      "Tanlov harfga emas, birinchi tovushga bog'liq.",
    ].join("\n"),
    remember: "a + undosh tovush, an + unli tovush, the = aniq narsa.",
  },
  {
    key: "a1-there-is-are",
    level: "A1",
    topic: 5,
    title: "There is / There are",
    tipTitle: "is yoki are?",
    tipBody: [
      "\"There is / There are\" biror narsa **borligini** bildiradi. Fe'l keyingi otga moslashadi:",
      "- **There is** + birlik yoki sanalmaydigan ot: There is a park. There is some milk.",
      "- **There are** + ko'plik ot: There are two books.",
      "So'roq: **Is there** ...? / **Are there** ...?",
    ].join("\n"),
    remember: "Is there + birlik/sanalmaydigan, Are there + ko'plik.",
  },
  // ───────── A2 ─────────
  {
    key: "a2-past-simple",
    level: "A2",
    topic: 1,
    title: "Past Simple va noto'g'ri fe'llar",
    tipTitle: "Nima uchun o'tgan zamon shakli kerak?",
    tipBody: [
      "O'tgan vaqtni bildiruvchi so'zlar (yesterday, last night, ago) bo'lsa — **Past Simple**.",
      "- To'g'ri fe'llar: fe'l + **-ed** (work → worked).",
      "- Noto'g'ri fe'llar o'zining 2-shaklini (V2) oladi: go → **went**, see → **saw**.",
      "- Inkor va so'roqda **did / didn't** + fe'lning ODDIY shakli: I **didn't watch**, **Did** you **see**...?",
    ].join("\n"),
    remember: "did / didn't bilan fe'l o'zgarmaydi; darak gapda V2.",
  },
  {
    key: "a2-comparatives",
    level: "A2",
    topic: 3,
    title: "Taqqoslash: comparative va superlative",
    tipTitle: "Taqqoslash shaklini qanday yasaymiz?",
    tipBody: [
      "- Qisqa sifat: **-er / the -est**: cheap → cheaper → the cheapest.",
      "- Uzun sifat (2+ bo'g'in): **more / the most**: interesting → more interesting → the most interesting.",
      "- \"than\" bilan **comparative** ishlatiladi: cheaper **than**.",
      "- \"one of the ...\" va guruh ichidagi eng yuqori daraja uchun **the + superlative**.",
      "Ikki shaklni aralashtirmang: \"more cheaper\" xato.",
    ].join("\n"),
    remember: "Qisqa: -er/-est. Uzun: more/most. Ikkalasini birga ishlatmang.",
  },
  {
    key: "a2-quantifiers",
    level: "A2",
    topic: 4,
    title: "Miqdor so'zlari: some / any / much / many",
    tipTitle: "Qaysi miqdor so'zi to'g'ri?",
    tipBody: [
      "- **many** — sanaladigan ko'plik ot bilan: many people, many eggs.",
      "- **much** — sanalmaydigan ot bilan: much water, much time.",
      "- **some** — darak gapda; **any** — inkor va so'roq gapda.",
      "- \"too many / too much\" ham xuddi shu qoida bilan: too **many** people, too **much** noise.",
    ].join("\n"),
    remember: "Sanaladi → many; sanalmaydi → much. Darak → some; inkor/so'roq → any.",
  },
  {
    key: "a2-going-to-will",
    level: "A2",
    topic: 5,
    title: "Kelasi zamon: going to va will",
    tipTitle: "going to yoki will?",
    tipBody: [
      "- **be going to** — oldindan rejalashtirilgan ish yoki hozirgi belgilarga asoslangan bashorat: \"Look at the clouds! It **is going to** rain.\"",
      "- **will** — suhbat vaqtida qabul qilingan qaror, va'da, taklif: \"The phone is ringing. I'**ll** answer it.\"",
    ].join("\n"),
    remember: "Reja / aniq belgi → going to. Shu zahoti qaror → will.",
  },
  // ───────── B1 ─────────
  {
    key: "b1-present-perfect",
    level: "B1",
    topic: 1,
    title: "Present Perfect (have/has + V3)",
    tipTitle: "Nima uchun Present Perfect kerak?",
    tipBody: [
      "Present Perfect: **have / has + fe'lning 3-shakli (V3)**.",
      "Ishlatiladi: hayotiy tajriba (never, ever), hozirgacha davom etayotgan holat (**since / for**), natijasi hozir ko'rinib turgan ish (already, yet, just).",
      "- I have never **eaten** sushi. (ate emas)",
      "- She **has lived** here since 2020.",
      "- We **haven't seen** the film yet.",
      "Aniq o'tgan vaqt (yesterday, in 2019) aytilsa, Past Simple ishlatiladi.",
    ].join("\n"),
    remember: "have/has + V3. since / for / yet / ever / never bilan.",
  },
  {
    key: "b1-first-conditional",
    level: "B1",
    topic: 3,
    title: "Zero va First conditional",
    tipTitle: "Shart gapida qaysi zamon?",
    tipBody: [
      "- **Zero conditional** (umumiy haqiqat): If + Present Simple, **Present Simple**. If you heat ice, it **melts**.",
      "- **First conditional** (real kelajak): If + Present Simple, **will + fe'l**. If it rains, we **will stay** home.",
      "Muhim: **if** dan keyingi qismda will ishlatilmaydi: \"if I **have** time\", \"if I will have time\" emas.",
    ].join("\n"),
    remember: "if-qismida will yo'q: If + Present Simple.",
  },
  {
    key: "b1-passive",
    level: "B1",
    topic: 5,
    title: "Passive Voice (be + V3)",
    tipTitle: "Nima uchun passiv shakl kerak?",
    tipBody: [
      "Ish bajaruvchi emas, ish **o'zi** muhim bo'lsa, passiv ishlatiladi: **be + V3**.",
      "- Present: English **is spoken** all over the world.",
      "- Past: The window **was broken** yesterday.",
      "- Future: The bridge **will be built** next year.",
      "\"be\" ning shakli zamonni, V3 esa ma'noni beradi.",
    ].join("\n"),
    remember: "Passiv = be (zamonga mos) + V3.",
  },
  {
    key: "b1-gerund-infinitive",
    level: "B1",
    topic: 6,
    title: "Gerund va Infinitive",
    tipTitle: "-ing yoki to + fe'l?",
    tipBody: [
      "Ba'zi fe'llardan keyin **-ing** keladi: enjoy, avoid, finish, mind, suggest.",
      "Boshqalaridan keyin **to + fe'l**: decide, want, hope, plan, agree.",
      "- I enjoy **listening** to music.",
      "- She decided **to find** a new job.",
      "- He avoided **answering** the question.",
      "Bu ro'yxatni fe'llar bilan birga yodlash kerak.",
    ].join("\n"),
    remember: "enjoy / avoid / finish + -ing; decide / want / hope + to.",
  },
  // ───────── B2 ─────────
  {
    key: "b2-past-perfect",
    level: "B2",
    topic: 1,
    title: "Past Perfect va fe'lning 3-shakli (V3)",
    tipTitle: "Nima uchun V3 (masalan, \"gone\") to'g'ri javob?",
    tipBody: [
      "Past Perfect o'tmishda sodir bo'lgan ikkita harakatdan biri ikkinchisidan **oldin** sodir bo'lganini ifodalaydi.",
      "Qoida: **Subject (ega) + had + V3** (fe'lning 3-shakli).",
      "Noto'g'ri fe'llarning uch shakli bor, masalan go: V1 — go, V2 — went, V3 — **gone**.",
      "\"had already\" kelgani uchun fe'lning uchinchi shakli kerak. Shuning uchun go yoki went noto'g'ri.",
      "- When I got home, my sister **had already cooked** dinner.",
      "- He was nervous because he **had** never flown before.",
    ].join("\n"),
    remember: "Past Perfect zamonida had dan keyin har doim fe'lning V3 (uchinchi shakli) ishlatiladi.",
  },
  {
    key: "b2-conditionals-23",
    level: "B2",
    topic: 2,
    title: "Second va Third conditional",
    tipTitle: "Qaysi shartli tuzilma kerak?",
    tipBody: [
      "- **Second conditional** (hozirgi/kelajakdagi xayoliy holat): If + **Past Simple**, **would + fe'l**. If I **were** you, I **would accept** it. (xayoliy holatda ko'pincha were)",
      "- **Third conditional** (o'tmishdagi o'zgarmas holat): If + **Past Perfect**, **would have + V3**. If she **had studied**, she **would have passed**.",
      "Savol ham xuddi shunday: What **would** you do if you **won** the lottery?",
    ].join("\n"),
    remember: "2-shart: Past Simple + would. 3-shart: Past Perfect + would have V3.",
  },
  {
    key: "b2-reported-speech",
    level: "B2",
    topic: 3,
    title: "Reported speech (ko'chirma gap)",
    tipTitle: "Nima uchun zamon o'zgaradi?",
    tipBody: [
      "Birovning gapini ko'chirganda, odatda zamon bir pog'ona **orqaga** suriladi (backshift):",
      "- am/is → **was**; live → **lived**; will → **would**; have done → had done.",
      "- \"I will call you tomorrow\" → He said he **would call** me the next day.",
      "- Savol ko'chirmasida tartib darak gapdek bo'ladi: He asked where I **lived**.",
      "Vaqt so'zlari ham o'zgaradi: tomorrow → the next day, yesterday → the day before.",
    ].join("\n"),
    remember: "said / asked dan keyin zamon bir pog'ona orqaga: will → would, is → was.",
  },
  {
    key: "b2-relative-clauses",
    level: "B2",
    topic: 4,
    title: "Relative clauses: who / which / whose / where",
    tipTitle: "Qaysi bog'lovchi so'z kerak?",
    tipBody: [
      "- **who** — odamlar uchun (ega vazifasida): the woman **who** lives next door.",
      "- **which** — narsalar uchun.",
      "- **whose** — egalikni bildiradi (kimning / nimaning): the book **whose** cover is red.",
      "- **where** — joy uchun: the house **where** I was born.",
    ].join("\n"),
    remember: "who = odam, which = narsa, whose = egalik, where = joy.",
  },
  // ───────── C1 ─────────
  {
    key: "c1-inversion",
    level: "C1",
    topic: 1,
    title: "Inversion (so'z tartibining o'zgarishi)",
    tipTitle: "Nima uchun yordamchi fe'l ega oldiga o'tadi?",
    tipBody: [
      "Inkor yoki cheklovchi ravish gap boshiga chiqsa (**never, hardly, not only, no sooner, rarely**), ega va yordamchi fe'l o'rni almashadi, xuddi savoldagi kabi:",
      "- Never **have I seen** such a sunset.",
      "- Hardly **had we left** when it started to rain.",
      "- Not only **did he arrive** late, but he also forgot the documents.",
      "Yordamchi fe'l bo'lmasa, do/does/did qo'shiladi.",
    ].join("\n"),
    remember: "Never / hardly / not only + yordamchi fe'l + ega.",
  },
  {
    key: "c1-mixed-conditionals",
    level: "C1",
    topic: 2,
    title: "Mixed conditionals",
    tipTitle: "Shart va natija turli vaqtga tegishli",
    tipBody: [
      "- O'tmishdagi sabab → **hozirgi** natija: If + **Past Perfect**, **would + fe'l**. If I **had taken** the job, I **would be living** in London now.",
      "- Hozirgi doimiy holat → **o'tmishdagi** natija: If + **Past Simple**, **would have + V3**. If she **weren't** so shy, she **would have given** the presentation.",
      "Avval qaysi qism qaysi vaqtga tegishli ekanini aniqlang (now / last week kabi so'zlarga qarang).",
    ].join("\n"),
    remember: "Qismlarning vaqtini alohida aniqlang: o'tmish sabab + hozir natija yoki aksincha.",
  },
  {
    key: "c1-causative",
    level: "C1",
    topic: 3,
    title: "Causative: have / get something done",
    tipTitle: "Ishni boshqa kishi bajargan",
    tipBody: [
      "Ishni o'zimiz emas, kimdir **bizning uchun** qilganda: **have + narsa + V3**.",
      "- I **had** my car **repaired** yesterday.",
      "- She is going to have her hair **cut** tomorrow.",
      "Fe'lning o'zi (have) zamonga qarab o'zgaradi, narsadan keyingi fe'l esa doim V3.",
    ].join("\n"),
    remember: "have + narsa + V3 (make / do emas).",
  },
  {
    key: "c1-modals-past",
    level: "C1",
    topic: 4,
    title: "O'tmish modallari: must have / can't have / should have",
    tipTitle: "O'tmish haqida taxmin va pushaymonlik",
    tipBody: [
      "- **must have + V3** — o'tmish haqida deyarli aniq taxmin: They **must have gone** to bed.",
      "- **can't have + V3** — o'tmishda bo'lishi mumkin emas: He **can't have been** at home.",
      "- **should have + V3** — o'tmishdagi xato yoki pushaymonlik: You **should have told** me earlier.",
    ].join("\n"),
    remember: "modal + have + V3 = o'tmish haqida fikr.",
  },
  // ───────── C2 ─────────
  {
    key: "c2-collocations",
    level: "C2",
    topic: 1,
    title: "Collocation va turg'un birikmalar",
    tipTitle: "Nima uchun aynan shu so'z?",
    tipBody: [
      "Collocation — so'zlarning tabiiy birga kelishi. Ma'nosi yaqin so'z har doim ham mos kelmaydi:",
      "- a **heated** debate (hot debate emas)",
      "- a **pressing** need",
      "- soaked to the **skin**",
      "Bunday birikmalarni yakka so'z emas, butun birikma sifatida yodlang.",
    ].join("\n"),
    remember: "So'zni juftligi bilan o'rganing.",
  },
  {
    key: "c2-subjunctive",
    level: "C2",
    topic: 2,
    title: "Subjunctive va rasmiy uslub",
    tipTitle: "Nima uchun fe'l oddiy shaklda?",
    tipBody: [
      "insist, demand, recommend, suggest, **essential, vital, important** dan keyin that-gapida fe'l **oddiy shaklda** (to'siz) keladi, -s yoki zamon qo'shimchasisiz:",
      "- The committee insisted that he **attend** the meeting.",
      "- It is essential that every student **be** on time.",
      "**would rather + ega + Past Simple**: I would rather you **didn't** smoke here (hozirgi vaqt haqida).",
    ].join("\n"),
    remember: "insist / essential that + oddiy fe'l. would rather + ega + Past Simple.",
  },
  {
    key: "c2-discourse",
    level: "C2",
    topic: 3,
    title: "Bog'lovchi so'zlar (discourse markers)",
    tipTitle: "Gaplar orasidagi mantiqiy bog'lanish",
    tipBody: [
      "- **Despite / In spite of** + ot yoki -ing (although dan farqli, gap emas): Despite the rain, ...",
      "- **Nevertheless / nonetheless / however** — qarama-qarshilik (oldingisiga zid).",
      "- **Consequently / therefore** — natija.",
      "- **Moreover / besides** — qo'shimcha dalil.",
      "Oldin gaplar orasidagi ma'no munosabatini (sabab, zid, natija) aniqlang.",
    ].join("\n"),
    remember: "Zid → nevertheless, natija → consequently, qo'shimcha → moreover.",
  },
  {
    key: "c2-word-formation",
    level: "C2",
    topic: 4,
    title: "So'z yasalishi (word formation)",
    tipTitle: "Qaysi so'z turi kerak?",
    tipBody: [
      "Bo'shliqdan oldin va keyin kelgan so'zlarga qarab so'z turini aniqlang:",
      "- his / the / widespread dan keyin **ot** kerak: contribution, scepticism, introduction.",
      "- fe'ldan ot yasovchi qo'shimchalar: -tion, -ment, -ism, -ity.",
      "Fe'l (contribute) yoki sifat (introductory) shakli ot o'rniga mos kelmaydi.",
    ].join("\n"),
    remember: "his / the / sifatdan keyin ot kerak.",
  },
];

const Q = (rule: string, prompt: string, options: [string, string, string, string], correct: 0 | 1 | 2 | 3, note: string): QuestionSeed => ({
  rule,
  prompt,
  options,
  correct,
  note,
});

export const INSTRUCTION = "Choose the correct option to complete the sentence.";

export const QUESTIONS: Record<string, QuestionSeed[]> = {
  A1: [
    Q("a1-be", "My sister _____ a student.", ["am", "is", "are", "be"], 1, "My sister = she, shuning uchun is."),
    Q("a1-be", "We _____ from Uzbekistan.", ["is", "am", "are", "be"], 2, "We bilan are ishlatiladi."),
    Q("a1-be", "I _____ not tired today.", ["am", "is", "are", "do"], 0, "I bilan faqat am."),
    Q("a1-present-simple-s", "She _____ English every day.", ["study", "studies", "studys", "studying"], 1, "study → studies (y dan oldin undosh bo'lsa -ies)."),
    Q("a1-present-simple-s", "He _____ like coffee.", ["don't", "doesn't", "isn't", "not"], 1, "He bilan inkorda doesn't."),
    Q("a1-present-simple-s", "My brother _____ football on Sundays.", ["play", "plays", "playing", "is play"], 1, "My brother = he, fe'lga -s."),
    Q("a1-articles", "I have _____ apple in my bag.", ["a", "an", "the", "some"], 1, "apple unli tovush bilan boshlanadi."),
    Q("a1-articles", "She is _____ teacher.", ["a", "an", "the", "(no article)"], 0, "Kasb oldida a / an; teacher undosh tovush bilan boshlanadi."),
    Q("a1-articles", "Look at _____ moon! It is big tonight.", ["a", "an", "the", "some"], 2, "Moon yagona, shuning uchun the."),
    Q("a1-there-is-are", "There _____ two books on the table.", ["is", "are", "am", "be"], 1, "two books — ko'plik."),
    Q("a1-there-is-are", "There _____ a park near my house.", ["are", "is", "have", "has"], 1, "a park — birlik."),
    Q("a1-there-is-are", "_____ there any milk in the fridge?", ["Is", "Are", "Do", "Does"], 0, "milk — sanalmaydigan ot, birlik fe'l."),
  ],
  A2: [
    Q("a2-past-simple", "Yesterday we _____ to the cinema.", ["go", "went", "gone", "goes"], 1, "yesterday → Past Simple; go ning V2 si went."),
    Q("a2-past-simple", "I _____ watch TV yesterday because I was busy.", ["didn't", "don't", "wasn't", "not"], 0, "Past Simple inkori: didn't + oddiy fe'l."),
    Q("a2-past-simple", "_____ you see Anna at the party?", ["Do", "Did", "Were", "Have"], 1, "O'tgan zamon savoli did bilan."),
    Q("a2-comparatives", "This phone is _____ than that one.", ["cheap", "cheaper", "more cheap", "cheapest"], 1, "Qisqa sifat + -er + than."),
    Q("a2-comparatives", "Tashkent is one of _____ cities in Central Asia.", ["bigger", "the biggest", "more big", "biggest"], 1, "one of the + superlative."),
    Q("a2-comparatives", "This book is _____ than the film.", ["more interesting", "interestinger", "most interesting", "more interestinger"], 0, "Uzun sifat: more + sifat."),
    Q("a2-quantifiers", "How _____ water do you drink a day?", ["many", "much", "few", "a few"], 1, "water sanalmaydi → much."),
    Q("a2-quantifiers", "We don't have _____ eggs. Can you buy some?", ["some", "any", "much", "a little"], 1, "Inkor gapda any; eggs sanaladi."),
    Q("a2-quantifiers", "There are too _____ people in the room.", ["much", "many", "a little", "any"], 1, "people sanaladi → many."),
    Q("a2-going-to-will", "Look at those clouds! It _____ rain.", ["will", "is going to", "goes to", "going to"], 1, "Ko'rinib turgan belgi → going to."),
    Q("a2-going-to-will", "A: The phone is ringing.  B: I _____ answer it.", ["am going to", "will", "would", "am"], 1, "Shu zahoti qabul qilingan qaror → will."),
    Q("a2-going-to-will", "We _____ visit my grandparents next weekend. We've already bought the tickets.", ["will", "are going to", "are", "go"], 1, "Oldindan rejalangan ish → going to."),
  ],
  B1: [
    Q("b1-present-perfect", "I have never _____ sushi.", ["eat", "ate", "eaten", "eating"], 2, "have + V3 (eat – ate – eaten)."),
    Q("b1-present-perfect", "She _____ here since 2020.", ["lives", "has lived", "lived", "is living"], 1, "since bilan Present Perfect."),
    Q("b1-present-perfect", "We _____ the film yet.", ["didn't see", "haven't seen", "don't see", "hasn't seen"], 1, "yet bilan Present Perfect; we → have."),
    Q("b1-first-conditional", "If it rains tomorrow, we _____ at home.", ["stay", "will stay", "would stay", "stayed"], 1, "First conditional: will + fe'l."),
    Q("b1-first-conditional", "If you heat ice, it _____.", ["will melt", "melts", "melted", "would melt"], 1, "Umumiy haqiqat: Present Simple."),
    Q("b1-first-conditional", "I'll call you if I _____ time.", ["will have", "have", "would have", "had"], 1, "if dan keyin will ishlatilmaydi."),
    Q("b1-passive", "English _____ all over the world.", ["speaks", "is spoken", "is speaking", "spoke"], 1, "Passiv: is + V3."),
    Q("b1-passive", "The window _____ yesterday.", ["broke", "was broken", "is broken", "has broke"], 1, "O'tgan zamon passivi: was + V3."),
    Q("b1-passive", "The new bridge _____ next year.", ["will build", "will be built", "is built", "builds"], 1, "Kelasi zamon passivi: will be + V3."),
    Q("b1-gerund-infinitive", "I enjoy _____ to music in the evening.", ["listen", "to listen", "listening", "listened"], 2, "enjoy dan keyin -ing."),
    Q("b1-gerund-infinitive", "She decided _____ a new job.", ["finding", "to find", "find", "found"], 1, "decide dan keyin to + fe'l."),
    Q("b1-gerund-infinitive", "He avoided _____ the question.", ["to answer", "answering", "answer", "answered"], 1, "avoid dan keyin -ing."),
  ],
  B2: [
    Q("b2-past-perfect", "By the time we arrived at the station, the train had already _____.", ["went", "go", "gone", "going"], 2, "had already + V3: go – went – gone."),
    Q("b2-past-perfect", "When I got home, my sister _____ dinner.", ["already cooked", "had already cooked", "has already cooked", "was already cook"], 1, "Ovqat tayyorlash uyga kelishdan oldin bo'lgan → Past Perfect."),
    Q("b2-past-perfect", "He was nervous because he _____ never flown before.", ["has", "had", "was", "did"], 1, "Oldingi tajriba o'tmishda → had + V3."),
    Q("b2-conditionals-23", "If I _____ you, I would accept the offer.", ["am", "would be", "were", "will be"], 2, "Xayoliy holat: If I were you."),
    Q("b2-conditionals-23", "If she had studied harder, she _____ the exam.", ["would pass", "would have passed", "will pass", "had passed"], 1, "Third conditional: would have + V3."),
    Q("b2-conditionals-23", "What _____ if you won the lottery?", ["will you do", "would you do", "did you do", "do you do"], 1, "Second conditional savoli: would + ega + fe'l."),
    Q("b2-reported-speech", "She said that she _____ tired.", ["is", "was", "will be", "has been"], 1, "Reported speech: am/is → was."),
    Q("b2-reported-speech", "He asked me where I _____.", ["live", "lived", "do live", "am living"], 1, "Savol ko'chirmasi: darak tartib + backshift."),
    Q("b2-reported-speech", "\"I will call you tomorrow,\" he said. → He said he _____ me the next day.", ["will call", "would call", "calls", "called"], 1, "will → would."),
    Q("b2-relative-clauses", "The woman _____ lives next door is a doctor.", ["which", "who", "whose", "whom"], 1, "Odam + ega vazifasi → who."),
    Q("b2-relative-clauses", "This is the book _____ cover is red.", ["who", "which", "whose", "that"], 2, "Egalik: kitobning muqovasi → whose."),
    Q("b2-relative-clauses", "That is the house _____ I was born.", ["where", "which", "who", "whose"], 0, "Joy → where."),
  ],
  C1: [
    Q("c1-inversion", "Never _____ such a beautiful sunset.", ["I have seen", "have I seen", "I saw", "did I seen"], 1, "Never gap boshida → have I seen."),
    Q("c1-inversion", "Hardly _____ the house when it started to rain.", ["had we left", "we had left", "did we leave", "we left"], 0, "Hardly + had + ega + V3."),
    Q("c1-inversion", "Not only _____ late, but he also forgot the documents.", ["he arrived", "did he arrive", "arrived he", "he did arrive"], 1, "Not only gap boshida → did he arrive."),
    Q("c1-mixed-conditionals", "If I had taken that job, I _____ in London now.", ["would be living", "would have lived", "had been living", "will be living"], 0, "now — hozirgi natija: would + fe'l."),
    Q("c1-mixed-conditionals", "If she weren't so shy, she _____ the presentation last week.", ["would give", "would have given", "gave", "will give"], 1, "last week — o'tgan natija: would have + V3."),
    Q("c1-mixed-conditionals", "If he _____ more careful, he wouldn't have the scar on his hand now.", ["was", "had been", "would be", "were"], 1, "O'tmishdagi sabab: had been."),
    Q("c1-causative", "I _____ my car repaired yesterday.", ["had", "did", "made", "took"], 0, "have + narsa + V3."),
    Q("c1-causative", "She is going to have her hair _____ tomorrow.", ["cut", "cutting", "to cut", "cuts"], 0, "have + narsa + V3."),
    Q("c1-causative", "We _____ the kitchen painted last month.", ["made", "had", "did", "were"], 1, "O'tgan zamonda causative: had + narsa + V3."),
    Q("c1-modals-past", "The lights are off. They _____ gone to bed already.", ["must have", "must", "ought", "could to"], 0, "Deyarli aniq taxmin: must have + V3."),
    Q("c1-modals-past", "You _____ told me earlier! Now it's too late.", ["should have", "should", "must have", "would"], 0, "Pushaymonlik: should have + V3."),
    Q("c1-modals-past", "He _____ been at home — I saw his car outside the office all day.", ["can't have", "mustn't", "shouldn't", "needn't"], 0, "Bo'lishi mumkin emas: can't have + V3."),
  ],
  C2: [
    Q("c2-collocations", "The new policy has sparked a _____ debate among economists.", ["heated", "hot", "burning", "strong"], 0, "heated debate — turg'un birikma."),
    Q("c2-collocations", "The report highlights the _____ need for reform.", ["pressing", "pushing", "hurrying", "heavy"], 0, "pressing need — shoshilinch ehtiyoj."),
    Q("c2-collocations", "We got caught in the storm and were soaked to the _____.", ["skin", "bone", "body", "clothes"], 0, "soaked to the skin — turg'un ibora."),
    Q("c2-subjunctive", "The committee insisted that he _____ the meeting.", ["attends", "attend", "attended", "will attend"], 1, "insist that + oddiy fe'l (subjunctive)."),
    Q("c2-subjunctive", "It is essential that every student _____ on time.", ["is", "be", "are", "was"], 1, "essential that + oddiy fe'l."),
    Q("c2-subjunctive", "I would rather you _____ smoke in here.", ["don't", "didn't", "won't", "not"], 1, "would rather + ega + Past Simple."),
    Q("c2-discourse", "_____ the heavy rain, the match went ahead as planned.", ["Despite", "Although", "However", "Whereas"], 0, "Despite + ot; Although + gap."),
    Q("c2-discourse", "The results were disappointing; _____, the team remains optimistic.", ["nevertheless", "moreover", "therefore", "besides"], 0, "Qarama-qarshilik: nevertheless."),
    Q("c2-discourse", "He worked extremely hard; _____, he was promoted last year.", ["consequently", "nonetheless", "otherwise", "whereas"], 0, "Natija: consequently."),
    Q("c2-word-formation", "The proposal was met with widespread _____.", ["scepticism", "doubting", "doubtful", "sceptic"], 0, "widespread dan keyin ot kerak."),
    Q("c2-word-formation", "His _____ to the project was invaluable.", ["contribute", "contribution", "contributing", "contributor"], 1, "his dan keyin ot: contribution."),
    Q("c2-word-formation", "The _____ of the new law surprised everyone.", ["introduce", "introduction", "introductory", "introduced"], 1, "the dan keyin ot: introduction."),
  ],
};
