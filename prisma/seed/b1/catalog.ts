/**
 * B1 mavzulari rejadagi tartibda. Katalogdagi 3 ta mavzu A2 bilan takrorlanadi — ular B1 mazmuniga mos nom oladi
 * (B1_RENAMES: eski nom → yangi nom; faqat yangi nomli mavzu hali yo'q bo'lsa qayta nomlanadi). Yo'qlari yaratiladi.
 */
export const B1_TOPIC_ORDER = [
  "Present Perfect Continuous",
  "O'tmishni hikoya qilish",
  "Kelajak shakllari",
  "Zero va First conditional",
  "Second conditional va wish",
  "Modal fe'llar: ehtimol va maslahat",
  "Passive Voice",
  "Gerund va Infinitive",
  "Nisbiy gaplar",
  "Savol shakllari va muloqot",
  "Frazali fe'llar va iboralar",
  "Fikr bildirish va yozish",
];

export const B1_RENAMES: Record<string, string> = {
  "Present Perfect": "Present Perfect Continuous",
  "Past Continuous": "O'tmishni hikoya qilish",
  "Modal fe'llar: must / have to / should": "Modal fe'llar: ehtimol va maslahat",
};

export const [PPC, NARR, FUT, COND1, COND2, MODALS, PASSIVE, GERUND, RELATIVE, QUESTIONS, PHRASAL, OPINION] = B1_TOPIC_ORDER;
