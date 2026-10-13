import { expect, test } from 'vitest';
import { split } from '@/lib/pdf/split';
import { input, makePdf, pageCount, pageWidths } from './helpers';

async function fivePages() {
  return input('doc.pdf', await makePdf(5));
}

test('ranges mode: one file per range', async () => {
  const out = await split([await fivePages()], { mode: 'ranges', ranges: '1-2,4' });
  expect(out.map((f) => f.name)).toEqual(['doc-part-1.pdf', 'doc-part-2.pdf']);
  expect(await pageCount(out[0].bytes)).toBe(2);
  expect(await pageCount(out[1].bytes)).toBe(1);
});

test('every mode: chunks of n, last chunk shorter', async () => {
  const out = await split([await fivePages()], { mode: 'every', n: 2 });
  expect(await Promise.all(out.map((f) => pageCount(f.bytes)))).toEqual([2, 2, 1]);
});

test('every mode rejects n < 1 and non-integers', async () => {
  const f = await fivePages();
  await expect(split([f], { mode: 'every', n: 0 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(split([f], { mode: 'every', n: 1.5 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('select mode: one file, sorted, de-duplicated pages', async () => {
  const src = input('doc.pdf', await makePdf(3, { size: [100, 100] }));
  const out = await split([src], { mode: 'select', pages: [2, 0, 0] });
  expect(out).toHaveLength(1);
  expect(out[0].name).toBe('doc-extracted.pdf');
  expect(await pageCount(out[0].bytes)).toBe(2);
  expect(await pageWidths(out[0].bytes)).toEqual([100, 100]);
});

test('select mode rejects empty and out-of-range selections', async () => {
  const f = await fivePages();
  await expect(split([f], { mode: 'select', pages: [] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(split([f], { mode: 'select', pages: [5] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('requires exactly one input', async () => {
  await expect(split([], { mode: 'every', n: 1 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});
