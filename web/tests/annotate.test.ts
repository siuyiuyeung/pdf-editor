import { expect, test } from 'vitest';
import type { EditObject, FontName, TextObject } from '@/lib/editor/model';
import { annotate, type AnnotateOptions } from '@/lib/pdf/annotate';
import { imageCounts, input, makePdf, makePng, pageCount, pageText, type TextItem } from './helpers';

const textAt = (x: number, y: number, text = 'Hello', page = 0): TextObject => ({
  id: `t${x}-${y}`, page, type: 'text', x, y, text, font: 'Helvetica', size: 12, color: '#000000',
});
const opts = (objects: EditObject[], images: AnnotateOptions['images'] = {}): AnnotateOptions => ({
  objects, images, suffix: 'edited',
});
const find = (items: TextItem[], str: string) => items.find((t) => t.str === str)!;

test('text lands where it was placed (view space: top-left origin, y down)', async () => {
  const [out] = await annotate([input('doc.pdf', await makePdf(1))], opts([textAt(20, 30)]));
  expect(out.name).toBe('doc-edited.pdf');
  const hello = find((await pageText(out.bytes))[0], 'Hello');
  expect(hello.x).toBeCloseTo(20);
  expect(hello.y).toBeCloseTo(300 - 30 - 12 * 0.8);
});

test('each extra line steps down by 1.2 × the font size', async () => {
  const [out] = await annotate([input('doc.pdf', await makePdf(1))], opts([textAt(20, 30, 'first\nsecond')]));
  const items = (await pageText(out.bytes))[0];
  expect(find(items, 'first').y - find(items, 'second').y).toBeCloseTo(14.4);
});

test('on a /Rotate 90 page the text is where the viewer saw it', async () => {
  const [out] = await annotate([input('r.pdf', await makePdf(1, { rotate: 90 }))], opts([textAt(20, 30)]));
  const hello = find((await pageText(out.bytes))[0], 'Hello');
  // Displayed page is 300×200: view (20, 30) → visual (20, 160.4) → user (200 - 160.4, 20).
  expect(hello.x).toBeCloseTo(39.6);
  expect(hello.y).toBeCloseTo(20);
});

test('images are drawn on their own pages and named by suffix', async () => {
  const img = (id: string, page: number): EditObject => ({ id, page, type: 'image', x: 10, y: 10, w: 40, h: 20, imageId: 'sig' });
  const [out] = await annotate([input('doc.pdf', await makePdf(3))], {
    objects: [img('a', 0), img('b', 2), img('c', 2)],
    images: { sig: makePng(40, 20) },
    suffix: 'signed',
  });
  expect(out.name).toBe('doc-signed.pdf');
  expect(await imageCounts(out.bytes)).toEqual([1, 0, 1]);
});

test('every shape type exports to a loadable PDF that keeps the original content', async () => {
  const s = { page: 0, color: '#3366ff', strokeWidth: 2 };
  const objects: EditObject[] = [
    { ...s, id: '1', type: 'rect', x: 10, y: 10, w: 50, h: 30 },
    { ...s, id: '2', type: 'ellipse', x: 10, y: 50, w: 50, h: 30 },
    { ...s, id: '3', type: 'highlight', x: 10, y: 90, w: 50, h: 10 },
    { ...s, id: '4', type: 'whiteout', x: 10, y: 110, w: 50, h: 10 },
    { ...s, id: '5', type: 'line', x1: 10, y1: 130, x2: 90, y2: 150 },
    { ...s, id: '6', type: 'pen', points: [10, 160, 20, 170, 30, 160] },
    { ...s, id: '7', type: 'pen', points: [40, 160] },
  ];
  const [out] = await annotate([input('doc.pdf', await makePdf(1))], opts(objects));
  expect(await pageCount(out.bytes)).toBe(1);
  expect((await pageText(out.bytes))[0].map((t) => t.str)).toContain('Page 1');
});

test('typed errors', async () => {
  const doc = input('doc.pdf', await makePdf(1));
  await expect(annotate([doc], opts([]))).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(annotate([doc], opts([textAt(1, 1, 'x', 3)]))).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(annotate([doc], opts([textAt(1, 1, '签名')]))).rejects.toMatchObject({
    code: 'BAD_OPTIONS',
    message: expect.stringContaining('Latin'),
  });
  await expect(annotate([doc], opts([{ ...textAt(1, 1), color: 'blue' }]))).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(annotate([doc], opts([{ ...textAt(1, 1), font: 'Comic-Sans' as FontName }]))).rejects.toMatchObject({
    code: 'BAD_OPTIONS',
  });
  await expect(
    annotate([doc], opts([{ id: 'i', page: 0, type: 'image', x: 0, y: 0, w: 1, h: 1, imageId: 'missing' }])),
  ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
});
