import { loadPdf } from './load';
import { merge } from './merge';
import { rotate } from './rotate';
import { split } from './split';
import type { Engine } from './types';

/** Parses every input; throws ENCRYPTED / INVALID_FILE. Used at file selection time. */
const validate: Engine<Record<string, never>> = async (inputs) => {
  for (const f of inputs) await loadPdf(f);
  return [];
};

export const engines = { validate, merge, split, rotate };

export type EngineName = keyof typeof engines;
