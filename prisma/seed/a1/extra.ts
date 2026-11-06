/**
 * A1 ga keyin qo'shilgan darslar (o'quvchi ko'zi bilan tekshiruvdan keyin, 2026-11-06):
 * avval o'rgatilmasdan ishlatilgan mavzular. topics.ts dagi TOPICS massiviga kerakli joyga qo'yiladi.
 * Dars raqami (N-dars.) renumber skripti bilan tartibga keltiriladi.
 */
import type { LessonSpec } from "./builder";

const BE = "\"To be\" fe'li (am / is / are)";
const PS = "Present Simple";
const ART = "Artikllar: a / an / the";

export const POSSESSIVES: LessonSpec = {
  topic: BE,
  title: "23-dars. my, your, his, her: kimniki?",
  intro: "«Mening kitobim», «Uning ismi». O'zbekchada **-im, -ing, -i** qo'shimchasi bor, inglizchada esa ot oldidan alohida so'z qo'yiladi: **my** book, **his** name.",
  goals: ["my, your, his, her, its, our, their", "his va her farqi", "My name is… · What's his name?"],
  cover: ["Har bir odamning qo'lida o'z narsasi: my bag, his phone, her book yozuvlari bilan", "people holding their own things possessive adjectives illustration"],
  rule: {
    head: "Kimniki?",
    text: "- I → **my** (mening) · you → **your** (sening, sizning)\n- he → **his** (uning — erkak) · she → **her** (uning — ayol)\n- it → **its** (uning — narsa, hayvon)\n- we → **our** (bizning) · they → **their** (ularning)\n- Har doim **ot oldidan**: **my** book, **her** car",
    example: "**My** name is Ali. **His** name is Bobur. **Her** name is Lola.",
  },
  side: { tip: ["his yoki her?", "O'zbekchada ikkalasi ham «uning».\n- erkak, bola → **his**\n- ayol, qiz → **her**\nAli and **his** sister · Lola and **her** brother"] },
  examples: [
    { en: "My name is Aziz.", uz: "Mening ismim Aziz." },
    { en: "What's your name?", uz: "Ismingiz nima?" },
    { en: "This is his car.", uz: "Bu uning (erkak) mashinasi." },
    { en: "Her bag is red.", uz: "Uning (ayol) sumkasi qizil." },
    { en: "Our teacher is kind.", uz: "Bizning o'qituvchimiz mehribon." },
    { en: "Their house is big.", uz: "Ularning uyi katta." },
  ],
  warning: ["his ≠ he's, its ≠ it's", "- **his** — uning · **he's** = he is\n- **its** — uning (narsa) · **it's** = it is\n❌ He name is Ali. ✅ **His** name is Ali.\n❌ She is my sister. Her is a teacher. ✅ **She** is a teacher."],
  tip: ["Talaffuz", "your [yor], their [ðer], our [**au**ər], his [hiz] — s «z» bo'lib eshitiladi."],
  listen: [
    { say: "Her name is Malika.", q: "Kim haqida?", options: ["ayol", "erkak"], correct: 0, why: "her — ayol." },
    { say: "His phone is new.", q: "Kimning telefoni?", options: ["erkakning", "ayolning"], correct: 0, why: "his — erkak." },
    { say: "Our school is big.", q: "Kimning maktabi?", options: ["bizning", "ularning"], correct: 0, why: "our — bizning." },
  ],
  write: [
    { t: "[[a]] name is Ali. (mening)", a: ["My"], why: "**My** name" },
    { t: "This is Lola and [[b]] mother. (ayol)", a: ["her"], why: "Lola — ayol → **her**" },
    { t: "Sardor and [[c]] brother are students. (erkak)", a: ["his"], why: "Sardor — erkak → **his**" },
    { t: "What's [[d]] name? (sizning)", a: ["your"], why: "**your** name" },
  ],
  hint: "I → my · you → your · he → his · she → her · we → our · they → their",
  words: [
    ["my", "[may]", "mening"],
    ["your", "[yor]", "sening, sizning"],
    ["his", "[hiz]", "uning (erkak)"],
    ["her", "[hər]", "uning (ayol)"],
    ["its", "[its]", "uning (narsa)"],
    ["our", "[**au**ər]", "bizning"],
    ["their", "[ðer]", "ularning"],
    ["name", "[neym]", "ism"],
    ["bag", "[bäg]", "sumka"],
  ],
  mix: [
    { q: "Lola and ___ dog.", options: ["her", "his", "she"], correct: 0, why: "Lola — her." },
    { q: "«Bizning uyimiz»", options: ["our house", "us house", "we house"], correct: 0, why: "our." },
    { q: "To'g'ri gap:", options: ["His name is Bek.", "He name is Bek."], correct: 0, why: "his — uning." },
  ],
  mixWrite: { t: "They are my friends. [[a]] house is near. (ularning)", a: ["Their"], why: "**Their** house" },
  summary: ["==my, your, his, her, its, our, their== — ot oldidan", "his — erkak · her — ayol", "his ≠ he's · its ≠ it's"],
  next: "Oila va kasblar",
};

export const WH_QUESTIONS: LessonSpec = {
  topic: PS,
  title: "29-dars. What, Where, When…? Savol so'zlari",
  intro: "«Qayerda yashaysan?», «Nima ish qilasan?» — bunday savollar uchun **savol so'zi** kerak. Bugun **what, where, when, who, why, how** bilan Present Simple savollarini tuzamiz.",
  goals: ["Savol so'zlari", "Savol so'zi + do / does + ega + fe'l", "Where do you live? What does she do?"],
  cover: ["Katta savol belgisi atrofida what, where, when, who, why, how so'zlari va kichik rasmlar", "question words what where when who why how illustration"],
  rule: {
    head: "Savol so'zlari",
    text: "- **What** — nima? · **Where** — qayerda? · **When** — qachon?\n- **Who** — kim? · **Why** — nega? · **How** — qanday?\n- Tartib: **savol so'zi + do / does + ega + fe'l?**\n- **Where do you** live? · **What does she** do?\n- Javob: I live **in Tashkent**. She **is a nurse**.",
    example: "**Where do** you **work**? — I work in a bank. **When does** the shop **open**? — At 9.",
  },
  side: { tip: ["Tez eslash", "- What? — Nima?\n- Where? — Qayerda?\n- When? — Qachon?\n- Who? — Kim?\n- Why? — Nega?\n- How? — Qanday?"] },
  examples: [
    { en: "Where do you live?", uz: "Qayerda yashaysiz?" },
    { en: "What do you do?", uz: "Nima ish qilasiz? (kasbingiz nima?)" },
    { en: "When does the lesson start?", uz: "Dars qachon boshlanadi?" },
    { en: "Why do you study English?", uz: "Nega ingliz tilini o'rganasiz?" },
    { en: "How do you go to school?", uz: "Maktabga qanday borasiz?" },
    { en: "What time does he get up?", uz: "U soat nechada turadi?" },
  ],
  warning: ["do / does ni unutmang", "❌ Where you live?\n✅ Where **do** you live?\n❌ What she does?\n✅ What **does** she **do**? (does bo'lsa — fe'lda -s yo'q)"],
  tip: ["What do you do?", "Bu savol «Hozir nima qilyapsan?» emas — **kasbingiz nima?** degani. Javob: I'm a teacher."],
  listen: [
    { say: "Where do you live?", q: "Nima so'ralyapti?", options: ["joy", "vaqt", "sabab"], correct: 0, why: "Where — qayerda." },
    { say: "When does the bus come?", q: "Nima so'ralyapti?", options: ["vaqt", "joy", "kim"], correct: 0, why: "When — qachon." },
    { say: "Why do you like English?", q: "Nima so'ralyapti?", options: ["sabab", "joy", "vaqt"], correct: 0, why: "Why — nega." },
  ],
  write: [
    { t: "[[a]] do you live? — In Samarkand.", a: ["Where"], why: "joy — **Where**" },
    { t: "What [[b]] she do? — She's a doctor.", a: ["does"], why: "she — **does**" },
    { t: "[[c]] does the film start? — At 7.", a: ["When", "What time"], why: "vaqt — **When**" },
    { t: "Where do you [[d]]? — I work in a shop.", a: ["work"], why: "do you **work**" },
  ],
  hint: "Savol so'zi + do / does + ega + fe'l",
  words: [
    ["what", "[wat]", "nima"],
    ["where", "[wer]", "qayerda"],
    ["when", "[wen]", "qachon"],
    ["who", "[hu:]", "kim"],
    ["why", "[way]", "nega"],
    ["how", "[hau]", "qanday"],
    ["what time", "[wat **taym**]", "soat nechada"],
    ["start", "[start]", "boshlanmoq"],
    ["because", "[bi**ko:z**]", "chunki"],
  ],
  dialog: {
    lines: [
      ["Jasur", "Where do you live, Lola?"],
      ["Lola", "I live in Chilanzar. And you?"],
      ["Jasur", "In Yunusabad. How do you go to school?"],
      ["Lola", "By metro. It's fast!"],
    ],
    img: ["Ikki o'quvchi maktab yo'lagida suhbatlashmoqda, orqada metro xaritasi", "two students talking school corridor metro map illustration"],
    tip: "Sherigingizga 3 ta savol bering: Where do you live? What do you do? Why do you study English?",
  },
  mix: [
    { q: "«Qayerda ishlaysiz?»", options: ["Where do you work?", "Where you work?"], correct: 0, why: "do kerak." },
    { q: "___ is your teacher? — Mr. Karimov.", options: ["Who", "Where", "When"], correct: 0, why: "Kim — Who." },
    { q: "What ___ he do?", options: ["does", "do", "is"], correct: 0, why: "he — does." },
  ],
  mixWrite: { t: "[[a]] do you study English? — Because I like it.", a: ["Why"], why: "sabab — **Why**" },
  summary: ["==What, Where, When, Who, Why, How==", "Savol so'zi + ==do / does== + ega + fe'l", "What do you do? — kasbingiz nima?"],
  next: "always, usually, never: qanchalik tez-tez?",
};

export const FREQUENCY: LessonSpec = {
  topic: PS,
  title: "30-dars. always, usually, never: qanchalik tez-tez?",
  intro: "«Men **doim** nonushta qilaman», «U **hech qachon** kechikmaydi». Ishni qanchalik tez-tez qilishimizni aytish uchun **always, usually, sometimes, never** kerak.",
  goals: ["always, usually, often, sometimes, never", "So'z tartibi: I always…, He is never…", "How often…? savoli"],
  cover: ["Haftalik kalendar: har kuni belgi (always), ba'zi kunlar (sometimes), hech qachon (never)", "weekly calendar checkmarks frequency adverbs illustration"],
  rule: {
    head: "Qanchalik tez-tez?",
    text: "- **always** — doim (100%) · **usually** — odatda · **often** — tez-tez\n- **sometimes** — ba'zan · **never** — hech qachon (0%)\n- Oddiy fe'ldan **oldin**: I **always** get up at 7.\n- **am / is / are** dan **keyin**: She **is never** late.\n- Savol: **How often** do you…?",
    example: "I **usually** walk to school, but I **sometimes** take a bus. I'm **never** late!",
  },
  side: { img: ["0% dan 100% gacha shkala: never — sometimes — often — usually — always", "frequency adverbs scale percentage chart"] },
  examples: [
    { en: "I always drink tea in the morning.", uz: "Ertalab doim choy ichaman." },
    { en: "She usually gets up at six.", uz: "U odatda soat oltida turadi." },
    { en: "We often play football.", uz: "Biz tez-tez futbol o'ynaymiz." },
    { en: "He sometimes cooks dinner.", uz: "U ba'zan kechki ovqat pishiradi." },
    { en: "I never eat fast food.", uz: "Men hech qachon fast-fud yemayman." },
    { en: "My brother is always busy.", uz: "Akam doim band." },
  ],
  warning: ["never — o'zi inkor", "❌ I don't never eat meat.\n✅ I **never** eat meat.\n❌ She always is happy.\n✅ She **is always** happy. (is dan keyin)"],
  tip: ["Javob berish", "How often do you read? — **Every day.** · **Twice a week.** · **Once a month.** · **Never.**"],
  listen: [
    { say: "I always get up early.", q: "Qanchalik tez-tez?", options: ["doim", "ba'zan", "hech qachon"], correct: 0, why: "always — doim." },
    { say: "She never drinks coffee.", q: "U qahva ichadimi?", options: ["hech qachon", "doim"], correct: 0, why: "never — hech qachon." },
    { say: "We sometimes go to the cinema.", q: "Qanchalik tez-tez?", options: ["ba'zan", "har kuni"], correct: 0, why: "sometimes — ba'zan." },
  ],
  write: [
    { t: "I [[a]] brush my teeth. (doim)", a: ["always"], why: "**always**" },
    { t: "He is [[b]] late. (hech qachon)", a: ["never"], why: "is **never**" },
    { t: "We [[c]] watch films on Friday. (odatda)", a: ["usually"], why: "**usually**" },
    { t: "How [[d]] do you go swimming?", a: ["often"], why: "How **often**" },
  ],
  hint: "Fe'ldan oldin: I always go · is/are dan keyin: She is always happy",
  words: [
    ["always", "[**o:l**weyz]", "doim"],
    ["usually", "[**yu:**zhuəli]", "odatda"],
    ["often", "[**o:**fən]", "tez-tez"],
    ["sometimes", "[**səm**taymz]", "ba'zan"],
    ["never", "[**ne**vər]", "hech qachon"],
    ["every day", "[evri **dey**]", "har kuni"],
    ["once", "[wəns]", "bir marta"],
    ["twice", "[tways]", "ikki marta"],
    ["late", "[leyt]", "kech, kechikkan"],
  ],
  mix: [
    { q: "To'g'ri gap:", options: ["I never eat meat.", "I don't never eat meat."], correct: 0, why: "never — o'zi inkor." },
    { q: "To'g'ri tartib:", options: ["She is always happy.", "She always is happy."], correct: 0, why: "is dan keyin." },
    { q: "0% —", options: ["never", "sometimes", "usually"], correct: 0, why: "never." },
  ],
  mixWrite: { t: "She [[a]] goes to the gym. (ba'zan)", a: ["sometimes"], why: "**sometimes**" },
  summary: ["==always > usually > often > sometimes > never==", "Fe'ldan oldin, am/is/are dan keyin", "How often…? — Every day / Once a week"],
  next: "Hafta kunlari va vaqt",
};

export const PLURALS: LessonSpec = {
  topic: ART,
  title: "33-dars. Bitta va ko'p: book → books",
  intro: "**a** book — bitta kitob. Ko'p bo'lsa-chi? O'zbekchada **-lar** qo'shamiz, inglizchada esa **-s**. Lekin sondan keyin ham **-s** kerak: **two books** (ikkita kitob**lar** emas!).",
  goals: ["Ko'plik: -s, -es", "Sondan keyin ham -s: three cats", "Eng kerakli istisnolar: man → men, child → children"],
  cover: ["Chapda bitta olma, o'ngda ko'p olmalar: an apple → apples", "one apple vs many apples illustration"],
  rule: {
    head: "Ko'plik",
    text: "- Oddiy: **+s** — book → book**s**, car → car**s**\n- s, x, sh, ch bilan tugasa: **+es** — bus → bus**es**, box → box**es**\n- Undosh + y: **y → ies** — city → cit**ies**\n- Sondan keyin ham ko'plik: **two books**, **five cats**\n- Istisnolar: man → **men**, woman → **women**, child → **children**",
    example: "I have **a** brother and **two sisters**. There are **three children** in my family.",
  },
  side: { tip: ["a va ko'plik", "**a / an** — faqat bitta uchun:\n✅ a book · ✅ books\n❌ a books"] },
  examples: [
    { en: "one cat, two cats", uz: "bitta mushuk, ikkita mushuk" },
    { en: "a bus, three buses", uz: "bitta avtobus, uchta avtobus" },
    { en: "a city, many cities", uz: "bitta shahar, ko'p shaharlar" },
    { en: "one man, two men", uz: "bitta erkak, ikkita erkak" },
    { en: "a child, four children", uz: "bitta bola, to'rtta bola" },
    { en: "I have two brothers.", uz: "Mening ikkita akam bor." },
  ],
  warning: ["O'zbekchadan farqi", "O'zbekchada: ikkita kitob (-lar yo'q)\nInglizchada: two book**s** (-s kerak!)\n❌ three apple ✅ three apple**s**\n❌ a cars ✅ a car / cars"],
  tip: ["Talaffuz", "-s ikki xil: cats [käts] — «s», dogs [do:gz] — «z».\n-es — alohida bo'g'in: buses [**bə**siz]."],
  listen: [
    { say: "There are three boxes.", q: "Nechta quti?", options: ["3", "1", "2"], correct: 0, why: "three boxes." },
    { say: "I have two children.", q: "Nechta bola?", options: ["2", "1", "3"], correct: 0, why: "two children." },
    { say: "I see a bus.", q: "Nechta avtobus?", options: ["1", "ko'p"], correct: 0, why: "a bus — bitta." },
  ],
  write: [
    { t: "one book, two [[a]]", a: ["books"], why: "+s — **books**" },
    { t: "one box, three [[b]]", a: ["boxes"], why: "x → **boxes**" },
    { t: "one child, five [[c]]", a: ["children"], why: "istisno — **children**" },
    { t: "one city, many [[d]]", a: ["cities"], why: "y → **cities**" },
  ],
  hint: "+s · s/x/sh/ch → +es · y → ies · man → men, child → children",
  words: [
    ["man – men", "[män – men]", "erkak – erkaklar"],
    ["woman – women", "[**wu**mən – **wi**min]", "ayol – ayollar"],
    ["child – children", "[chayld – **chil**drən]", "bola – bolalar"],
    ["box – boxes", "[baks – **bak**siz]", "quti – qutilar"],
    ["bus – buses", "[bəs – **bə**siz]", "avtobus – avtobuslar"],
    ["city – cities", "[**si**ti – **si**tiz]", "shahar – shaharlar"],
    ["apple", "[**ä**pəl]", "olma"],
    ["many", "[**me**ni]", "ko'p"],
    ["one", "[wən]", "bir"],
  ],
  mix: [
    { q: "«ikkita olma»", options: ["two apples", "two apple", "two an apple"], correct: 0, why: "sondan keyin ham -s." },
    { q: "woman → ko'plik:", options: ["women", "womans", "womens"], correct: 0, why: "women." },
    { q: "To'g'ri:", options: ["a car", "a cars"], correct: 0, why: "a — faqat bitta." },
  ],
  mixWrite: { t: "There are two [[a]] in the class. (man)", a: ["men"], why: "man → **men**" },
  summary: ["Ko'plik: ==+s / +es / y → ies==", "Sondan keyin ham -s: two books", "man → men · child → children"],
  next: "the — aniq narsa",
};
