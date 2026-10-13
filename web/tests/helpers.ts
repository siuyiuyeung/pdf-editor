import { PDFDocument, degrees } from 'pdf-lib';
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
