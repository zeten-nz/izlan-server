/**
 * C2 mavzulari rejadagi tartibda. Katalogdagi 6 ta C2 mavzusidan 5 tasi oldingi darajalarda o'tilgan (collocations,
 * subjunctive, discourse markers, word formation, ellipsis) — ular C2 mazmuniga mos nom oladi (C2_RENAMES).
 */
export const C2_TOPIC_ORDER = [
  "Idiomatik ifoda va frazeologiya",
  "Rasmiy va arxaik uslub",
  "Matn bog'liqligi va diskurs",
  "So'z yasash: ilg'or",
  "Ellipsis va siqiq nutq",
  "Ma'no nozikliklari",
  "Grammatik nozikliklar",
  "Ilmiy yozuv",
  "Badiiy til va stilistika",
  "Mediatsiya va tarjima",
  "Pragmatika va nutq madaniyati",
  "C2 mahorat",
];

export const C2_RENAMES: Record<string, string> = {
  "Collocations va idiomalar": "Idiomatik ifoda va frazeologiya",
  "Subjunctive va rasmiy uslub": "Rasmiy va arxaik uslub",
  "Bog'lovchi so'zlar (discourse markers)": "Matn bog'liqligi va diskurs",
  "So'z yasalishi (word formation)": "So'z yasash: ilg'or",
  "Ellipsis va almashtirish": "Ellipsis va siqiq nutq",
};

export const [IDIOMS, FORMAL, DISCOURSE, WORDFORM, ELLIPSIS, MEANING, GRAMMAR, SCIENCE, STYLE, MEDIATION, PRAGMATICS, MASTERY] = C2_TOPIC_ORDER;
