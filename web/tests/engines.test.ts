import { expect, test } from 'vitest';
import { engines } from '@/lib/pdf/engines';
import { input, makeEncryptedPdf, makePdf, makePng, tinyJpeg } from './helpers';

test('registry exposes the worker engines', () => {
  expect(Object.keys(engines).sort()).toEqual(['annotate', 'crop', 'imageToPdf', 'merge', 'rotate', 'split', 'validate', 'watermark']);
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

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const bytes = (head: number[]) => Uint8Array.from([...head, 0, 0, 0, 0]);

test('validate accepts Office files with the right container magic', async () => {
  const files = [
    input('a.docx', bytes(ZIP)), input('b.xlsx', bytes(ZIP)), input('c.pptx', bytes(ZIP)),
    input('d.doc', bytes(OLE)), input('e.xls', bytes(OLE)), input('f.ppt', bytes(OLE)),
  ];
  expect(await engines.validate(files, {})).toEqual([]);
});

test('validate rejects Office files with the wrong bytes as INVALID_DOCUMENT', async () => {
  await expect(engines.validate([input('x.docx', bytes(OLE))], {})).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  await expect(engines.validate([input('y.doc', new TextEncoder().encode('hello'))], {})).rejects.toMatchObject({
    code: 'INVALID_DOCUMENT',
  });
});

test('validate rejects unknown extensions instead of treating them as images', async () => {
  await expect(engines.validate([input('z.txt', new TextEncoder().encode('hi'))], {})).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  });
});

test('validate accepts RTF and HTML exports saved as .doc or .xls', async () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const files = [
    input('a.doc', enc(String.raw`{\rtf1\ansi hi}`)),
    input('b.xls', enc('\r\n<!DOCTYPE html><table></table>')),
    input('c.xls', enc('<?xml version="1.0"?><Workbook/>')),
    input('d.doc', Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('<html><body>x')])),
  ];
  expect(await engines.validate(files, {})).toEqual([]);
  await expect(engines.validate([input('e.ppt', enc(String.raw`{\rtf1`))], {})).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  await expect(engines.validate([input('f.docx', enc('<html>'))], {})).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
});
