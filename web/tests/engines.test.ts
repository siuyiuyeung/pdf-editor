import { expect, test } from 'vitest';
import { engines } from '@/lib/pdf/engines';
import { input, makeEncryptedPdf, makePdf } from './helpers';

test('registry exposes validate, merge, split, rotate', () => {
  expect(Object.keys(engines).sort()).toEqual(['merge', 'rotate', 'split', 'validate']);
});

test('validate passes good PDFs and returns no output', async () => {
  expect(await engines.validate([input('a.pdf', await makePdf(1))], {})).toEqual([]);
});

test('validate rejects encrypted and junk PDFs', async () => {
  await expect(engines.validate([input('x.pdf', await makeEncryptedPdf())], {})).rejects.toMatchObject({ code: 'ENCRYPTED' });
  await expect(engines.validate([input('y.pdf', new Uint8Array([1, 2, 3]))], {})).rejects.toMatchObject({ code: 'INVALID_FILE' });
});
