import { PDFDocument, degrees } from 'pdf-lib';
import type { InputFile } from '@/lib/pdf/types';

export async function makePdf(
  pages: number,
  opts: { rotate?: number; size?: [number, number] } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(opts.size ?? [200, 300]);
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
