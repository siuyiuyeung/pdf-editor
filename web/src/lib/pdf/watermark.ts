import { StandardFonts, degrees, type PDFDocument, type PDFPage } from 'pdf-lib';
import { hexColor } from './color';
import { embedImage } from './embedImage';
import { PdfToolError } from './errors';
import { drawInVisualSpace, rotatedBounds, rotatedOrigin, type Size } from './geometry';
import { baseName, loadPdf, single } from './load';
import { parseRanges } from './ranges';
import { PDF_MIME, type Engine } from './types';

export const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
  'tiled',
] as const;
export type WatermarkPosition = (typeof POSITIONS)[number];

interface CommonOptions {
  /** 0.05-1 */
  opacity: number;
  /** Degrees, counter-clockwise as the page is displayed. */
  rotation: number;
  position: WatermarkPosition;
  /** '' = every page, otherwise a range list such as "1-3,5". */
  pages: string;
}
type TextWatermark = CommonOptions & { mode: 'text'; text: string; fontSize: number; color: string };
/** `scale` is the stamp width as a fraction of the page width (0.05-1). */
type ImageWatermark = CommonOptions & { mode: 'image'; image: Uint8Array; scale: number };
export type WatermarkOptions = TextWatermark | ImageWatermark;

/** Distance of the 9-grid positions from the page edge, in points. */
export const EDGE_MARGIN = 36;
/** Gap between tiles, in points. */
const TILE_GAP = 72;

function bad(message: string): never {
  throw new PdfToolError('BAD_OPTIONS', message);
}

/** Centre of a stamp whose (rotated) bounding box is `box`, in visual space. */
export function anchorCenter(position: Exclude<WatermarkPosition, 'tiled'>, page: Size, box: Size): [number, number] {
  const [row, col] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const cx =
    col === 'left' ? EDGE_MARGIN + box.width / 2 : col === 'right' ? page.width - EDGE_MARGIN - box.width / 2 : page.width / 2;
  const cy =
    row === 'top' ? page.height - EDGE_MARGIN - box.height / 2 : row === 'bottom' ? EDGE_MARGIN + box.height / 2 : page.height / 2;
  return [cx, cy];
}

/** Centres for a repeating grid of stamps; a stamp bigger than the page still gets one tile. */
export function tileCenters(page: Size, box: Size): [number, number][] {
  const stepX = box.width + TILE_GAP;
  const stepY = box.height + TILE_GAP;
  const centers: [number, number][] = [];
  for (let y = Math.min(stepY / 2, page.height / 2); y < page.height; y += stepY) {
    for (let x = Math.min(stepX / 2, page.width / 2); x < page.width; x += stepX) centers.push([x, y]);
  }
  return centers;
}

interface Stamp {
  /** Unrotated stamp size on a page of this (visual) size. */
  size(page: Size): Size;
  /** Draws with its unrotated bottom-left corner at (x, y), rotated about that corner. */
  draw(page: PDFPage, x: number, y: number, size: Size): void;
}

async function textStamp(doc: PDFDocument, opts: TextWatermark): Promise<Stamp> {
  const text = opts.text.trim();
  if (!text) bad('Enter the watermark text');
  if (!(opts.fontSize >= 6 && opts.fontSize <= 200)) bad('Font size must be between 6 and 200');
  const color = hexColor(opts.color);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  let width = 0;
  try {
    width = font.widthOfTextAtSize(text, opts.fontSize);
  } catch {
    bad('Watermark text can only use Latin characters (A–Z, accents and common symbols)');
  }
  const height = font.heightAtSize(opts.fontSize, { descender: false });
  return {
    size: () => ({ width, height }),
    draw: (page, x, y) =>
      page.drawText(text, { x, y, size: opts.fontSize, font, color, opacity: opts.opacity, rotate: degrees(opts.rotation) }),
  };
}

async function imageStamp(doc: PDFDocument, opts: ImageWatermark): Promise<Stamp> {
  if (!(opts.scale >= 0.05 && opts.scale <= 1)) bad('Image size must be between 5% and 100% of the page width');
  const { image } = await embedImage(doc, opts.image, 'The watermark image');
  return {
    size: (page) => ({ width: page.width * opts.scale, height: (page.width * opts.scale * image.height) / image.width }),
    draw: (page, x, y, size) =>
      page.drawImage(image, { x, y, width: size.width, height: size.height, opacity: opts.opacity, rotate: degrees(opts.rotation) }),
  };
}

export const watermark: Engine<WatermarkOptions> = async (inputs, opts) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  if (!(opts.opacity >= 0.05 && opts.opacity <= 1)) bad('Opacity must be between 5% and 100%');
  if (!Number.isFinite(opts.rotation) || Math.abs(opts.rotation) > 360) bad('Rotation must be between -360 and 360 degrees');
  if (!POSITIONS.includes(opts.position)) bad('Choose a watermark position');
  const targets = opts.pages.trim()
    ? [...new Set(parseRanges(opts.pages, doc.getPageCount()).flat())]
    : doc.getPageIndices();
  const stamp = opts.mode === 'text' ? await textStamp(doc, opts) : await imageStamp(doc, opts);

  for (const index of targets) {
    const page = doc.getPage(index);
    drawInVisualSpace(page, (pageSize) => {
      const size = stamp.size(pageSize);
      const box = rotatedBounds(size.width, size.height, opts.rotation);
      const centers = opts.position === 'tiled' ? tileCenters(pageSize, box) : [anchorCenter(opts.position, pageSize, box)];
      for (const [cx, cy] of centers) {
        const [x, y] = rotatedOrigin(cx, cy, size.width, size.height, opts.rotation);
        stamp.draw(page, x, y, size);
      }
    });
  }
  return [{ name: `${baseName(file.name)}-watermarked.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};
