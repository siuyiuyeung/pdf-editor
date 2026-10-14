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

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png'];
const OLE_EXTS = ['.doc', '.xls', '.ppt'];
const ZIP_EXTS = ['.docx', '.xlsx', '.pptx'];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

/**
 * Checks every input at selection time: PDFs are parsed (ENCRYPTED / INVALID_FILE), images sniffed
 * (INVALID_IMAGE), Office files checked for their container format (INVALID_DOCUMENT). The server
 * re-validates Office uploads.
 */
const validate: Engine<Record<string, never>> = async (inputs) => {
  for (const f of inputs) {
    const ext = extensionOf(f.name);
    if (ext === '.pdf') await loadPdf(f);
    else if (IMAGE_EXTS.includes(ext)) {
      if (!readImageInfo(f.bytes)) throw new PdfToolError('INVALID_IMAGE', `${f.name} isn't a valid JPG or PNG image`);
    } else if (OLE_EXTS.includes(ext) || ZIP_EXTS.includes(ext)) {
      if (!startsWith(f.bytes, OLE_EXTS.includes(ext) ? OLE_MAGIC : ZIP_MAGIC)) {
        throw new PdfToolError('INVALID_DOCUMENT', `${f.name} isn't a valid Office document`);
      }
    } else {
      throw new PdfToolError('UNSUPPORTED_TYPE', `${f.name}: this file type isn't supported`);
    }
  }
  return [];
};

export const engines = { validate, merge, split, rotate, imageToPdf, watermark, annotate, crop };

export type EngineName = keyof typeof engines;
