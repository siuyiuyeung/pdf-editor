import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from 'vitest';
import { anchorCenter, tileCenters, watermark, type WatermarkOptions } from '@/lib/pdf/watermark';
import { imageCounts, input, makePdf, makePng, pageText, type TextItem } from './helpers';

const TEXT: WatermarkOptions = {
  mode: 'text', text: 'MARK', fontSize: 20, color: '#ff0000', opacity: 0.5, rotation: 0, position: 'center', pages: '',
};

async function markSize(text: string, size: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  return { w: font.widthOfTextAtSize(text, size), h: font.heightAtSize(size, { descender: false }) };
}

const marks = (items: TextItem[], text = 'MARK') => items.filter((t) => t.str === text);

test('anchorCenter puts the 9-grid 36 pt from the edges', () => {
  const page = { width: 200, height: 300 };
  const box = { width: 20, height: 10 };
  expect(anchorCenter('top-left', page, box)).toEqual([46, 259]);
  expect(anchorCenter('middle-left', page, box)).toEqual([46, 150]);
  expect(anchorCenter('center', page, box)).toEqual([100, 150]);
  expect(anchorCenter('bottom-right', page, box)).toEqual([154, 41]);
});

test('tileCenters covers the page, and always yields at least one tile', () => {
  expect(tileCenters({ width: 200, height: 100 }, { width: 28, height: 28 })).toEqual([[50, 50], [150, 50]]);
  expect(tileCenters({ width: 200, height: 100 }, { width: 500, height: 500 })).toEqual([[100, 50]]);
});

test('text watermark is centred on every page', async () => {
  const [out] = await watermark([input('doc.pdf', await makePdf(2))], TEXT);
  expect(out.name).toBe('doc-watermarked.pdf');
  const { w, h } = await markSize('MARK', 20);
  for (const items of await pageText(out.bytes)) {
    const [m] = marks(items);
    expect(m.x).toBeCloseTo(100 - w / 2, 1);
    expect(m.y).toBeCloseTo(150 - h / 2, 1);
  }
});

test('pages limits which pages are stamped', async () => {
  const [out] = await watermark([input('doc.pdf', await makePdf(3))], { ...TEXT, pages: '2' });
  expect((await pageText(out.bytes)).map((items) => marks(items).length)).toEqual([0, 1, 0]);
});

test('top-left on a /Rotate 90 page lands at the displayed top-left corner', async () => {
  const [out] = await watermark([input('r.pdf', await makePdf(1, { rotate: 90 }))], { ...TEXT, position: 'top-left' });
  const { h } = await markSize('MARK', 20);
  const [m] = marks((await pageText(out.bytes))[0]);
  // Visual origin (36, 164 - h) on a 300×200 displayed page maps to user (200 - (164 - h), 36).
  expect(m.x).toBeCloseTo(36 + h, 1);
  expect(m.y).toBeCloseTo(36, 1);
});

test('centre respects a CropBox that does not start at 0,0', async () => {
  const [out] = await watermark([input('o.pdf', await makePdf(1, { mediaBox: [50, 60, 200, 300] }))], TEXT);
  const { w, h } = await markSize('MARK', 20);
  const [m] = marks((await pageText(out.bytes))[0]);
  expect(m.x).toBeCloseTo(150 - w / 2, 1);
  expect(m.y).toBeCloseTo(210 - h / 2, 1);
});

test('tiled repeats the mark across the page', async () => {
  const [out] = await watermark([input('doc.pdf', await makePdf(1))], {
    ...TEXT, text: 'DRAFT', fontSize: 12, rotation: 45, position: 'tiled',
  });
  expect(marks((await pageText(out.bytes))[0], 'DRAFT').length).toBeGreaterThan(4);
});

test('image watermark is drawn on the selected pages only', async () => {
  const opts: WatermarkOptions = {
    mode: 'image', image: makePng(40, 20), scale: 0.5, opacity: 0.4, rotation: 45, position: 'center', pages: '1',
  };
  const [out] = await watermark([input('doc.pdf', await makePdf(2))], opts);
  expect(await imageCounts(out.bytes)).toEqual([1, 0]);
});

test('typed errors', async () => {
  const doc = input('doc.pdf', await makePdf(2));
  await expect(watermark([doc], { ...TEXT, text: '机密' })).rejects.toMatchObject({
    code: 'BAD_OPTIONS',
    message: expect.stringContaining('Latin'),
  });
  await expect(watermark([doc], { ...TEXT, text: '   ' })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(watermark([doc], { ...TEXT, opacity: 0 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(watermark([doc], { ...TEXT, pages: '9' })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(watermark([doc], { ...TEXT, color: 'red' })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    watermark([doc], { ...TEXT, position: 'nowhere' as WatermarkOptions['position'] }),
  ).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    watermark([doc], { mode: 'image', image: new Uint8Array([1, 2]), scale: 0.5, opacity: 1, rotation: 0, position: 'center', pages: '' }),
  ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
});
