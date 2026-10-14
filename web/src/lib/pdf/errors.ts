export type ErrorCode =
  | 'INVALID_FILE'
  | 'INVALID_IMAGE'
  | 'INVALID_DOCUMENT'
  | 'RATE_LIMITED'
  | 'BUSY'
  | 'TIMEOUT'
  | 'CONVERSION_FAILED'
  | 'EXPIRED'
  | 'NETWORK'
  | 'ENCRYPTED'
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'OUT_OF_MEMORY'
  | 'BAD_OPTIONS'
  | 'UNKNOWN';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_FILE: "This file isn't a valid PDF",
  INVALID_IMAGE: "This file isn't a valid JPG or PNG image",
  INVALID_DOCUMENT: "This file isn't a valid Word, Excel or PowerPoint file",
  RATE_LIMITED: 'Too many files in a short time — please wait a few minutes',
  BUSY: 'Our converter is busy right now — please try again in a minute',
  TIMEOUT: 'This file took too long to convert',
  CONVERSION_FAILED: "We couldn't convert this file",
  EXPIRED: 'This job has expired — please upload the file again',
  NETWORK: "Couldn't reach the server — check your connection and try again",
  ENCRYPTED: 'Protected PDF — remove the password first',
  UNSUPPORTED_TYPE: "This file type isn't supported by this tool",
  TOO_LARGE: 'File is too large (max 50 MB)',
  OUT_OF_MEMORY: 'This file is too large to process in your browser',
  BAD_OPTIONS: 'Please check the options',
  UNKNOWN: 'Something went wrong',
};

export class PdfToolError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'PdfToolError';
    this.code = code;
  }
}

export function toToolError(err: unknown): PdfToolError {
  if (err instanceof PdfToolError) return err;
  if (err instanceof RangeError) return new PdfToolError('OUT_OF_MEMORY', err.message);
  return new PdfToolError('UNKNOWN', err instanceof Error ? err.message : String(err));
}
