import { degrees, type PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib';
import { orientationRotation, readImageInfo } from '../image';
import { PdfToolError } from './errors';

export interface EmbeddedImage {
  image: PDFImage;
  /** Clockwise rotation a viewer applies to show the image upright (from EXIF). */
  rotation: 0 | 90 | 180 | 270;
}

export async function embedImage(doc: PDFDocument, bytes: Uint8Array | undefined, label: string): Promise<EmbeddedImage> {
  const info = bytes ? readImageInfo(bytes) : null;
  if (!bytes || !info) throw new PdfToolError('INVALID_IMAGE', `${label} isn't a valid JPG or PNG image`);
  try {
    const image = info.type === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    return { image, rotation: orientationRotation(info.orientation) };
  } catch {
    throw new PdfToolError('INVALID_IMAGE', `${label} couldn't be read — the image may be damaged`);
  }
}

export interface PlacedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the image upright (after its EXIF rotation) so that it exactly fills `box`.
 * The box uses a bottom-left origin with y up; pdf-lib rotates images about their (x, y) corner.
 */
export function drawImageInBox(page: PDFPage, { image, rotation }: EmbeddedImage, box: PlacedBox): void {
  const { x, y, width: w, height: h } = box;
  switch (rotation) {
    case 0:
      page.drawImage(image, { x, y, width: w, height: h });
      break;
    case 90:
      page.drawImage(image, { x, y: y + h, width: h, height: w, rotate: degrees(-90) });
      break;
    case 180:
      page.drawImage(image, { x: x + w, y: y + h, width: w, height: h, rotate: degrees(180) });
      break;
    case 270:
      page.drawImage(image, { x: x + w, y, width: h, height: w, rotate: degrees(90) });
      break;
  }
}
