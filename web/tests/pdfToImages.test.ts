import { expect, test } from 'vitest';
import type { Size } from '@/lib/pdf/geometry';
import { MAX_PIXELS, MAX_SIDE, pdfToImages, pixelSize, type OpenRenderer } from '@/lib/pdf/pdfToImages';
import { input } from './helpers';

function fakeRenderer(sizes: Size[]) {
  const calls: { index: number; scale: number; mime: string }[] = [];
  let destroyed = false;
  const open: OpenRenderer = async () => ({
    pageCount: sizes.length,
    pageSize: async (i) => sizes[i],
    render: async (index, scale, mime) => {
      calls.push({ index, scale, mime });
      return new Uint8Array([index]);
    },
    destroy: async () => {
      destroyed = true;
    },
  });
  return { open, calls, destroyed: () => destroyed };
}

const pdf = input('doc.pdf', new Uint8Array([1]));
const page = { width: 200, height: 300 };

test('all pages: zero-padded names, DPI scale, mime, and the document is closed', async () => {
  const r = fakeRenderer(Array(12).fill(page));
  const out = await pdfToImages([pdf], { format: 'jpg', dpi: 150, pages: 'all' }, r.open);
  expect(out).toHaveLength(12);
  expect(out[0]).toMatchObject({ name: 'doc-page-01.jpg', mime: 'image/jpeg' });
  expect(out[11].name).toBe('doc-page-12.jpg');
  expect(r.calls[0].scale).toBeCloseTo(150 / 72);
  expect(r.destroyed()).toBe(true);
});

test('selected pages are sorted and de-duplicated', async () => {
  const r = fakeRenderer([page, page, page]);
  const out = await pdfToImages([pdf], { format: 'png', dpi: 72, pages: [2, 0, 2] }, r.open);
  expect(out.map((f) => f.name)).toEqual(['doc-page-1.png', 'doc-page-3.png']);
  expect(out[0].mime).toBe('image/png');
  expect(r.calls.map((c) => c.index)).toEqual([0, 2]);
});

test('bad options are BAD_OPTIONS and the document is still closed', async () => {
  const r = fakeRenderer([page, page]);
  await expect(pdfToImages([pdf], { format: 'png', dpi: 72, pages: [] }, r.open)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  expect(r.destroyed()).toBe(true);
  await expect(pdfToImages([pdf], { format: 'png', dpi: 72, pages: [2] }, r.open)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    pdfToImages([pdf], { format: 'png', dpi: 100 as 72, pages: 'all' }, r.open),
  ).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(pdfToImages([], { format: 'png', dpi: 72, pages: 'all' }, r.open)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('pixelSize gives the exact DPI size for ordinary pages', () => {
  expect(pixelSize(page, 150)).toMatchObject({ width: 417, height: 625 });
  expect(pixelSize(page, 72)).toEqual({ scale: 1, width: 200, height: 300 });
});

test('pixelSize caps huge pages under the canvas area limit and keeps the aspect ratio', () => {
  const a0 = { width: 2384, height: 3370 };
  const s = pixelSize(a0, 300);
  expect(s.width * s.height).toBeLessThanOrEqual(MAX_PIXELS);
  expect(s.width / s.height).toBeCloseTo(2384 / 3370, 2);
});

test('pixelSize caps the longest side for long strips', () => {
  const s = pixelSize({ width: 20000, height: 10 }, 72);
  expect(s.width).toBeLessThanOrEqual(MAX_SIDE);
});
