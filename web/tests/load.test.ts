import { describe, expect, test } from 'vitest';
import { baseName, loadPdf, single } from '@/lib/pdf/load';
import { PdfToolError } from '@/lib/pdf/errors';
import { input, makeEncryptedPdf, makePdf } from './helpers';

describe('loadPdf', () => {
  test('loads a valid PDF', async () => {
    const doc = await loadPdf(input('a.pdf', await makePdf(3)));
    expect(doc.getPageCount()).toBe(3);
  });

  test('rejects non-PDF bytes as INVALID_FILE', async () => {
    const junk = new TextEncoder().encode('hello, not a pdf');
    await expect(loadPdf(input('junk.pdf', junk))).rejects.toMatchObject({
      code: 'INVALID_FILE',
    });
  });

  test('rejects encrypted PDFs as ENCRYPTED', async () => {
    const err = await loadPdf(input('locked.pdf', await makeEncryptedPdf())).catch((e) => e);
    expect(err).toBeInstanceOf(PdfToolError);
    expect(err.code).toBe('ENCRYPTED');
  });

  test('ENCRYPTED detail also covers permission-only (owner password) PDFs', async () => {
    const err = await loadPdf(input('locked.pdf', await makeEncryptedPdf())).catch((e) => e);
    expect(err.message).toBe('locked.pdf is password-protected or has security restrictions');
  });
});

describe('single', () => {
  test('returns the only input', () => {
    const f = input('a.pdf', new Uint8Array());
    expect(single([f])).toBe(f);
  });

  test('throws BAD_OPTIONS for zero or many inputs', () => {
    expect(() => single([])).toThrow(PdfToolError);
    const f = input('a.pdf', new Uint8Array());
    expect(() => single([f, f])).toThrow(/exactly one/);
  });
});

describe('baseName', () => {
  test.each([
    ['report.pdf', 'report'],
    ['my.file.v2.PDF', 'my.file.v2'],
    ['noext', 'noext'],
    ['.pdf', 'document'],
  ])('%s -> %s', (name, expected) => {
    expect(baseName(name)).toBe(expected);
  });
});
