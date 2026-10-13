import { deflateSync } from 'node:zlib';
import { PDFDict, PDFDocument, PDFName, PDFStream, degrees } from 'pdf-lib';
import type { InputFile } from '@/lib/pdf/types';

export async function makePdf(
  pages: number,
  opts: { rotate?: number; size?: [number, number]; mediaBox?: [number, number, number, number] } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(opts.size ?? [200, 300]);
    if (opts.mediaBox) page.setMediaBox(...opts.mediaBox);
    page.drawText(`Page ${i + 1}`, { x: 20, y: 20, size: 12 });
    if (opts.rotate) page.setRotation(degrees(opts.rotate));
  }
  return doc.save();
}

/** A PDF whose trailer declares /Encrypt — pdf-lib refuses to load it by default. */
export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: 'Standard', V: 1, R: 2 }),
  );
  return doc.save({ useObjectStreams: false });
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

export async function rotations(bytes: Uint8Array): Promise<number[]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);
}

export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());
}

export function input(name: string, bytes: Uint8Array): InputFile {
  return { name, bytes };
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/** Non-blank text items per page, positioned in PDF user space (pdf.js text extraction). */
export async function pageText(bytes: Uint8Array): Promise<TextItem[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    const pages: TextItem[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { items } = await (await doc.getPage(i)).getTextContent();
      pages.push(
        items.flatMap((it) => ('str' in it && it.str.trim() ? [{ str: it.str, x: it.transform[4], y: it.transform[5] }] : [])),
      );
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function pngChunk(type: string, data: Uint8Array): number[] {
  const typed = [...[...type].map((ch) => ch.charCodeAt(0)), ...data];
  return [...u32(data.length), ...typed, ...u32(crc32(typed))];
}

/** A valid 8-bit RGB PNG of the given size. */
export function makePng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = 255;
      raw[o + 1] = (x * 40) & 255;
      raw[o + 2] = (y * 40) & 255;
    }
  }
  const ihdr = Uint8Array.from([...u32(width), ...u32(height), 8, 2, 0, 0, 0]);
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', deflateSync(raw)),
    ...pngChunk('IEND', new Uint8Array()),
  ]);
}

/** 4×2 baseline JPEG (left half red, right half blue), encoded by Chromium. */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAaEAEAAQUAAAAAAAAAAAAAAAAAAgQGNoOz/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwn/xAAcEQAABwEBAAAAAAAAAAAAAAAAAgMFBjazc3T/2gAMAwEAAhEDEQA/AIWvzK67XziAo1BKm0+ZDIoCZ2dz7raGH//Z';

/**
 * Fresh copy each call. Uint8Array.from matters: pdf-lib's JPEG parser ignores byteOffset,
 * so a pooled Buffer view fails with "SOI not found".
 */
export function tinyJpeg(): Uint8Array {
  return Uint8Array.from(Buffer.from(TINY_JPEG_BASE64, 'base64'));
}

/** Inserts an EXIF APP1 segment carrying only an Orientation tag right after the JPEG's SOI marker. */
export function withExifOrientation(jpeg: Uint8Array, orientation: number, littleEndian = false): Uint8Array {
  const tiff = littleEndian
    ? [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]
    : [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  return Uint8Array.from([...jpeg.slice(0, 2), 0xff, 0xe1, len >> 8, len & 255, ...payload, ...jpeg.slice(2)]);
}

/**
 * Number of distinct image XObjects referenced from each page's resources. pdf-lib registers a new
 * resource name on every drawImage call, so the same image drawn twice is counted once.
 */
export async function imageCounts(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) return 0;
    const images = xobjects.entries().filter(([, ref]) => {
      const obj = doc.context.lookup(ref);
      return obj instanceof PDFStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image');
    });
    return new Set(images.map(([, ref]) => ref.toString())).size;
  });
}
