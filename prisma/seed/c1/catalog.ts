/**
 * C1 mavzulari rejadagi tartibda. Katalogdagi 6 ta C1 mavzusidan 5 tasi B2 da o'tilgan (inversion, mixed conditionals,
 * causative, past modals, cleft) — ular C1 mazmuniga mos nom oladi (C1_RENAMES). Yo'qlari yaratiladi.
 */
export const C1_TOPIC_ORDER = [
  "Inversiya: ilg'or shakllar",
  "Shartli gaplar: nozik shakllar",
  "Ettirish fe'llari va causative",
  "Modal fe'llar: nozik ma'nolar",
  "Urg'u va axborot tuzilishi",
  "Participle clauses",
  "Akademik til: nominalizatsiya va hedging",
  "Murakkab tuzilmalar: subjunctive va ellipsis",
  "C1 so'z boyligi",
  "Akademik yozuv",
  "Kasbiy muloqot",
  "Nutq, uslub va tanqidiy fikr",
];

export const C1_RENAMES: Record<string, string> = {
  "Inversion (so'z tartibi o'zgarishi)": "Inversiya: ilg'or shakllar",
  "Mixed conditionals": "Shartli gaplar: nozik shakllar",
  "Causative: have / get something done": "Ettirish fe'llari va causative",
  "O'tmish modallari: must have, can't have, should have": "Modal fe'llar: nozik ma'nolar",
  "Cleft sentences": "Urg'u va axborot tuzilishi",
};

export const [INVERSION, CONDITIONALS, CAUSATIVE, MODALS, EMPHASIS, PARTICIPLE, ACADEMIC, STRUCTURES, VOCAB, WRITING, WORK, SPEECH] = C1_TOPIC_ORDER;
