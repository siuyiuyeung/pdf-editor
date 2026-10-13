import { PDFDocument } from 'pdf-lib';
import { PdfToolError } from './errors';
import type { InputFile } from './types';

// pdf-lib ships ES5 output, so its EncryptedPDFError loses its prototype and
// `instanceof` fails; match its message instead.
const isEncryptedError = (e: unknown) => e instanceof Error && /is encrypted/.test(e.message);

export async function loadPdf(file: InputFile): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(file.bytes, { updateMetadata: false });
  } catch (e) {
    if (isEncryptedError(e)) {
      throw new PdfToolError('ENCRYPTED', `${file.name} is password-protected`);
    }
    throw new PdfToolError('INVALID_FILE', `${file.name} isn't a valid PDF`);
  }
}

export function single(inputs: InputFile[]): InputFile {
  if (inputs.length !== 1) {
    throw new PdfToolError('BAD_OPTIONS', 'Select exactly one PDF');
  }
  return inputs[0];
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]*$/, '') || 'document';
}
