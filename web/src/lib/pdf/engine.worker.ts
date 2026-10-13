import { engines, type EngineName } from './engines';
import { toToolError } from './errors';
import type { Engine, InputFile } from './types';

interface Request {
  id: number;
  engine: EngineName;
  inputs: InputFile[];
  opts: unknown;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, engine, inputs, opts } = e.data;
  try {
    const run = engines[engine] as Engine<unknown>;
    const files = await run(inputs, opts);
    self.postMessage({ id, ok: true, files });
  } catch (err) {
    const t = toToolError(err);
    self.postMessage({ id, ok: false, error: { code: t.code, message: t.message } });
  }
};
