import { runServerJob, type JobPhase } from '../api/jobs';
import { runEngine } from './client';
import type { EngineName } from './engines';
import { PdfToolError, toToolError } from './errors';
import { openPdfjsRenderer } from './pdfjsRenderer';
import { pdfToImages, type PdfToImagesOptions } from './pdfToImages';
import type { InputFile, OutputFile } from './types';

/** Engines that need the DOM (a canvas) and therefore run on the main thread, not in the engine worker. */
export type MainThreadEngine = 'pdfToImages';

/** Engines that run on the server, keyed to the API's tool names (= tool slugs). */
export const SERVER_ENGINES = {
  compress: 'compress-pdf',
  wordToPdf: 'word-to-pdf',
  excelToPdf: 'excel-to-pdf',
  powerpointToPdf: 'powerpoint-to-pdf',
  pdfToWord: 'pdf-to-word',
} as const;
export type ServerEngine = keyof typeof SERVER_ENGINES;

export type ToolEngine = EngineName | MainThreadEngine | ServerEngine;

const PHASE_LABELS: Record<JobPhase, string> = {
  uploading: 'Uploading…',
  queued: 'Waiting for the converter…',
  running: 'Converting…',
  downloading: 'Downloading the result…',
};

const isServerEngine = (engine: ToolEngine): engine is ServerEngine =>
  Object.prototype.hasOwnProperty.call(SERVER_ENGINES, engine);

export async function runTool(
  engine: ToolEngine,
  inputs: InputFile[],
  opts: unknown,
  onStatus: (status: string) => void = () => {},
): Promise<OutputFile[]> {
  if (isServerEngine(engine)) {
    if (inputs.length !== 1) throw new PdfToolError('BAD_OPTIONS', 'Select exactly one file');
    try {
      return await runServerJob(SERVER_ENGINES[engine], inputs[0], (opts ?? {}) as object, (p) => onStatus(PHASE_LABELS[p]));
    } catch (e) {
      throw toToolError(e);
    }
  }
  if (engine === 'pdfToImages') {
    try {
      return await pdfToImages(inputs, opts as PdfToImagesOptions, openPdfjsRenderer);
    } catch (e) {
      throw toToolError(e);
    }
  }
  return runEngine(engine, inputs, opts);
}
