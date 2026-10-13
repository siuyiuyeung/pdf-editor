import { expect, test } from 'vitest';
import { TOOLS, acceptLabel, getTool } from '@/tools';

test('registry has the 14 spec tools with unique slugs', () => {
  expect(TOOLS).toHaveLength(14);
  expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(14);
  expect(TOOLS.map((t) => t.slug).sort()).toEqual(
    [
      'compress-pdf', 'edit-pdf', 'excel-to-pdf', 'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png',
      'pdf-to-word', 'powerpoint-to-pdf', 'rotate-pdf', 'sign-pdf', 'split-pdf', 'watermark-pdf', 'word-to-pdf',
    ],
  );
});

test('server engine exactly for compress and office tools', () => {
  const server = TOOLS.filter((t) => t.engine === 'server').map((t) => t.slug).sort();
  expect(server).toEqual(['compress-pdf', 'excel-to-pdf', 'pdf-to-word', 'powerpoint-to-pdf', 'word-to-pdf']);
});

test('enabled tools', () => {
  expect(TOOLS.filter((t) => t.available).map((t) => t.slug).sort()).toEqual([
    'image-to-pdf', 'merge-pdf', 'rotate-pdf', 'split-pdf',
  ]);
});

test('accept lists are lowercase dotted extensions', () => {
  for (const t of TOOLS) for (const ext of t.accept) expect(ext).toMatch(/^\.[a-z]+$/);
});

test('getTool', () => {
  expect(getTool('merge-pdf')?.title).toBe('Merge PDF');
  expect(getTool('nope')).toBeUndefined();
});

test('acceptLabel', () => {
  expect(acceptLabel(getTool('merge-pdf')!)).toBe('PDF FILES');
  expect(acceptLabel(getTool('split-pdf')!)).toBe('PDF FILE');
  expect(acceptLabel(getTool('word-to-pdf')!)).toBe('WORD FILE');
  expect(acceptLabel(getTool('image-to-pdf')!)).toBe('IMAGES');
});
