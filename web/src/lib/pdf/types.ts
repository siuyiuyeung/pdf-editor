export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
  /** Extra information shown with the result (e.g. compression savings, server deletion notice). */
  note?: string;
}

export type Engine<O> = (inputs: InputFile[], opts: O) => Promise<OutputFile[]>;

export const PDF_MIME = 'application/pdf';
