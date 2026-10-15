/**
 * Achievement qoidalari (versiyalangan, serverda boshqariladi). Admin qoidani kod/ifoda sifatida kirita olmaydi:
 * faqat shu yerdagi tasdiqlangan ko'rsatkichlar va maqsad qiymatlari. Ta'rif (nom/izoh/faollik) DB da, qoida bu yerda.
 */
export const ACHIEVEMENT_RULES_VERSION = 'ach-v1';

export type MetricKey = 'completedLessons' | 'completedTopics' | 'quiz90Topics' | 'activeDays';

export interface AchievementRule {
  slug: string;
  metric: MetricKey;
  target: number;
  /** Admin va foydalanuvchiga ko'rsatiladigan qoida matni */
  requirement: string;
}

export const ACHIEVEMENT_RULES_V1: readonly AchievementRule[] = [
  { slug: 'birinchi-qadam', metric: 'completedLessons', target: 1, requirement: 'Kamida 1 ta darsni yakunlash' },
  { slug: 'bilim-yolida', metric: 'completedTopics', target: 10, requirement: '10 ta turli mavzuni yakunlash' },
  { slug: 'sinov-ustasi', metric: 'quiz90Topics', target: 10, requirement: '10 ta turli mavzu testidan kamida 90% olish' },
  { slug: 'intizomli', metric: 'activeDays', target: 7, requirement: '7 xil kunda (Asia/Tashkent) tasdiqlangan dars yoki test faoliyati' },
  { slug: 'ilm-fidoyisi', metric: 'completedTopics', target: 100, requirement: '100 ta turli mavzuni yakunlash' },
];

export type Metrics = Record<MetricKey, number>;

export interface Progress {
  slug: string;
  value: number;
  target: number;
  pct: number;
  earned: boolean;
}

/** Sof hisob: ko'rsatkichlardan har bir qoida bo'yicha natija. */
export function evaluateRules(metrics: Metrics, rules: readonly AchievementRule[] = ACHIEVEMENT_RULES_V1): Progress[] {
  return rules.map((r) => {
    const value = Math.max(0, Math.floor(metrics[r.metric] ?? 0));
    return { slug: r.slug, value: Math.min(value, r.target), target: r.target, pct: Math.min(100, Math.floor((value * 100) / r.target)), earned: value >= r.target };
  });
}

export const SHOWCASE_MAX = 3;
