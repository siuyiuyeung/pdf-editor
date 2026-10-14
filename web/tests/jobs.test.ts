import { expect, test } from 'vitest';
import { runServerJob, type JobDeps } from '@/lib/api/jobs';

type Call = { url: string; method: string; body?: BodyInit | null };

function fakeFetch(script: Record<string, Response[]>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    const res = script[`${method} ${url}`]?.shift();
    if (!res) throw new Error(`unexpected ${method} ${url}`);
    return res;
  }) as typeof globalThis.fetch;
  const deps: JobDeps = { fetch, sleep: async () => {} };
  return { deps, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deleted = () => new Response(null, { status: 204 });
const pdf = { name: 'report.pdf', bytes: new Uint8Array([37, 80, 68, 70]) };
const docx = { name: 'memo.docx', bytes: new Uint8Array([80, 75, 3, 4]) };

test('uploads, polls until done, downloads, then deletes the job', async () => {
  const { deps, calls } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': [
      json({ status: 'queued' }),
      json({ status: 'running' }),
      json({ status: 'done', output: { name: 'report-compressed.pdf', size: 3, inputSize: 12 } }),
    ],
    'GET /api/jobs/abc/file': [new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/pdf' } })],
    'DELETE /api/jobs/abc': [deleted()],
  });
  const phases: string[] = [];
  const [out] = await runServerJob('compress-pdf', pdf, { level: 'high' }, (p) => phases.push(p), deps);

  expect(out).toMatchObject({ name: 'report-compressed.pdf', mime: 'application/pdf' });
  expect([...out.bytes]).toEqual([1, 2, 3]);
  expect(out.note).toContain('Reduced from 12 B to 3 B (−75%).');
  expect(out.note).toContain('Your uploaded file has been deleted from our server.');
  expect(phases).toEqual(['uploading', 'queued', 'running', 'downloading']);

  const form = calls[0].body as FormData;
  expect(form.get('tool')).toBe('compress-pdf');
  expect(form.get('opts')).toBe('{"level":"high"}');
  expect((form.get('file') as File).name).toBe('report.pdf');
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/api/jobs/abc' });
});

test('the server notice replaces the savings line when compression did not help', async () => {
  const note = 'This PDF is already well compressed, so your original file is returned unchanged.';
  const { deps } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': [json({ status: 'done', output: { name: 'r-compressed.pdf', size: 12, inputSize: 12, note } })],
    'GET /api/jobs/abc/file': [new Response(new Uint8Array([1]), { headers: { 'content-type': 'application/pdf' } })],
    'DELETE /api/jobs/abc': [deleted()],
  });
  const [out] = await runServerJob('compress-pdf', pdf, {}, undefined, deps);
  expect(out.note).toMatch(/^This PDF is already well compressed/);
  expect(out.note).not.toContain('Reduced from');
});

test('upload errors map to client codes', async () => {
  const cases: [Response, string][] = [
    [json({ error: { code: 'RATE_LIMITED', message: 'slow down' } }, 429), 'RATE_LIMITED'],
    [json({ error: { code: 'BUSY', message: 'busy' } }, 503), 'BUSY'],
    [new Response('<html>Request Entity Too Large</html>', { status: 413 }), 'TOO_LARGE'],
    [json({ error: { code: 'INVALID_FILE', message: 'bad' } }, 400), 'INVALID_FILE'],
  ];
  for (const [res, code] of cases) {
    const { deps } = fakeFetch({ 'POST /api/jobs': [res] });
    await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code });
  }
});

test('INVALID_FILE for an Office upload is shown as INVALID_DOCUMENT', async () => {
  const { deps } = fakeFetch({ 'POST /api/jobs': [json({ error: { code: 'INVALID_FILE', message: 'bad' } }, 400)] });
  await expect(runServerJob('word-to-pdf', docx, {}, undefined, deps)).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
});

test('a failed job surfaces the worker error and is still deleted', async () => {
  const { deps, calls } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': [json({ status: 'failed', error: { code: 'ENCRYPTED', message: 'Protected' } })],
    'DELETE /api/jobs/abc': [deleted()],
  });
  await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code: 'ENCRYPTED' });
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
});

test('a job that disappears while polling is EXPIRED', async () => {
  const { deps } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': [json({ error: { code: 'NOT_FOUND', message: 'gone' } }, 404)],
    'DELETE /api/jobs/abc': [new Response(null, { status: 404 })],
  });
  await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code: 'EXPIRED' });
});

test('a network failure is NETWORK', async () => {
  const deps: JobDeps = {
    fetch: (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch,
    sleep: async () => {},
  };
  await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code: 'NETWORK' });
});

test('transient server errors while polling are retried', async () => {
  const { deps } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': [
      new Response('upstream down', { status: 500 }),
      new Response('bad gateway', { status: 502 }),
      json({ status: 'done', output: { name: 'r.pdf', size: 3, inputSize: 12 } }),
    ],
    'GET /api/jobs/abc/file': [new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/pdf' } })],
    'DELETE /api/jobs/abc': [deleted()],
  });
  const [out] = await runServerJob('compress-pdf', pdf, {}, undefined, deps);
  expect([...out.bytes]).toEqual([1, 2, 3]);
});

test('a server that keeps failing while polling gives up', async () => {
  const { deps } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': Array.from({ length: 6 }, () => new Response('down', { status: 503 })),
    'DELETE /api/jobs/abc': [deleted()],
  });
  await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code: 'UNKNOWN' });
});

test('a job still waiting in the queue when polling gives up is BUSY, not TIMEOUT', async () => {
  const { deps } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': Array.from({ length: 600 }, () => json({ status: 'queued' })),
    'DELETE /api/jobs/abc': [deleted()],
  });
  await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code: 'BUSY' });
});

test('a job that started converting but never finished is TIMEOUT', async () => {
  const { deps } = fakeFetch({
    'POST /api/jobs': [json({ id: 'abc' }, 202)],
    'GET /api/jobs/abc': Array.from({ length: 600 }, () => json({ status: 'running' })),
    'DELETE /api/jobs/abc': [deleted()],
  });
  await expect(runServerJob('compress-pdf', pdf, {}, undefined, deps)).rejects.toMatchObject({ code: 'TIMEOUT' });
});
