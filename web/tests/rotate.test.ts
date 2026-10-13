import { expect, test } from 'vitest';
import { rotate } from '@/lib/pdf/rotate';
import { input, makePdf, rotations } from './helpers';

test('applies per-page deltas', async () => {
  const f = input('scan.pdf', await makePdf(3));
  const [out] = await rotate([f], { rotations: [90, 0, 270] });
  expect(out.name).toBe('scan-rotated.pdf');
  expect(await rotations(out.bytes)).toEqual([90, 0, 270]);
});

test('adds to existing /Rotate and normalizes to 0-359', async () => {
  const f = input('a.pdf', await makePdf(3, { rotate: 90 }));
  const [out] = await rotate([f], { rotations: [270, -90, 180] });
  expect(await rotations(out.bytes)).toEqual([0, 0, 270]);
});

test('rejects wrong length and non-right-angle deltas', async () => {
  const f = input('a.pdf', await makePdf(2));
  await expect(rotate([f], { rotations: [90] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(rotate([f], { rotations: [45, 0] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});
