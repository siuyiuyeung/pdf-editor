import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import { crop, cropBoxFor, type CropOptions } from '@/lib/pdf/crop';
import { input, makePdf } from './helpers';

const boxOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => {
    const b = p.getCropBox();
    return [b.x, b.y, b.width, b.height].map((n) => +n.toFixed(2));
  });

test('cropBoxFor: an unrotated page maps the fractions directly (top-left origin)', () => {
  expect(cropBoxFor({ x: 0, y: 0, width: 200, height: 300 }, 0, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toEqual({
    x: 20, y: 120, width: 100, height: 150,
  });
});

test('cropBoxFor: on a /Rotate 90 page the displayed top-left quarter is the user-space bottom-left', () => {
  // Displayed page is 300×200; its top-left quarter is visual x 0-150, y 100-200.
  expect(cropBoxFor({ x: 0, y: 0, width: 200, height: 300 }, 90, { x: 0, y: 0, w: 0.5, h: 0.5 })).toEqual({
    x: 0, y: 0, width: 100, height: 150,
  });
});

test('cropBoxFor: the whole page keeps an offset box unchanged', () => {
  expect(cropBoxFor({ x: 50, y: 60, width: 200, height: 300 }, 0, { x: 0, y: 0, w: 1, h: 1 })).toEqual({
    x: 50, y: 60, width: 200, height: 300,
  });
});

const RECT = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

test('crop all pages', async () => {
  const [out] = await crop([input('doc.pdf', await makePdf(2))], { rect: RECT, pages: 'all' });
  expect(out.name).toBe('doc-cropped.pdf');
  expect(await boxOf(out.bytes)).toEqual([[20, 30, 160, 240], [20, 30, 160, 240]]);
});

test('crop only the chosen pages', async () => {
  const [out] = await crop([input('doc.pdf', await makePdf(3))], { rect: RECT, pages: [1] });
  expect(await boxOf(out.bytes)).toEqual([[0, 0, 200, 300], [20, 30, 160, 240], [0, 0, 200, 300]]);
});

test('crop is relative to the existing crop box', async () => {
  const [out] = await crop([input('o.pdf', await makePdf(1, { mediaBox: [50, 60, 200, 300] }))], { rect: RECT, pages: 'all' });
  expect(await boxOf(out.bytes)).toEqual([[70, 90, 160, 240]]);
});

test('typed errors', async () => {
  const doc = input('doc.pdf', await makePdf(2));
  const bad = (opts: CropOptions) => expect(crop([doc], opts)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await bad({ rect: { x: 0, y: 0, w: 0, h: 0.5 }, pages: 'all' });
  await bad({ rect: { x: 0.6, y: 0, w: 0.5, h: 0.5 }, pages: 'all' });
  await bad({ rect: { x: -0.1, y: 0, w: 0.5, h: 0.5 }, pages: 'all' });
  await bad({ rect: RECT, pages: [5] });
  await bad({ rect: RECT, pages: [] });
});

test('an inverted page box is normalised before cropping', async () => {
  const doc = await PDFDocument.load(await makePdf(1));
  doc.getPage(0).setMediaBox(200, 300, -200, -300); // stored as [200 300 0 0]
  doc.getPage(0).setCropBox(200, 300, -200, -300);
  const [out] = await crop([input('inv.pdf', await doc.save())], { rect: RECT, pages: 'all' });
  expect(await boxOf(out.bytes)).toEqual([[20, 30, 160, 240]]);
});

test('a crop box larger than the page is clipped to the page first, as viewers show it', async () => {
  const doc = await PDFDocument.load(await makePdf(1));
  doc.getPage(0).setCropBox(-50, -50, 300, 400);
  const [out] = await crop([input('big.pdf', await doc.save())], { rect: RECT, pages: 'all' });
  expect(await boxOf(out.bytes)).toEqual([[20, 30, 160, 240]]);
});
