/**
 * B2 mavzulari rejadagi tartibda. Katalogdagi 6 ta B2 mavzusidan 5 tasi B1 da o'tilgan (Past Perfect, Second conditional,
 * Relative clauses, wish, Future Continuous) — ular B2 mazmuniga mos nom oladi (B2_RENAMES). Yo'qlari yaratiladi.
 */
export const B2_TOPIC_ORDER = [
  "Past Perfect Continuous va o'tmish zamonlari",
  "Third va mixed conditional",
  "Reported speech",
  "Nisbiy gaplar: murakkab shakllar",
  "Afsus va orzu: wish, if only, I'd rather",
  "Kelajak: Future Perfect",
  "Modal fe'llar o'tmishda",
  "Passive: murakkab shakllar",
  "Urg'u va inversiya",
  "Bog'lovchilar va matn tuzish",
  "So'z yasash va iboralar",
  "Rasmiy yozuv va nutq",
];

export const B2_RENAMES: Record<string, string> = {
  "Past Perfect": "Past Perfect Continuous va o'tmish zamonlari",
  "Second va Third conditional": "Third va mixed conditional",
  "Relative clauses": "Nisbiy gaplar: murakkab shakllar",
  "Wish / If only": "Afsus va orzu: wish, if only, I'd rather",
  "Future Perfect va Future Continuous": "Kelajak: Future Perfect",
};

export const [PAST, COND3, REPORTED, RELATIVE, WISH, FUTURE, PASTMODALS, PASSIVE, EMPHASIS, LINKING, WORDS, FORMAL] = B2_TOPIC_ORDER;
