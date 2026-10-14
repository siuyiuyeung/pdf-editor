import { PdfToolError } from './errors';
import { apply, visualSize, visualToUser, type Box } from './geometry';
import { baseName, loadPdf, single } from './load';
import { PDF_MIME, type Engine } from './types';

/** Fractions (0-1) of the page as displayed; origin top-left, like the editor's view space. */
export type CropRect = { x: number; y: number; w: number; h: number };
export type CropOptions = { rect: CropRect; pages: number[] | 'all' };

/** Smallest crop, as a fraction of the page side. */
export const MIN_CROP = 0.02;
const EPS = 1e-6;

function bad(message: string): never {
  throw new PdfToolError('BAD_OPTIONS', message);
}

/** The new CropBox (user space) for a page whose current CropBox is `box` and /Rotate is `rotation`. */
export function cropBoxFor(box: Box, rotation: number, rect: CropRect): Box {
  const { width: W, height: H } = visualSize(box, rotation);
  const m = visualToUser(box, rotation);
  const [ax, ay] = apply(m, rect.x * W, H - (rect.y + rect.h) * H);
  const [bx, by] = apply(m, (rect.x + rect.w) * W, H - rect.y * H);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

const normalize = (b: Box): Box => ({
  x: Math.min(b.x, b.x + b.width),
  y: Math.min(b.y, b.y + b.height),
  width: Math.abs(b.width),
  height: Math.abs(b.height),
});

/** The area viewers actually show: the CropBox clipped to the MediaBox, with inverted boxes normalised. */
export function visibleBox(cropBox: Box, mediaBox: Box): Box {
  const c = normalize(cropBox);
  const m = normalize(mediaBox);
  const x = Math.max(c.x, m.x);
  const y = Math.max(c.y, m.y);
  const right = Math.min(c.x + c.width, m.x + m.width);
  const top = Math.min(c.y + c.height, m.y + m.height);
  // A CropBox entirely outside the MediaBox is invalid; viewers fall back to the MediaBox.
  return right > x && top > y ? { x, y, width: right - x, height: top - y } : m;
}

export const crop: Engine<CropOptions> = async (inputs, { rect, pages }) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  const values = [rect.x, rect.y, rect.w, rect.h];
  if (
    !values.every(Number.isFinite) ||
    rect.x < -EPS || rect.y < -EPS ||
    rect.w < MIN_CROP || rect.h < MIN_CROP ||
    rect.x + rect.w > 1 + EPS || rect.y + rect.h > 1 + EPS
  ) {
    bad('The crop area must be inside the page');
  }
  const total = doc.getPageCount();
  const targets = pages === 'all' ? doc.getPageIndices() : [...new Set(pages)];
  if (targets.length === 0 || targets.some((p) => !Number.isInteger(p) || p < 0 || p >= total)) {
    bad(`Pages to crop must be within 1-${total}`);
  }
  for (const index of targets) {
    const page = doc.getPage(index);
    const b = cropBoxFor(visibleBox(page.getCropBox(), page.getMediaBox()), page.getRotation().angle, rect);
    page.setCropBox(b.x, b.y, b.width, b.height);
  }
  return [{ name: `${baseName(file.name)}-cropped.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};
