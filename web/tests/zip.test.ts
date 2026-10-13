import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { zipFiles } from '@/lib/zip';

const out = (name: string, text: string) => ({
  name,
  bytes: new TextEncoder().encode(text),
  mime: 'application/pdf',
});

test('zips all files and keeps duplicate names distinct', async () => {
  const bytes = await zipFiles([out('a.pdf', '1'), out('a.pdf', '2'), out('b.pdf', '3')]);
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files).sort()).toEqual(['a (2).pdf', 'a.pdf', 'b.pdf']);
  expect(await zip.file('a (2).pdf')!.async('string')).toBe('2');
});
