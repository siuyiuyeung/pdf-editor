import { MIN_CROP, type CropRect } from './pdf/crop';

export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const DEFAULT_CROP: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Applies a drag of (dx, dy) page fractions to `start`, keeping the box inside the page and at least MIN_CROP. */
export function moveCrop(start: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle === 'nw' || handle === 'sw') left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle === 'ne' || handle === 'se') right = clamp(right + dx, left + MIN_CROP, 1);
  if (handle === 'nw' || handle === 'ne') top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle === 'sw' || handle === 'se') bottom = clamp(bottom + dy, top + MIN_CROP, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}
