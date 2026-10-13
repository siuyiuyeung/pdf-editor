export type ErrorCode =
  | 'INVALID_FILE'
  | 'ENCRYPTED'
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'OUT_OF_MEMORY'
  | 'BAD_OPTIONS'
  | 'UNKNOWN';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_FILE: "This file isn't a valid PDF",
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
