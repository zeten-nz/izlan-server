/** Fayl turini mazmuni (magic bytes) bo'yicha aniqlaydi. SVG ataylab qabul qilinmaydi (skript xavfi). */
export type Sniffed = { kind: 'IMAGE' | 'AUDIO'; mime: string; ext: string };

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

export function sniff(b: Buffer): Sniffed | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return { kind: 'IMAGE', mime: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'IMAGE', mime: 'image/jpeg', ext: 'jpg' };
  if (ascii(b, 0, 4) === 'GIF8') return { kind: 'IMAGE', mime: 'image/gif', ext: 'gif' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { kind: 'IMAGE', mime: 'image/webp', ext: 'webp' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return { kind: 'AUDIO', mime: 'audio/wav', ext: 'wav' };
  if (ascii(b, 0, 4) === 'OggS') return { kind: 'AUDIO', mime: 'audio/ogg', ext: 'ogg' };
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: 'AUDIO', mime: 'audio/mpeg', ext: 'mp3' };
  if (ascii(b, 4, 8) === 'ftyp') return { kind: 'AUDIO', mime: 'audio/mp4', ext: 'm4a' };
  return null;
}
