/**
 * HTTP Range (RFC 9110) — faqat bitta `bytes=` oralig'i. iOS Safari <audio>/<video> 206 javobisiz
 * ijro etmaydi yoki o'tkazib (seek) bo'lmaydi; ko'p oraliqli so'rov kerak emas.
 *
 *  - header yo'q yoki bytes= emas            → { type: 'full' }  (200)
 *  - to'g'ri oraliq                          → { type: 'partial', start, end } (206, end — inclusive)
 *  - sintaktik to'g'ri, lekin fayldan tashqari → { type: 'unsatisfiable' } (416)
 *  - ko'p oraliq yoki buzuq                   → { type: 'full' } (RFC: e'tiborsiz qoldirish mumkin)
 */
export type RangeResult = { type: 'full' } | { type: 'partial'; start: number; end: number } | { type: 'unsatisfiable' };

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { type: 'full' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return { type: 'full' };
  if (size === 0) return { type: 'unsatisfiable' };
  let start: number;
  let end: number;
  if (m[1] === '') {
    // bytes=-N: oxirgi N bayt
    const n = Number(m[2]);
    if (n === 0) return { type: 'unsatisfiable' };
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (Number(m[2] || start) < start) return { type: 'full' };
  }
  if (!Number.isSafeInteger(start) || start >= size) return { type: 'unsatisfiable' };
  return { type: 'partial', start, end };
}
