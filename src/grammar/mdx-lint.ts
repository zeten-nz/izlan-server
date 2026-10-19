// MDX tanasi uchun xavfsizlik lint'i (client/src/lib/grammar/mdx-lint.ts portu; golden-paritet testi bor).
// Cheklangan markdown + <Callout tone="info|warning|tip">: JS ifodalar, import/export, xom HTML, rasm, xavfli havolalar rad etiladi.

export const ALLOWED_TAGS: ReadonlySet<string> = new Set(['Callout']);
const CALLOUT_ATTRS = /^(?:\s+tone="(?:info|warning|tip)")?\s*$/;
export const MAX_BODY_CHARS = 20_000;

export function lintMdxBody(body: string, startLine = 1): string[] {
  const issues: string[] = [];
  if (body.length > MAX_BODY_CHARS) issues.push(`tana ${MAX_BODY_CHARS} belgidan oshmasligi kerak`);

  let fence: string | null = null;
  body.split(/\r?\n/).forEach((raw, i) => {
    const line = startLine + i;
    const at = (msg: string) => issues.push(`${line}-qator: ${msg}`);

    const f = /^\s*(```+|~~~+)/.exec(raw);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;

    const s = raw.replace(/`[^`]*`/g, '').replace(/<[a-z][a-z0-9+.-]*:[^\s>]*>/gi, '');

    if (/^\s*(import|export)\s/.test(s)) at('import/export taqiqlangan');
    if (/(?<!\\)[{}]/.test(s)) at("JS ifodalar ({ }) taqiqlangan; belgini \\{ ko'rinishida yozing");
    if (/<!--/.test(s)) at('HTML izohi taqiqlangan');
    if (/!\[/.test(s)) at('rasmlar bu bosqichda ruxsat etilmagan');
    for (const lm of s.matchAll(/\]\(([^)]*)\)/g)) {
      // allowlist: ichki yo'l, https, mailto (client safeHref bilan bir xil); qolgani rad etiladi
      const u = lm[1].trim();
      if (!(/^\/(?![/\\])/.test(u) || /^https:\/\/\S+$/i.test(u) || /^mailto:\S+$/i.test(u))) at('xavfli yoki ruxsat etilmagan havola manzili');
    }

    for (const m of s.matchAll(/<\/?([A-Za-z][\w.-]*)([^>]*)>?/g)) {
      const tag = m[1];
      if (!ALLOWED_TAGS.has(tag)) at(`ruxsat etilmagan teg <${tag}> (ruxsat: ${[...ALLOWED_TAGS].join(', ')})`);
      else if (tag === 'Callout' && !m[0].startsWith('</') && !CALLOUT_ATTRS.test(m[2].replace(/\/\s*$/, ''))) {
        at('<Callout> faqat tone="info|warning|tip" atributini qabul qiladi');
      }
    }
  });
  if (fence !== null) issues.push('yopilmagan kod bloki');
  return issues;
}
