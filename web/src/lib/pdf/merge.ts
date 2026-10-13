import { PDFDocument } from 'pdf-lib';
import { PdfToolError } from './errors';
import { loadPdf } from './load';
import { PDF_MIME, type Engine } from './types';

export type MergeOptions = Record<string, never>;

export const merge: Engine<MergeOptions> = async (inputs) => {
  if (inputs.length < 2) {
    throw new PdfToolError('BAD_OPTIONS', 'Select at least 2 PDFs to merge');
  }
  const out = await PDFDocument.create();
  for (const file of inputs) {
    const src = await loadPdf(file);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return [{ name: 'merged.pdf', bytes: await out.save(), mime: PDF_MIME }];
};
