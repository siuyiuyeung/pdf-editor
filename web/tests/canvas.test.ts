import { expect, test } from 'vitest';
import { alphaBounds } from '@/lib/canvas';

function rgba(width: number, height: number, opaque: [number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

test('alphaBounds is null for a fully transparent image', () => {
  expect(alphaBounds(rgba(8, 5, []), 8, 5)).toBeNull();
});

test('alphaBounds is the box around every non-transparent pixel', () => {
  expect(alphaBounds(rgba(8, 5, [[2, 1], [5, 3]]), 8, 5)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  expect(alphaBounds(rgba(8, 5, [[7, 4]]), 8, 5)).toEqual({ x: 7, y: 4, w: 1, h: 1 });
});
