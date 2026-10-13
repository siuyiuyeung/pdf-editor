import type { EngineName } from './engines';
import { PdfToolError, type ErrorCode } from './errors';
import type { InputFile, OutputFile } from './types';

type Reply =
  | { id: number; ok: true; files: OutputFile[] }
  | { id: number; ok: false; error: { code: ErrorCode; message: string } };

interface Pending {
  resolve: (files: OutputFile[]) => void;
  reject: (err: PdfToolError) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.files);
    else p.reject(new PdfToolError(e.data.error.code, e.data.error.message));
  };
  worker.onerror = () => {
    // Fires both when the worker crashes (often memory) and when its script fails to load
    // (e.g. a stale tab after a redeploy); the two are indistinguishable here.
    const err = new PdfToolError(
      'UNKNOWN',
      'Processing stopped unexpectedly. Reload the page and try again — very large files may not fit in browser memory.',
    );
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Inputs are structured-cloned (not transferred) so the UI keeps its copy for retries. */
export function runEngine(engine: EngineName, inputs: InputFile[], opts: unknown): Promise<OutputFile[]> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, engine, inputs, opts });
  });
}
