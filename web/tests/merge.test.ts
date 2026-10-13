import { expect, test } from 'vitest';
import { merge } from '@/lib/pdf/merge';
import { input, makeEncryptedPdf, makePdf, pageCount, pageWidths } from './helpers';

test('merges pages in input order', async () => {
  const a = input('a.pdf', await makePdf(2, { size: [200, 300] }));
  const b = input('b.pdf', await makePdf(3, { size: [400, 500] }));
  const [out] = await merge([b, a], {});
  expect(out.name).toBe('merged.pdf');
  expect(out.mime).toBe('application/pdf');
  expect(await pageCount(out.bytes)).toBe(5);
  expect(await pageWidths(out.bytes)).toEqual([400, 400, 400, 200, 200]);
});

test('allows the same file twice', async () => {
  const a = input('a.pdf', await makePdf(2));
  const [out] = await merge([a, a], {});
  expect(await pageCount(out.bytes)).toBe(4);
});

test('needs at least two files', async () => {
  const a = input('a.pdf', await makePdf(1));
  await expect(merge([a], {})).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('propagates ENCRYPTED from any input', async () => {
  const a = input('a.pdf', await makePdf(1));
  const locked = input('locked.pdf', await makeEncryptedPdf());
  await expect(merge([a, locked], {})).rejects.toMatchObject({ code: 'ENCRYPTED' });
});
