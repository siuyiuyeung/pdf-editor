import { formatSize } from '../files';
import { PdfToolError, type ErrorCode } from '../pdf/errors';
import type { InputFile, OutputFile } from '../pdf/types';

/** Client for the server job API (spec §4): upload → poll every second → download → delete. */

export type JobPhase = 'uploading' | 'queued' | 'running' | 'downloading';

export interface JobDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: JobDeps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const POLL_MS = 1000;
/** Ten minutes of polling; the slowest converter times out after 2 minutes. */
const MAX_POLLS = 600;
/** Consecutive 5xx / network failures tolerated while polling (an API or Redis restart). */
const MAX_POLL_ERRORS = 5;

interface ServerError {
  code?: string;
  message?: string;
}

interface JobOutput {
  name: string;
  size: number;
  inputSize: number;
  note?: string;
}

interface StatusBody {
  status: 'queued' | 'running' | 'done' | 'failed';
  error?: ServerError;
  output?: JobOutput;
}

const SERVER_CODES: Record<string, ErrorCode> = {
  TOO_LARGE: 'TOO_LARGE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  BAD_OPTIONS: 'BAD_OPTIONS',
  RATE_LIMITED: 'RATE_LIMITED',
  BUSY: 'BUSY',
  TIMEOUT: 'TIMEOUT',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  ENCRYPTED: 'ENCRYPTED',
  NOT_FOUND: 'EXPIRED',
};

function toError(file: InputFile, err: ServerError | undefined, fallback: ErrorCode): PdfToolError {
  if (err?.code === 'INVALID_FILE') {
    return new PdfToolError(file.name.toLowerCase().endsWith('.pdf') ? 'INVALID_FILE' : 'INVALID_DOCUMENT', '');
  }
  return new PdfToolError((err?.code && SERVER_CODES[err.code]) || fallback, err?.message ?? '');
}

async function readError(res: Response): Promise<ServerError | undefined> {
  try {
    return ((await res.json()) as { error?: ServerError }).error;
  } catch {
    return undefined;
  }
}

function describe(tool: string, output: JobOutput | undefined): string {
  const parts: string[] = [];
  if (tool === 'compress-pdf' && output) {
    if (output.note) parts.push(output.note);
    else {
      const saved = Math.round((1 - output.size / output.inputSize) * 100);
      parts.push(`Reduced from ${formatSize(output.inputSize)} to ${formatSize(output.size)} (−${saved}%).`);
    }
  }
  parts.push('Your uploaded file has been deleted from our server.');
  return parts.join(' ');
}

async function send(deps: JobDeps, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await deps.fetch(url, init);
  } catch {
    throw new PdfToolError('NETWORK', '');
  }
}

export async function runServerJob(
  tool: string,
  file: InputFile,
  opts: object,
  onPhase: (phase: JobPhase) => void = () => {},
  deps: JobDeps = defaultDeps,
): Promise<OutputFile[]> {
  onPhase('uploading');
  const form = new FormData();
  form.append('tool', tool);
  form.append('opts', JSON.stringify(opts));
  form.append('file', new Blob([file.bytes as BlobPart]), file.name);
  const created = await send(deps, '/api/jobs', { method: 'POST', body: form });
  if (created.status !== 202) {
    throw toError(file, await readError(created), created.status === 413 ? 'TOO_LARGE' : 'UNKNOWN');
  }
  const { id } = (await created.json()) as { id: string };

  try {
    let output: JobOutput | undefined;
    let errors = 0;
    for (let poll = 0; ; poll++) {
      if (poll >= MAX_POLLS) throw new PdfToolError('TIMEOUT', '');
      let res: Response;
      try {
        res = await send(deps, `/api/jobs/${id}`);
      } catch (e) {
        if (++errors > MAX_POLL_ERRORS) throw e;
        await deps.sleep(POLL_MS);
        continue;
      }
      if (res.status === 404) throw new PdfToolError('EXPIRED', '');
      if (res.status >= 500 && ++errors <= MAX_POLL_ERRORS) {
        await deps.sleep(POLL_MS);
        continue;
      }
      if (!res.ok) throw new PdfToolError('UNKNOWN', `Server error (${res.status})`);
      errors = 0;
      const body = (await res.json()) as StatusBody;
      if (body.status === 'done') {
        output = body.output;
        break;
      }
      if (body.status === 'failed') throw toError(file, body.error, 'CONVERSION_FAILED');
      onPhase(body.status);
      await deps.sleep(POLL_MS);
    }

    onPhase('downloading');
    const res = await send(deps, `/api/jobs/${id}/file`);
    if (!res.ok) throw new PdfToolError(res.status === 404 ? 'EXPIRED' : 'UNKNOWN', '');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0];
    return [{ name: output?.name ?? 'converted', bytes, mime, note: describe(tool, output) }];
  } finally {
    // The result is in memory (or the job failed): remove the upload from the server right away.
    void deps.fetch(`/api/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}
