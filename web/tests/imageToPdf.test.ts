import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import { imageToPdf, layoutImage, type ImageToPdfOptions } from '@/lib/pdf/imageToPdf';
import { imageCounts, input, makePng, tinyJpeg, withExifOrientation } from './helpers';

const FIT: ImageToPdfOptions = { pageSize: 'fit', orientation: 'auto', margin: 'none' };
const A4: ImageToPdfOptions = { pageSize: 'a4', orientation: 'auto', margin: 'none' };

async function pageSizes(bytes: Uint8Array): Promise<[number, number][]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => [+p.getWidth().toFixed(2), +p.getHeight().toFixed(2)]);
}

test('fit: page is the image at 96 px per inch, plus margins', () => {
  expect(layoutImage({ width: 40, height: 20 }, FIT)).toEqual({ pageWidth: 30, pageHeight: 15, x: 0, y: 0, width: 30, height: 15 });
  expect(layoutImage({ width: 40, height: 20 }, { ...FIT, margin: 'small' })).toEqual({
    pageWidth: 70, pageHeight: 55, x: 20, y: 20, width: 30, height: 15,
  });
});

test('a4 auto goes landscape for a wide image and centres it', () => {
  const l = layoutImage({ width: 400, height: 200 }, A4);
  expect(l.pageWidth).toBeCloseTo(841.89);
  expect(l.pageHeight).toBeCloseTo(595.28);
  expect(l.width).toBeCloseTo(841.89);
  expect(l.height).toBeCloseTo(841.89 / 2);
  expect(l.x).toBeCloseTo(0);
  expect(l.y).toBeCloseTo((595.28 - 841.89 / 2) / 2);
});

test('forced portrait with a large margin scales into the margin box', () => {
  const l = layoutImage({ width: 400, height: 200 }, { pageSize: 'a4', orientation: 'portrait', margin: 'large' });
  expect(l.pageWidth).toBeCloseTo(595.28);
  expect(l.width).toBeCloseTo(595.28 - 80);
  expect(l.x).toBeCloseTo(40);
  expect(l.y).toBeCloseTo((841.89 - (595.28 - 80) / 2) / 2);
});

test('letter auto stays portrait for a tall image', () => {
  expect(layoutImage({ width: 100, height: 300 }, { ...A4, pageSize: 'letter' })).toMatchObject({ pageWidth: 612, pageHeight: 792 });
});

test('one page per image, in input order, named images.pdf', async () => {
  const out = await imageToPdf([input('wide.png', makePng(40, 20)), input('tiny.jpg', tinyJpeg())], FIT);
  expect(out).toHaveLength(1);
  expect(out[0].name).toBe('images.pdf');
  expect(out[0].mime).toBe('application/pdf');
  expect(await pageSizes(out[0].bytes)).toEqual([[30, 15], [3, 1.5]]);
  expect(await imageCounts(out[0].bytes)).toEqual([1, 1]);
});

test('a single image is named after the image', async () => {
  const [out] = await imageToPdf([input('scan.png', makePng(4, 4))], A4);
  expect(out.name).toBe('scan.pdf');
});

test('EXIF orientation 6 (phone held upright) gives a portrait page', async () => {
  const [out] = await imageToPdf([input('photo.jpg', withExifOrientation(tinyJpeg(), 6))], FIT);
  expect(await pageSizes(out.bytes)).toEqual([[1.5, 3]]);
});

test('typed errors', async () => {
  await expect(imageToPdf([input('x.png', new TextEncoder().encode('nope'))], FIT)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  await expect(imageToPdf([], FIT)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    imageToPdf([input('a.png', makePng(2, 2))], { ...FIT, pageSize: 'a3' } as unknown as ImageToPdfOptions),
  ).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});
