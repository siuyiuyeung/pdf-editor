import { runEngine } from './client';
import type { EngineName } from './engines';
import { toToolError } from './errors';
import { openPdfjsRenderer } from './pdfjsRenderer';
import { pdfToImages, type PdfToImagesOptions } from './pdfToImages';
import type { InputFile, OutputFile } from './types';

/** Engines that need the DOM (a canvas) and therefore run on the main thread, not in the engine worker. */
export type MainThreadEngine = 'pdfToImages';
export type ToolEngine = EngineName | MainThreadEngine;

export async function runTool(engine: ToolEngine, inputs: InputFile[], opts: unknown): Promise<OutputFile[]> {
  if (engine === 'pdfToImages') {
    try {
      return await pdfToImages(inputs, opts as PdfToImagesOptions, openPdfjsRenderer);
    } catch (e) {
      throw toToolError(e);
    }
  }
  return runEngine(engine, inputs, opts);
}
