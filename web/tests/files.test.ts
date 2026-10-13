import { expect, test } from 'vitest';
import { MAX_BYTES, extensionOf, formatSize, readInputs } from '@/lib/files';

const pdfFile = (name: string, size = 4) => new File([new Uint8Array(size)], name);

test('extensionOf', () => {
  expect(extensionOf('A.PDF')).toBe('.pdf');
  expect(extensionOf('archive.tar.gz')).toBe('.gz');
  expect(extensionOf('README')).toBe('');
});

test('reads accepted files into InputFile', async () => {
  const [f] = await readInputs([pdfFile('a.pdf', 3)], ['.pdf'], false);
  expect(f.name).toBe('a.pdf');
  expect(f.bytes).toBeInstanceOf(Uint8Array);
  expect(f.bytes.length).toBe(3);
});

test('rejects wrong extension as UNSUPPORTED_TYPE', async () => {
  await expect(readInputs([pdfFile('notes.txt')], ['.pdf'], true)).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  });
});

test('rejects multiple files for single-file tools', async () => {
  await expect(readInputs([pdfFile('a.pdf'), pdfFile('b.pdf')], ['.pdf'], false)).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  });
});

test('rejects files over 50 MB as TOO_LARGE', async () => {
  const big = { name: 'big.pdf', size: MAX_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) } as File;
  await expect(readInputs([big], ['.pdf'], false)).rejects.toMatchObject({ code: 'TOO_LARGE' });
});

test('empty selection returns empty array', async () => {
  expect(await readInputs([], ['.pdf'], true)).toEqual([]);
});

test('formatSize', () => {
  expect(formatSize(512)).toBe('512 B');
  expect(formatSize(2048)).toBe('2.0 KB');
  expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
});
