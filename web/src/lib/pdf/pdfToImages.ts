import { PdfToolError } from './errors';
import type { Size } from './geometry';
import { baseName, single } from './load';
import type { InputFile, OutputFile } from './types';

export type ImageFormat = 'jpg' | 'png';

export type PdfToImagesOptions = { format: ImageFormat; dpi: 72 | 150 | 300; pages: number[] | 'all' };

/** Renders pages of one opened PDF. The browser implementation is pdfjsRenderer.ts; unit tests use a fake. */
export interface PageRenderer {
  pageCount: number;
  /** Page size in points as displayed (CropBox after /Rotate). */
  pageSize(index: number): Promise<Size>;
  /** Encodes page `index` (0-based) at `scale` pixels per point. */
  render(index: number, scale: number, mime: string): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

export type OpenRenderer = (bytes: Uint8Array) => Promise<PageRenderer>;

/** Safari caps canvas area at 16,777,216 px; stay safely under it. */
export const MAX_PIXELS = 16_000_000;
/** Longest canvas side every target browser accepts. */
export const MAX_SIDE = 16_384;

const MIME: Record<ImageFormat, string> = { jpg: 'image/jpeg', png: 'image/png' };
const DPIS = [72, 150, 300];

/** Pixels-per-point scale and output size for a page at `dpi`, capped to what a browser canvas can hold. */
export function pixelSize(page: Size, dpi: number): { scale: number; width: number; height: number } {
  const scale = Math.min(
    dpi / 72,
    Math.sqrt(MAX_PIXELS / (page.width * page.height)),
    MAX_SIDE / Math.max(page.width, page.height),
  );
  return {
    scale,
    width: Math.max(1, Math.round(page.width * scale)),
    height: Math.max(1, Math.round(page.height * scale)),
  };
}

/** Main-thread engine (needs a canvas): one image per selected page. */
export async function pdfToImages(
  inputs: InputFile[],
  opts: PdfToImagesOptions,
  open: OpenRenderer,
): Promise<OutputFile[]> {
  const file = single(inputs);
  if (!(opts.format in MIME) || !DPIS.includes(opts.dpi)) {
    throw new PdfToolError('BAD_OPTIONS', 'Choose JPG or PNG at 72, 150 or 300 DPI');
  }
  const renderer = await open(file.bytes);
  try {
    const total = renderer.pageCount;
    const pages =
      opts.pages === 'all' ? Array.from({ length: total }, (_, i) => i) : [...new Set(opts.pages)].sort((a, b) => a - b);
    if (pages.length === 0) throw new PdfToolError('BAD_OPTIONS', 'Select at least one page');
    if (pages.some((p) => !Number.isInteger(p) || p < 0 || p >= total)) {
      throw new PdfToolError('BAD_OPTIONS', `Selected pages must be within 1-${total}`);
    }
    const base = baseName(file.name);
    const digits = String(total).length;
    const mime = MIME[opts.format];
    const out: OutputFile[] = [];
    for (const p of pages) {
      const { scale } = pixelSize(await renderer.pageSize(p), opts.dpi);
      out.push({
        name: `${base}-page-${String(p + 1).padStart(digits, '0')}.${opts.format}`,
        bytes: await renderer.render(p, scale, mime),
        mime,
      });
    }
    return out;
  } finally {
    await renderer.destroy();
  }
}
