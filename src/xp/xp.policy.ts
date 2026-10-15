/**
 * XP siyosati (versiyalangan). Qiymatlar FAQAT shu yerda. Ledger yozuvlari o'z `policyVersion`, bazaviy XP va
 * koeffitsiyent snapshot'ini saqlaydi, shuning uchun siyosat o'zgarsa eski yozuvlar buzilmaydi: yangi versiya qo'shiladi,
 * `ACTIVE_XP_POLICY` o'zgartiriladi, eskisi o'chirilmaydi.
 */
export type XpEventType = 'LESSON_COMPLETE' | 'TOPIC_COMPLETE' | 'QUIZ_TIER' | 'NOTE_VERIFIED';

export interface XpPolicy {
  version: string;
  /** Kunlik tartib shu vaqt zonasi bo'yicha */
  timeZone: string;
  /** Faol/nofaol mukofot turlari */
  events: Record<XpEventType, { enabled: boolean; baseXp: number }>;
  /** Test bo'sag'alari: har biri alohida (kumulyativ) bonus. Mavzu bo'yicha maksimal bazaviy = yig'indi. */
  quizTiers: ReadonlyArray<{ minPct: number; xp: number }>;
  /** Mavzuning kundagi tartibi -> koeffitsiyent (bazis punkt, 10000 = 100%). Oxirgi qiymat keyingilariga ham amal qiladi. */
  topicDayMultiplierBp: readonly number[];
  /** Daraja: minimal jami XP. Indeks+1 = daraja raqami. */
  levels: ReadonlyArray<{ title: string; minTotalXp: number }>;
}

export const XP_POLICY_V1: XpPolicy = {
  version: 'xp-v1',
  timeZone: 'Asia/Tashkent',
  events: {
    LESSON_COMPLETE: { enabled: true, baseXp: 10 },
    TOPIC_COMPLETE: { enabled: true, baseXp: 25 },
    // Test XP har bo'sag'a uchun alohida (quizTiers); baseXp bu yerda ishlatilmaydi
    QUIZ_TIER: { enabled: true, baseXp: 0 },
    // Konspekt mazmunini ishonchli tekshiradigan mexanizm yo'q: o'chirilgan
    NOTE_VERIFIED: { enabled: false, baseXp: 5 },
  },
  quizTiers: [
    { minPct: 60, xp: 10 },
    { minPct: 80, xp: 10 },
    { minPct: 90, xp: 10 },
  ],
  topicDayMultiplierBp: [10_000, 5_000, 1_000],
  levels: [
    { title: 'Yangi izlanuvchi', minTotalXp: 0 },
    { title: 'Qiziquvchan', minTotalXp: 200 },
    { title: 'Intiluvchi', minTotalXp: 500 },
    { title: 'Bilimdon', minTotalXp: 1000 },
    { title: 'Izlanuvchi', minTotalXp: 1800 },
    { title: 'Tadqiqotchi', minTotalXp: 3000 },
    { title: 'Kashfiyotchi', minTotalXp: 4800 },
    { title: 'Zukko', minTotalXp: 7000 },
    { title: 'Ilm ustasi', minTotalXp: 10000 },
    { title: 'Bilim afsonasi', minTotalXp: 15000 },
  ],
};

export const ACTIVE_XP_POLICY: XpPolicy = XP_POLICY_V1;
