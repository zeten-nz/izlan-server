// Til/yozuv yordamchilari (client/src/lib/grammar/text.ts bilan bir xil qoidalar; golden-paritet testi bor).

const COMBINING_STRESS = /[̀́]/g;

/** Faqat urg'u belgilarini olib tashlaydi (ё va й saqlanadi). Natija NFC. */
export function stripStress(s: string): string {
  return s.normalize('NFD').replace(COMBINING_STRESS, '').normalize('NFC');
}

const SCRIPT_RE = {
  Latn: /[A-Za-zÀ-ɏ]/,
  Cyrl: /[Ѐ-ԯ]/,
  Jpan: /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/,
} as const;
export type KnownScript = keyof typeof SCRIPT_RE;

export function hasAnyScript(s: string, scripts: readonly string[]): boolean {
  return scripts.some((sc) => (SCRIPT_RE as Record<string, RegExp>)[sc]?.test(s));
}
