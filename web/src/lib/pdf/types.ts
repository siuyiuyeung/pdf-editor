export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export type Engine<O> = (inputs: InputFile[], opts: O) => Promise<OutputFile[]>;

export const PDF_MIME = 'application/pdf';
