import { BlendMode, LineCapStyle, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  HIGHLIGHT_OPACITY,
  LINE_HEIGHT,
  STANDARD_FONTS,
  TEXT_BASELINE,
  penPath,
  type EditObject,
  type FontName,
} from '../editor/model';
import { hexColor } from './color';
import { drawImageInBox, embedImage, type EmbeddedImage } from './embedImage';
import { PdfToolError } from './errors';
import { drawInVisualSpace } from './geometry';
import { baseName, loadPdf, single } from './load';
import { PDF_MIME, type Engine } from './types';

export type AnnotateOptions = {
  /** Objects in view space (top-left origin, y down, points). */
  objects: EditObject[];
  /** Image bytes keyed by ImageObject.imageId. */
  images: Record<string, Uint8Array>;
  /** Output name: <base>-edited.pdf or <base>-signed.pdf. */
  suffix: 'edited' | 'signed';
};

function bad(message: string): never {
  throw new PdfToolError('BAD_OPTIONS', message);
}

export const annotate: Engine<AnnotateOptions> = async (inputs, { objects, images, suffix }) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  if (objects.length === 0) bad('Add something to the page first');
  const pages = doc.getPages();
  if (objects.some((o) => !Number.isInteger(o.page) || o.page < 0 || o.page >= pages.length)) {
    bad('An object is placed on a page that does not exist');
  }

  // Embed fonts and images first (async); drawing below is synchronous inside drawInVisualSpace.
  const fonts = new Map<FontName, PDFFont>();
  const embedded = new Map<string, EmbeddedImage>();
  for (const o of objects) {
    if (o.type === 'text') {
      if (!(STANDARD_FONTS as readonly string[]).includes(o.font)) bad(`Unknown font "${o.font}"`);
      let font = fonts.get(o.font);
      if (!font) {
        font = await doc.embedFont(o.font);
        fonts.set(o.font, font);
      }
      try {
        font.widthOfTextAtSize(o.text.replace(/\n/g, ''), o.size);
      } catch {
        bad('Text can only use Latin characters (A–Z, accents and common symbols)');
      }
    } else if (o.type === 'image' && !embedded.has(o.imageId)) {
      embedded.set(o.imageId, await embedImage(doc, images[o.imageId], 'An inserted image'));
    }
  }

  pages.forEach((page, index) => {
    const mine = objects.filter((o) => o.page === index);
    if (mine.length === 0) return;
    drawInVisualSpace(page, ({ height }) => {
      for (const o of mine) drawObject(page, o, height, fonts, embedded);
    });
  });
  return [{ name: `${baseName(file.name)}-${suffix}.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};

/** Draws one object; the page is already in visual space (bottom-left origin) of height `pageHeight`. */
function drawObject(
  page: PDFPage,
  o: EditObject,
  pageHeight: number,
  fonts: Map<FontName, PDFFont>,
  images: Map<string, EmbeddedImage>,
): void {
  const flip = (y: number) => pageHeight - y;
  switch (o.type) {
    case 'text': {
      const font = fonts.get(o.font)!;
      const color = hexColor(o.color);
      o.text.split('\n').forEach((line, i) => {
        if (!line) return;
        page.drawText(line, { x: o.x, y: flip(o.y + o.size * (TEXT_BASELINE + LINE_HEIGHT * i)), size: o.size, font, color });
      });
      break;
    }
    case 'rect':
      page.drawRectangle({
        x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h, borderColor: hexColor(o.color), borderWidth: o.strokeWidth,
      });
      break;
    case 'ellipse':
      page.drawEllipse({
        x: o.x + o.w / 2, y: flip(o.y + o.h / 2), xScale: o.w / 2, yScale: o.h / 2,
        borderColor: hexColor(o.color), borderWidth: o.strokeWidth,
      });
      break;
    case 'highlight':
      page.drawRectangle({
        x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h,
        color: hexColor(o.color), opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply,
      });
      break;
    case 'whiteout':
      page.drawRectangle({ x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h, color: rgb(1, 1, 1) });
      break;
    case 'line':
      page.drawLine({
        start: { x: o.x1, y: flip(o.y1) }, end: { x: o.x2, y: flip(o.y2) },
        thickness: o.strokeWidth, color: hexColor(o.color), lineCap: LineCapStyle.Round,
      });
      break;
    case 'pen':
      // drawSvgPath takes SVG (y-down) coordinates relative to its origin, so view-space points
      // work unchanged when the origin is the page's top-left corner.
      page.drawSvgPath(penPath(o.points), {
        x: 0, y: pageHeight, borderColor: hexColor(o.color), borderWidth: o.strokeWidth, borderLineCap: LineCapStyle.Round,
      });
      break;
    case 'image':
      drawImageInBox(page, images.get(o.imageId)!, { x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h });
      break;
  }
}
