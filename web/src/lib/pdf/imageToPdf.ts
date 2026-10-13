import { PDFDocument } from 'pdf-lib';
import { displaySize, readImageInfo } from '../image';
import { drawImageInBox, embedImage } from './embedImage';
import { PdfToolError } from './errors';
import type { Size } from './geometry';
import { baseName } from './load';
import { PDF_MIME, type Engine } from './types';

export type ImageToPdfOptions = {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: 'none' | 'small' | 'large';
};

/** Portrait [width, height] in points. */
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS = { none: 0, small: 20, large: 40 } as const;
const ORIENTATIONS = ['auto', 'portrait', 'landscape'];
/** "Fit to image" places pixels at 96 per inch. */
const PT_PER_PX = 0.75;

export interface ImageLayout {
  pageWidth: number;
  pageHeight: number;
  /** The image box, bottom-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page size and image box for an image whose *displayed* pixel size is `display`. */
export function layoutImage(display: Size, opts: ImageToPdfOptions): ImageLayout {
  const m = MARGINS[opts.margin];
  if (opts.pageSize === 'fit') {
    const width = display.width * PT_PER_PX;
    const height = display.height * PT_PER_PX;
    return { pageWidth: width + 2 * m, pageHeight: height + 2 * m, x: m, y: m, width, height };
  }
  const [short, long] = PAGE_SIZES[opts.pageSize];
  const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && display.width > display.height);
  const pageWidth = landscape ? long : short;
  const pageHeight = landscape ? short : long;
  const scale = Math.min((pageWidth - 2 * m) / display.width, (pageHeight - 2 * m) / display.height);
  const width = display.width * scale;
  const height = display.height * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

export const imageToPdf: Engine<ImageToPdfOptions> = async (inputs, opts) => {
  if (inputs.length === 0) throw new PdfToolError('BAD_OPTIONS', 'Add at least one image');
  if (
    !(opts.pageSize === 'fit' || opts.pageSize in PAGE_SIZES) ||
    !(opts.margin in MARGINS) ||
    !ORIENTATIONS.includes(opts.orientation)
  ) {
    throw new PdfToolError('BAD_OPTIONS', 'Choose a page size, orientation and margin');
  }

  const doc = await PDFDocument.create();
  for (const file of inputs) {
    const info = readImageInfo(file.bytes);
    if (!info) throw new PdfToolError('INVALID_IMAGE', `${file.name} isn't a valid JPG or PNG image`);
    const embedded = await embedImage(doc, file.bytes, file.name);
    const layout = layoutImage(displaySize(info), opts);
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    drawImageInBox(page, embedded, layout);
  }
  const name = inputs.length === 1 ? `${baseName(inputs[0].name)}.pdf` : 'images.pdf';
  return [{ name, bytes: await doc.save(), mime: PDF_MIME }];
};
