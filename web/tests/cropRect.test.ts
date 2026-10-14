import { expect, test } from 'vitest';
import { DEFAULT_CROP, moveCrop } from '@/lib/cropRect';

const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
const close = (a: object, b: Record<string, number>) => {
  for (const [k, v] of Object.entries(b)) expect((a as Record<string, number>)[k]).toBeCloseTo(v);
};

test('move keeps the size and stays inside the page', () => {
  close(moveCrop(r, 'move', 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.5, h: 0.5 });
  close(moveCrop(r, 'move', 0.9, 0.9), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  close(moveCrop(r, 'move', -0.9, -0.9), { x: 0, y: 0, w: 0.5, h: 0.5 });
});

test('corner handles resize from the opposite corner', () => {
  close(moveCrop(r, 'nw', -0.1, -0.1), { x: 0.1, y: 0.1, w: 0.6, h: 0.6 });
  close(moveCrop(r, 'se', 0.1, 0.2), { x: 0.2, y: 0.2, w: 0.6, h: 0.7 });
  close(moveCrop(r, 'ne', 0.1, 0.1), { x: 0.2, y: 0.3, w: 0.6, h: 0.4 });
  close(moveCrop(r, 'sw', 0.1, 0.1), { x: 0.3, y: 0.2, w: 0.4, h: 0.6 });
});

test('resizing clamps to the page and to the minimum size', () => {
  close(moveCrop(r, 'se', 1, 1), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
  const tiny = moveCrop(r, 'nw', 1, 1);
  expect(tiny.w).toBeCloseTo(0.02);
  expect(tiny.x + tiny.w).toBeCloseTo(0.7);
});

test('default crop is an inset box', () => {
  expect(DEFAULT_CROP).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
});
