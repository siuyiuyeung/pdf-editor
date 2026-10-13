import { PdfToolError } from './pdf/errors';
import type { InputFile } from './pdf/types';

export const MAX_BYTES = 50 * 1024 * 1024;

export function extensionOf(name: string): string {
  const m = /\.[^.]+$/.exec(name.toLowerCase());
  return m ? m[0] : '';
}

export async function readInputs(files: File[], accept: string[], multiple: boolean): Promise<InputFile[]> {
  if (files.length === 0) return [];
  if (!multiple && files.length > 1) {
    throw new PdfToolError('UNSUPPORTED_TYPE', 'This tool takes one file at a time');
  }
  for (const f of files) {
    if (!accept.includes(extensionOf(f.name))) {
      throw new PdfToolError('UNSUPPORTED_TYPE', `${f.name}: expected ${accept.join(', ')}`);
    }
    if (f.size > MAX_BYTES) {
      throw new PdfToolError('TOO_LARGE', `${f.name} is larger than 50 MB`);
    }
  }
  return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
