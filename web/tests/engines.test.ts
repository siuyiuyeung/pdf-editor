import { expect, test } from 'vitest';
import { engines } from '@/lib/pdf/engines';
import { input, makeEncryptedPdf, makePdf, makePng, tinyJpeg } from './helpers';

test('registry exposes the worker engines', () => {
  expect(Object.keys(engines).sort()).toEqual(['annotate', 'imageToPdf', 'merge', 'rotate', 'split', 'validate', 'watermark']);
});

test('validate passes good PDFs and returns no output', async () => {
  expect(await engines.validate([input('a.pdf', await makePdf(1))], {})).toEqual([]);
});

test('validate rejects encrypted and junk PDFs', async () => {
  await expect(engines.validate([input('x.pdf', await makeEncryptedPdf())], {})).rejects.toMatchObject({ code: 'ENCRYPTED' });
  await expect(engines.validate([input('y.pdf', new Uint8Array([1, 2, 3]))], {})).rejects.toMatchObject({ code: 'INVALID_FILE' });
});

test('validate accepts JPG/PNG by content, whatever the extension says', async () => {
  const files = [input('a.png', makePng(2, 2)), input('b.jpg', tinyJpeg()), input('really-a-jpeg.png', tinyJpeg())];
  expect(await engines.validate(files, {})).toEqual([]);
});

test('validate rejects non-image bytes with an image extension as INVALID_IMAGE', async () => {
  await expect(engines.validate([input('x.png', new TextEncoder().encode('nope'))], {})).rejects.toMatchObject({
    code: 'INVALID_IMAGE',
  });
});
