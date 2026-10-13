import { canvasToPng } from '../canvas';
import { MAX_BYTES } from '../files';
import { displaySize, readImageInfo } from '../image';
import { PdfToolError } from '../pdf/errors';

/**
 * Reads an image picked inside Sign/Edit. Photos carrying an EXIF rotation are redrawn upright as PNG,
 * so the on-screen preview (SVG <image>) and the exported PDF agree. Browser only.
 */
export async function prepareImage(file: File): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (file.size > MAX_BYTES) throw new PdfToolError('TOO_LARGE', `${file.name} is larger than 50 MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = readImageInfo(bytes);
  if (!info) throw new PdfToolError('INVALID_IMAGE', `${file.name} isn't a valid JPG or PNG image`);
  if (info.orientation === 1) return { bytes, width: info.width, height: info.height };
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart])); // browsers apply EXIF orientation here
  const { width, height } = displaySize(info);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvasToPng(canvas);
}
