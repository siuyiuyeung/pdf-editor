import { concatTransformationMatrix, popGraphicsState, pushGraphicsState, type PDFPage } from 'pdf-lib';

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

export type Matrix = [number, number, number, number, number, number];

export function normRotation(deg: number): 0 | 90 | 180 | 270 {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

/** Size of the page as a viewer shows it: the CropBox, swapped for 90/270 rotation. */
export function visualSize(box: Size, rotation: number): Size {
  const r = normRotation(rotation);
  return r === 90 || r === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

/**
 * Matrix from visual space (origin at the bottom-left of the page as displayed, y up, points)
 * to PDF user space, for a page with this CropBox and /Rotate.
 */
export function visualToUser(box: Box, rotation: number): Matrix {
  const { x, y, width: w, height: h } = box;
  switch (normRotation(rotation)) {
    case 0:
      return [1, 0, 0, 1, x, y];
    case 90:
      return [0, 1, -1, 0, x + w, y];
    case 180:
      return [-1, 0, 0, -1, x + w, y + h];
    case 270:
      return [0, -1, 1, 0, x, y + h];
  }
}

export function apply(m: Matrix, px: number, py: number): [number, number] {
  return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]];
}

/** Runs `draw` with the page's coordinate system switched to visual space. */
export function drawInVisualSpace(page: PDFPage, draw: (size: Size) => void): void {
  const box = page.getCropBox();
  const rotation = page.getRotation().angle;
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...visualToUser(box, rotation)));
  draw(visualSize(box, rotation));
  page.pushOperators(popGraphicsState());
}

/** Bottom-left origin for drawing a w×h box rotated `deg` (counter-clockwise) about its centre (cx, cy). */
export function rotatedOrigin(cx: number, cy: number, w: number, h: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return [cx - (w / 2) * cos + (h / 2) * sin, cy - (w / 2) * sin - (h / 2) * cos];
}

/** Axis-aligned size of a w×h box rotated by `deg`. */
export function rotatedBounds(w: number, h: number, deg: number): Size {
  const t = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  return { width: w * cos + h * sin, height: w * sin + h * cos };
}
