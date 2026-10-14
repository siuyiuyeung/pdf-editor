import { extensionOf } from '../files';
import { readImageInfo } from '../image';
import { annotate } from './annotate';
import { crop } from './crop';
import { PdfToolError } from './errors';
import { imageToPdf } from './imageToPdf';
import { loadPdf } from './load';
import { merge } from './merge';
import { rotate } from './rotate';
import { split } from './split';
import { watermark } from './watermark';
import type { Engine } from './types';

/** Checks every input at selection time: PDFs are parsed (ENCRYPTED / INVALID_FILE), images are sniffed (INVALID_IMAGE). */
const validate: Engine<Record<string, never>> = async (inputs) => {
  for (const f of inputs) {
    if (extensionOf(f.name) === '.pdf') await loadPdf(f);
    else if (!readImageInfo(f.bytes)) throw new PdfToolError('INVALID_IMAGE', `${f.name} isn't a valid JPG or PNG image`);
  }
  return [];
};

export const engines = { validate, merge, split, rotate, imageToPdf, watermark, annotate, crop };

export type EngineName = keyof typeof engines;
