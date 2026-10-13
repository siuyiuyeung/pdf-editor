import { PDFDocument } from 'pdf-lib';
import { PdfToolError } from './errors';
import { baseName, loadPdf, single } from './load';
import { parseRanges } from './ranges';
import { PDF_MIME, type Engine, type OutputFile } from './types';

export type SplitOptions =
  | { mode: 'ranges'; ranges: string }
  | { mode: 'every'; n: number }
  | { mode: 'select'; pages: number[] };

function chunk(indices: number[], n: number): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < indices.length; i += n) groups.push(indices.slice(i, i + n));
  return groups;
}

export const split: Engine<SplitOptions> = async (inputs, opts) => {
  const file = single(inputs);
  const src = await loadPdf(file);
  const total = src.getPageCount();
  const base = baseName(file.name);

  let groups: number[][];
  switch (opts.mode) {
    case 'ranges':
      groups = parseRanges(opts.ranges, total);
      break;
    case 'every':
      if (!Number.isInteger(opts.n) || opts.n < 1) {
        throw new PdfToolError('BAD_OPTIONS', 'Pages per file must be a whole number of at least 1');
      }
      groups = chunk(src.getPageIndices(), opts.n);
      break;
    case 'select': {
      const pages = [...new Set(opts.pages)].sort((a, b) => a - b);
      if (pages.length === 0) throw new PdfToolError('BAD_OPTIONS', 'Select at least one page');
      if (pages.some((p) => p < 0 || p >= total)) {
        throw new PdfToolError('BAD_OPTIONS', `Selected pages must be within 1-${total}`);
      }
      groups = [pages];
      break;
    }
  }

  const out: OutputFile[] = [];
  for (const [i, group] of groups.entries()) {
    const doc = await PDFDocument.create();
    (await doc.copyPages(src, group)).forEach((p) => doc.addPage(p));
    const name = opts.mode === 'select' ? `${base}-extracted.pdf` : `${base}-part-${i + 1}.pdf`;
    out.push({ name, bytes: await doc.save(), mime: PDF_MIME });
  }
  return out;
};
