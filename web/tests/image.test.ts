import { expect, test } from 'vitest';
import { displaySize, orientationRotation, readImageInfo } from '@/lib/image';
import { makePng, tinyJpeg, withExifOrientation } from './helpers';

test('reads PNG type and size', () => {
  expect(readImageInfo(makePng(30, 20))).toEqual({ type: 'png', width: 30, height: 20, orientation: 1 });
});

test('reads JPEG type and size', () => {
  expect(readImageInfo(tinyJpeg())).toEqual({ type: 'jpg', width: 4, height: 2, orientation: 1 });
});

test('reads EXIF orientation in both byte orders', () => {
  expect(readImageInfo(withExifOrientation(tinyJpeg(), 6))).toMatchObject({ width: 4, height: 2, orientation: 6 });
  expect(readImageInfo(withExifOrientation(tinyJpeg(), 8, true))).toMatchObject({ orientation: 8 });
});

test('works on a view into a larger buffer', () => {
  const png = makePng(5, 7);
  const padded = new Uint8Array(png.length + 10);
  padded.set(png, 10);
  expect(readImageInfo(padded.subarray(10))).toMatchObject({ type: 'png', width: 5, height: 7 });
});

test('rejects non-images and truncated headers', () => {
  expect(readImageInfo(new TextEncoder().encode('hello, not an image'))).toBeNull();
  expect(readImageInfo(makePng(1, 1).slice(0, 10))).toBeNull();
  expect(readImageInfo(tinyJpeg().slice(0, 20))).toBeNull();
  expect(readImageInfo(new Uint8Array())).toBeNull();
});

test('orientationRotation and displaySize', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 8].map(orientationRotation)).toEqual([0, 0, 180, 180, 270, 90, 90, 270]);
  expect(displaySize({ type: 'jpg', width: 4, height: 2, orientation: 6 })).toEqual({ width: 2, height: 4 });
  expect(displaySize({ type: 'jpg', width: 4, height: 2, orientation: 3 })).toEqual({ width: 4, height: 2 });
});
