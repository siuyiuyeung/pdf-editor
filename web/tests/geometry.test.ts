import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from 'vitest';
import {
  apply,
  drawInVisualSpace,
  normRotation,
  rotatedBounds,
  rotatedOrigin,
  visualSize,
  visualToUser,
  type Size,
} from '@/lib/pdf/geometry';
import { makePdf, pageText } from './helpers';

const box = { x: 10, y: 20, width: 200, height: 300 };

test('normRotation', () => {
  expect([0, 90, 180, 270, 360, -90, 450].map(normRotation)).toEqual([0, 90, 180, 270, 0, 270, 90]);
});

test('visualSize swaps width and height for 90 and 270', () => {
  expect(visualSize(box, 0)).toEqual({ width: 200, height: 300 });
  expect(visualSize(box, 90)).toEqual({ width: 300, height: 200 });
  expect(visualSize(box, 180)).toEqual({ width: 200, height: 300 });
  expect(visualSize(box, 270)).toEqual({ width: 300, height: 200 });
});

test('visualToUser maps the displayed bottom-left and top-left corners', () => {
  // [rotation, user point of visual (0,0), user point of the visual top-left corner]
  const cases: [number, [number, number], [number, number]][] = [
    [0, [10, 20], [10, 320]],
    [90, [210, 20], [10, 20]],
    [180, [210, 320], [210, 20]],
    [270, [10, 320], [210, 320]],
  ];
  for (const [r, bottomLeft, topLeft] of cases) {
    const m = visualToUser(box, r);
    expect(apply(m, 0, 0)).toEqual(bottomLeft);
    expect(apply(m, 0, visualSize(box, r).height)).toEqual(topLeft);
  }
});

async function drawMark(pdf: Uint8Array): Promise<{ seen: Size | undefined; at: { x: number; y: number } }> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPage(0);
  let seen: Size | undefined;
  drawInVisualSpace(page, (size) => {
    seen = size;
    page.drawText('MARK', { x: 10, y: 10, size: 12, font });
  });
  const [items] = await pageText(await doc.save());
  return { seen, at: items.find((t) => t.str === 'MARK')! };
}

test('drawInVisualSpace: visual (10,10) on a /Rotate 90 page lands at user (190,10)', async () => {
  const { seen, at } = await drawMark(await makePdf(1, { rotate: 90 }));
  expect(seen).toEqual({ width: 300, height: 200 });
  expect(at.x).toBeCloseTo(190);
  expect(at.y).toBeCloseTo(10);
});

test('drawInVisualSpace honours a CropBox that does not start at 0,0', async () => {
  const { seen, at } = await drawMark(await makePdf(1, { mediaBox: [50, 60, 200, 300] }));
  expect(seen).toEqual({ width: 200, height: 300 });
  expect(at.x).toBeCloseTo(60);
  expect(at.y).toBeCloseTo(70);
});

test('rotatedOrigin keeps a box centred on (cx, cy)', () => {
  const [x0, y0] = rotatedOrigin(100, 100, 40, 20, 0);
  expect(x0).toBeCloseTo(80);
  expect(y0).toBeCloseTo(90);
  const [x90, y90] = rotatedOrigin(100, 100, 40, 20, 90);
  expect(x90).toBeCloseTo(110);
  expect(y90).toBeCloseTo(80);
});

test('rotatedBounds', () => {
  const b = rotatedBounds(40, 20, 90);
  expect(b.width).toBeCloseTo(20);
  expect(b.height).toBeCloseTo(40);
  const d = rotatedBounds(10, 10, 45);
  expect(d.width).toBeCloseTo(Math.SQRT2 * 10);
});
