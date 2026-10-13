export interface ImageInfo {
  type: 'jpg' | 'png';
  /** Pixel size as stored, before EXIF orientation. */
  width: number;
  height: number;
  /** EXIF orientation 1-8 (1 = as stored). Always 1 for PNG. */
  orientation: number;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
// Start-of-frame markers that carry the image size (excludes DHT 0xC4, JPG 0xC8, DAC 0xCC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Reads type, size and EXIF orientation from the file headers only. Null for anything but JPEG/PNG. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { type: 'png', width, height, orientation: 1 } : null;
  }

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // markers without a length field
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan data before any frame header
    const length = view.getUint16(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    if (marker === 0xe1) orientation = exifOrientation(bytes, view, i + 4, length - 2) ?? orientation;
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const height = view.getUint16(i + 5);
      const width = view.getUint16(i + 7);
      return width > 0 && height > 0 ? { type: 'jpg', width, height, orientation } : null;
    }
    i += 2 + length;
  }
  return null;
}

function exifOrientation(bytes: Uint8Array, view: DataView, start: number, length: number): number | null {
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
  if (length < 14 || !exifHeader.every((b, k) => bytes[start + k] === b)) return null;
  const tiff = start + 6;
  const end = start + length;
  const little = bytes[tiff] === 0x49; // "II"
  if (!little && bytes[tiff] !== 0x4d) return null; // "MM"
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Clockwise rotation a viewer applies for an EXIF orientation. Mirroring (2, 4, 5, 7) is ignored. */
export function orientationRotation(orientation: number): 0 | 90 | 180 | 270 {
  if (orientation === 3 || orientation === 4) return 180;
  if (orientation === 6 || orientation === 7) return 90;
  if (orientation === 5 || orientation === 8) return 270;
  return 0;
}

/** Pixel size as displayed, after EXIF orientation. */
export function displaySize(info: ImageInfo): { width: number; height: number } {
  const r = orientationRotation(info.orientation);
  return r === 90 || r === 270 ? { width: info.height, height: info.width } : { width: info.width, height: info.height };
}
