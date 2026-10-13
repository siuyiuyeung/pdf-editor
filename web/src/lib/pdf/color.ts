import { rgb, type RGB } from 'pdf-lib';
import { PdfToolError } from './errors';

/** "#e5322d" -> pdf-lib RGB. Anything else is BAD_OPTIONS. */
export function hexColor(hex: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new PdfToolError('BAD_OPTIONS', `"${hex}" isn't a valid color`);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
