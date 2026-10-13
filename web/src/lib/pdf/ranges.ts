import { PdfToolError } from './errors';

const bad = (message: string) => new PdfToolError('BAD_OPTIONS', message);

/** "1-3,5" on a 5-page doc -> [[0,1,2],[4]] (0-based). */
export function parseRanges(spec: string, pageCount: number): number[][] {
  const parts = spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw bad('Enter at least one page range, e.g. 1-3,5');

  return parts.map((part) => {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw bad(`"${part}" isn't a valid range`);
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (end < start) throw bad(`"${part}" ends before it starts`);
    if (start < 1 || end > pageCount) throw bad(`"${part}" is outside 1-${pageCount}`);
    return Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  });
}
