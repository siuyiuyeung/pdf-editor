# Plan 1 — Foundation + Organize Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working public PDF-tools site (Docker, port 3000) with a home page, the full 14-tool grid, the shared tool shell, and three fully working browser-only tools: Merge, Split, Rotate.

**Architecture:** Next.js 15 App Router frontend. Tools are defined in a single registry (`src/tools.ts`), and one dynamic route (`/[tool]`) renders every tool. Processing runs in pure engine functions (pdf-lib) executed inside a Web Worker via a small RPC client; thumbnails are rendered with pdf.js. No file bytes ever leave the browser in this plan.

**Tech Stack:** Node 22, Next.js 15, React 19, TypeScript (strict), Tailwind CSS v4, pdf-lib 1.17.1, pdfjs-dist 4.10.38, jszip 3.10.1, lucide-react 0.468.0, Vitest 3.2.4, Playwright 1.55.0, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-13-pdf-editor-design.md`

### Plan series

| Plan | Scope | Status |
|---|---|---|
| **1 (this)** | Scaffold, site chrome, tool shell, worker RPC, Merge, Split, Rotate, Docker `web` service | to execute |
| 2 | PDF→JPG, PDF→PNG, JPG/PNG→PDF, Watermark, Sign, Edit (client) | written after Plan 1 lands |
| 3 | FastAPI + Redis/RQ worker + sweeper, Compress, Word/Excel/PPT→PDF, PDF→Word, `/api` rewrite | written after Plan 2 lands |

### Deliberate refinements of the spec (apply everywhere)

- **Engine signature** is `(inputs: InputFile[], opts) => Promise<OutputFile[]>`. It differs from the spec's `(Uint8Array[], opts) => Uint8Array | NamedBlob[]`, for two reasons:
  - engines need input file names to name their outputs;
  - one return type keeps ResultPanel simple.
- **Workspace components** are mapped by slug in `src/components/workspaces/index.ts`, not stored in `tools.ts`. This keeps the registry free of React, so server components and unit tests can import it.
- **Client error codes** add `BAD_OPTIONS`. It is used for invalid split ranges and similar input mistakes, and is already a server code in the spec.
- **Site name** is a single constant, `SITE_NAME = 'PDF Tools'` in `src/site.ts`. Do not use the reference site's brand.

## Global Constraints

- All web code lives in `web/`. Commands below run from the repo root `C:\Users\IGS\VsCodeProjects\pdf-editor` unless they start with `cd web`.
- Max input size is 50 MB per file (`MAX_BYTES = 50 * 1024 * 1024`).
- Client-tool file bytes are never sent over the network. There is no `fetch`/`XMLHttpRequest` anywhere in `web/src/lib/pdf/`.
- Tool slugs are exactly `merge-pdf`, `split-pdf`, `rotate-pdf`, `compress-pdf`, `edit-pdf`, `watermark-pdf`, `sign-pdf`, `pdf-to-jpg`, `pdf-to-png`, `image-to-pdf`, `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf`, `pdf-to-word`.
- User-facing error copy is taken verbatim from `ERROR_MESSAGES` in Task 2. Two strings are mandated by the spec:
  - `INVALID_FILE`: "This file isn't a valid PDF"
  - `ENCRYPTED`: "Protected PDF — remove the password first"
- Every engine throws `PdfToolError(code, message)` and never a bare `Error`.
- Brand red is `#e5322d` and the page background is `#f2f2f2`. The dropzone has a dashed red border and a red "SELECT … FILE" button.
- E2E runs on chromium, firefox, and webkit, because the spec success criteria require cross-browser support.

## Review Focus

1. **Encrypted PDF** selected for any PDF tool → error card "Protected PDF — remove the password first" at selection time. The app must not crash or show a blank workspace. Pinned by: Task 2 unit test, Task 8 e2e.
2. **Non-PDF bytes renamed to `.pdf`** → "This file isn't a valid PDF" at selection time. Pinned by: Task 2 unit test, Task 8 e2e.
3. **Messy split ranges** (spaces, `0`, reversed `5-3`, beyond the page count, garbage) → `BAD_OPTIONS` with a message naming the bad part. Inputs and the typed ranges stay intact. Pinned by: Task 4 unit tests, Task 10 e2e.
4. **pdf.js detaches the ArrayBuffer it is given.** Rendering thumbnails and then running the engine on the same bytes must still work, and so must handing output to another tool. Pinned by: the Task 11 e2e (thumbnails → rotate → download) and the Task 10 e2e (merge → "Use in another tool" → split thumbnails).
5. **Duplicate file names** (the same file added twice to Merge, or ZIP entries with the same name) → no silent overwrite or React key collision. Pinned by: Task 6 `zipFiles` unit test, Task 9 e2e that adds the same file twice.

---

## File Structure

```
pdf-editor/
  docker-compose.yml                         Task 12
  Makefile                                   Task 12
  web/
    Dockerfile, .dockerignore                Task 12
    next.config.ts                           Task 1  (standalone output, canvas alias)
    vitest.config.ts                         Task 1
    playwright.config.ts                     Task 7
    src/
      site.ts                                Task 7  SITE_NAME
      tools.ts                               Task 6b registry (ToolDef, TOOLS, getTool, acceptLabel)
      app/
        globals.css, layout.tsx, page.tsx    Task 7
        [tool]/page.tsx                      Task 8
      components/
        TopBar.tsx, Footer.tsx               Task 7
        ToolIcon.tsx, ToolsGrid.tsx          Task 7
        HowToUse.tsx, Dropzone.tsx           Task 7
        ErrorCard.tsx, HomeClient.tsx        Task 7
        ToolShell.tsx, ResultPanel.tsx       Task 8
        PageGrid.tsx                         Task 10
        workspaces/index.ts                  Task 8 (empty map), extended in 9/10/11
        workspaces/MergeWorkspace.tsx        Task 9
        workspaces/SplitWorkspace.tsx        Task 10
        workspaces/RotateWorkspace.tsx       Task 11
      lib/
        files.ts                             Task 6  readInputs, extensionOf, formatSize, MAX_BYTES
        zip.ts                               Task 6  zipFiles
        download.ts                          Task 8  downloadBytes (browser only)
        handoff.ts                           Task 7  in-memory file handoff between pages
        pdf/types.ts                         Task 2
        pdf/errors.ts                        Task 2
        pdf/load.ts                          Task 2  loadPdf, single, baseName
        pdf/merge.ts                         Task 3
        pdf/ranges.ts, pdf/split.ts          Task 4
        pdf/rotate.ts                        Task 5
        pdf/engines.ts                       Task 8  engine registry + validate
        pdf/engine.worker.ts, pdf/client.ts  Task 8  worker RPC
        pdf/render.ts, pdf/usePageThumbs.ts  Task 10 pdf.js thumbnails
    tests/                                   Vitest unit tests + helpers.ts
    e2e/                                     Playwright specs
```

---

### Task 1: Scaffold the Next.js app and test tooling

**Files:**
- Create: `web/` (via create-next-app), `web/vitest.config.ts`, `web/tests/smoke.test.ts`
- Modify: `web/next.config.ts`, `web/package.json` (scripts)

**Interfaces:**
- Consumes: nothing
- Produces: a `web/` Next.js app with the `@/*` → `src/*` alias, plus the `npm test` (Vitest) and `npm run test:e2e` (Playwright) scripts.

- [ ] **Step 1: Generate the app**

Run (Git Bash):
```bash
cd /c/Users/IGS/VsCodeProjects/pdf-editor
npx create-next-app@15 web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
```
Expected: `web/` is created, containing `src/app/page.tsx` and `package.json` with `next` 15.x. Because the folder sits inside an existing git repo, create-next-app skips `git init`.

- [ ] **Step 2: Install pinned dependencies**

```bash
cd web
npm i pdf-lib@1.17.1 pdfjs-dist@4.10.38 jszip@3.10.1 lucide-react@0.468.0
npm i -D vitest@3.2.4 @playwright/test@1.55.0
npx playwright install chromium firefox webkit
```
Expected: the install completes with no peer-dependency errors.

- [ ] **Step 3: Configure Next.js**

Replace `web/next.config.ts` with:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack: (config) => {
    // pdfjs-dist references the optional Node "canvas" package; never bundle it.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 4: Configure Vitest**

Create `web/vitest.config.ts`:
```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

In `web/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:e2e": "playwright test"
```

- [ ] **Step 5: Write a smoke test**

Create `web/tests/smoke.test.ts`:
```ts
import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';

test('pdf-lib works under vitest', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
```

- [ ] **Step 6: Run the tests and the build**

```bash
cd web && npm test && npm run build
```
Expected: 1 test passes, and `next build` succeeds.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/IGS/VsCodeProjects/pdf-editor
git add web
git commit -m "chore(web): scaffold Next.js app with vitest and playwright"
```

---

### Task 2: Core PDF types, errors, and loader

**Files:**
- Create: `web/src/lib/pdf/types.ts`, `web/src/lib/pdf/errors.ts`, `web/src/lib/pdf/load.ts`, `web/tests/helpers.ts`
- Test: `web/tests/load.test.ts`, `web/tests/errors.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface InputFile { name: string; bytes: Uint8Array }`
  - `interface OutputFile { name: string; bytes: Uint8Array; mime: string }`
  - `type Engine<O> = (inputs: InputFile[], opts: O) => Promise<OutputFile[]>`
  - `const PDF_MIME = 'application/pdf'`
  - `type ErrorCode = 'INVALID_FILE' | 'ENCRYPTED' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'OUT_OF_MEMORY' | 'BAD_OPTIONS' | 'UNKNOWN'`
  - `class PdfToolError extends Error { readonly code: ErrorCode }`
  - `function toToolError(err: unknown): PdfToolError`
  - `const ERROR_MESSAGES: Record<ErrorCode, string>`
  - `function loadPdf(file: InputFile): Promise<PDFDocument>`
  - `function single(inputs: InputFile[]): InputFile`
  - `function baseName(name: string): string`
  - Test helpers: `makePdf(pages, opts?)`, `makeEncryptedPdf()`, `pageCount(bytes)`, `rotations(bytes)`, `pageWidths(bytes)`, `input(name, bytes)`

- [ ] **Step 1: Write the test helpers**

Create `web/tests/helpers.ts`:
```ts
import { PDFDocument, degrees } from 'pdf-lib';
import type { InputFile } from '@/lib/pdf/types';

export async function makePdf(
  pages: number,
  opts: { rotate?: number; size?: [number, number] } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(opts.size ?? [200, 300]);
    page.drawText(`Page ${i + 1}`, { x: 20, y: 20, size: 12 });
    if (opts.rotate) page.setRotation(degrees(opts.rotate));
  }
  return doc.save();
}

/** A PDF whose trailer declares /Encrypt — pdf-lib refuses to load it by default. */
export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: 'Standard', V: 1, R: 2 }),
  );
  return doc.save({ useObjectStreams: false });
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

export async function rotations(bytes: Uint8Array): Promise<number[]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);
}

export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());
}

export function input(name: string, bytes: Uint8Array): InputFile {
  return { name, bytes };
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/tests/load.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { baseName, loadPdf, single } from '@/lib/pdf/load';
import { PdfToolError } from '@/lib/pdf/errors';
import { input, makeEncryptedPdf, makePdf } from './helpers';

describe('loadPdf', () => {
  test('loads a valid PDF', async () => {
    const doc = await loadPdf(input('a.pdf', await makePdf(3)));
    expect(doc.getPageCount()).toBe(3);
  });

  test('rejects non-PDF bytes as INVALID_FILE', async () => {
    const junk = new TextEncoder().encode('hello, not a pdf');
    await expect(loadPdf(input('junk.pdf', junk))).rejects.toMatchObject({
      code: 'INVALID_FILE',
    });
  });

  test('rejects encrypted PDFs as ENCRYPTED', async () => {
    const err = await loadPdf(input('locked.pdf', await makeEncryptedPdf())).catch((e) => e);
    expect(err).toBeInstanceOf(PdfToolError);
    expect(err.code).toBe('ENCRYPTED');
  });
});

describe('single', () => {
  test('returns the only input', () => {
    const f = input('a.pdf', new Uint8Array());
    expect(single([f])).toBe(f);
  });

  test('throws BAD_OPTIONS for zero or many inputs', () => {
    expect(() => single([])).toThrow(PdfToolError);
    const f = input('a.pdf', new Uint8Array());
    expect(() => single([f, f])).toThrow(/exactly one/);
  });
});

describe('baseName', () => {
  test.each([
    ['report.pdf', 'report'],
    ['my.file.v2.PDF', 'my.file.v2'],
    ['noext', 'noext'],
    ['.pdf', 'document'],
  ])('%s -> %s', (name, expected) => {
    expect(baseName(name)).toBe(expected);
  });
});
```

Create `web/tests/errors.test.ts`:
```ts
import { expect, test } from 'vitest';
import { ERROR_MESSAGES, PdfToolError, toToolError } from '@/lib/pdf/errors';

test('toToolError passes PdfToolError through', () => {
  const e = new PdfToolError('BAD_OPTIONS', 'nope');
  expect(toToolError(e)).toBe(e);
});

test('toToolError maps RangeError (allocation failure) to OUT_OF_MEMORY', () => {
  expect(toToolError(new RangeError('Array buffer allocation failed')).code).toBe('OUT_OF_MEMORY');
});

test('toToolError maps anything else to UNKNOWN', () => {
  expect(toToolError(new Error('boom')).code).toBe('UNKNOWN');
  expect(toToolError('weird').code).toBe('UNKNOWN');
});

test('spec-mandated copy', () => {
  expect(ERROR_MESSAGES.INVALID_FILE).toBe("This file isn't a valid PDF");
  expect(ERROR_MESSAGES.ENCRYPTED).toBe('Protected PDF — remove the password first');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/load.test.ts tests/errors.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/pdf/load"".

- [ ] **Step 4: Implement**

Create `web/src/lib/pdf/types.ts`:
```ts
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
```

Create `web/src/lib/pdf/errors.ts`:
```ts
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
```

Create `web/src/lib/pdf/load.ts`:
```ts
import { EncryptedPDFError, PDFDocument } from 'pdf-lib';
import { PdfToolError } from './errors';
import type { InputFile } from './types';

export async function loadPdf(file: InputFile): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(file.bytes, { updateMetadata: false });
  } catch (e) {
    if (e instanceof EncryptedPDFError) {
      throw new PdfToolError('ENCRYPTED', `${file.name} is password-protected`);
    }
    throw new PdfToolError('INVALID_FILE', `${file.name} isn't a valid PDF`);
  }
}

export function single(inputs: InputFile[]): InputFile {
  if (inputs.length !== 1) {
    throw new PdfToolError('BAD_OPTIONS', 'Select exactly one PDF');
  }
  return inputs[0];
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]*$/, '') || 'document';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/load.test.ts tests/errors.test.ts`
Expected: all tests PASS.

If the `ENCRYPTED` test fails, the cause is that `save()` did not write `/Encrypt`. Check with `new TextDecoder().decode(await makeEncryptedPdf()).includes('/Encrypt')`. If that is false, build the fixture by string-patching the trailer instead: after `save()`, insert `/Encrypt <</Filter /Standard /V 1 /R 2>>` immediately after the `trailer\n<<` token.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/pdf web/tests
git commit -m "feat(web): add PDF types, typed errors, and loader"
```

---

### Task 3: Merge engine

**Files:**
- Create: `web/src/lib/pdf/merge.ts`
- Test: `web/tests/merge.test.ts`

**Interfaces:**
- Consumes: `Engine`, `OutputFile`, `PDF_MIME` (types.ts); `loadPdf` (load.ts); `PdfToolError` (errors.ts)
- Produces: `type MergeOptions = Record<string, never>`; `const merge: Engine<MergeOptions>`. The output is one file named `merged.pdf`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/merge.test.ts`:
```ts
import { expect, test } from 'vitest';
import { merge } from '@/lib/pdf/merge';
import { input, makeEncryptedPdf, makePdf, pageCount, pageWidths } from './helpers';

test('merges pages in input order', async () => {
  const a = input('a.pdf', await makePdf(2, { size: [200, 300] }));
  const b = input('b.pdf', await makePdf(3, { size: [400, 500] }));
  const [out] = await merge([b, a], {});
  expect(out.name).toBe('merged.pdf');
  expect(out.mime).toBe('application/pdf');
  expect(await pageCount(out.bytes)).toBe(5);
  expect(await pageWidths(out.bytes)).toEqual([400, 400, 400, 200, 200]);
});

test('allows the same file twice', async () => {
  const a = input('a.pdf', await makePdf(2));
  const [out] = await merge([a, a], {});
  expect(await pageCount(out.bytes)).toBe(4);
});

test('needs at least two files', async () => {
  const a = input('a.pdf', await makePdf(1));
  await expect(merge([a], {})).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('propagates ENCRYPTED from any input', async () => {
  const a = input('a.pdf', await makePdf(1));
  const locked = input('locked.pdf', await makeEncryptedPdf());
  await expect(merge([a, locked], {})).rejects.toMatchObject({ code: 'ENCRYPTED' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/merge.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/pdf/merge"".

- [ ] **Step 3: Implement**

Create `web/src/lib/pdf/merge.ts`:
```ts
import { PDFDocument } from 'pdf-lib';
import { PdfToolError } from './errors';
import { loadPdf } from './load';
import { PDF_MIME, type Engine } from './types';

export type MergeOptions = Record<string, never>;

export const merge: Engine<MergeOptions> = async (inputs) => {
  if (inputs.length < 2) {
    throw new PdfToolError('BAD_OPTIONS', 'Select at least 2 PDFs to merge');
  }
  const out = await PDFDocument.create();
  for (const file of inputs) {
    const src = await loadPdf(file);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return [{ name: 'merged.pdf', bytes: await out.save(), mime: PDF_MIME }];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run tests/merge.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/pdf/merge.ts web/tests/merge.test.ts
git commit -m "feat(web): add merge engine"
```

---

### Task 4: Range parser and split engine

**Files:**
- Create: `web/src/lib/pdf/ranges.ts`, `web/src/lib/pdf/split.ts`
- Test: `web/tests/ranges.test.ts`, `web/tests/split.test.ts`

**Interfaces:**
- Consumes: `loadPdf`, `single`, `baseName` (load.ts); `PdfToolError`; `Engine`, `OutputFile`, `PDF_MIME`
- Produces:
  - `function parseRanges(spec: string, pageCount: number): number[][]`. It returns 0-based page indices, one array per range.
  - `type SplitOptions = { mode: 'ranges'; ranges: string } | { mode: 'every'; n: number } | { mode: 'select'; pages: number[] }`. `pages` holds 0-based indices.
  - `const split: Engine<SplitOptions>`. Output names are `<base>-part-<k>.pdf`, or `<base>-extracted.pdf` in select mode.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/ranges.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { parseRanges } from '@/lib/pdf/ranges';

describe('parseRanges', () => {
  test('parses single pages and ranges into 0-based groups', () => {
    expect(parseRanges('1-3,5', 5)).toEqual([[0, 1, 2], [4]]);
  });

  test('tolerates whitespace and trailing commas', () => {
    expect(parseRanges(' 2 - 3 , 1 ,', 4)).toEqual([[1, 2], [0]]);
  });

  test.each([
    ['', /at least one/],
    ['   ', /at least one/],
    ['0', /"0" is outside 1-5/],
    ['6', /"6" is outside 1-5/],
    ['2-9', /"2-9" is outside 1-5/],
    ['5-3', /"5-3" ends before it starts/],
    ['a-b', /"a-b" isn't a valid range/],
    ['1-2-3', /"1-2-3" isn't a valid range/],
  ])('rejects %j', (spec, message) => {
    expect(() => parseRanges(spec, 5)).toThrow(message);
    try {
      parseRanges(spec, 5);
    } catch (e) {
      expect((e as { code: string }).code).toBe('BAD_OPTIONS');
    }
  });
});
```

Create `web/tests/split.test.ts`:
```ts
import { expect, test } from 'vitest';
import { split } from '@/lib/pdf/split';
import { input, makePdf, pageCount, pageWidths } from './helpers';

async function fivePages() {
  return input('doc.pdf', await makePdf(5));
}

test('ranges mode: one file per range', async () => {
  const out = await split([await fivePages()], { mode: 'ranges', ranges: '1-2,4' });
  expect(out.map((f) => f.name)).toEqual(['doc-part-1.pdf', 'doc-part-2.pdf']);
  expect(await pageCount(out[0].bytes)).toBe(2);
  expect(await pageCount(out[1].bytes)).toBe(1);
});

test('every mode: chunks of n, last chunk shorter', async () => {
  const out = await split([await fivePages()], { mode: 'every', n: 2 });
  expect(await Promise.all(out.map((f) => pageCount(f.bytes)))).toEqual([2, 2, 1]);
});

test('every mode rejects n < 1 and non-integers', async () => {
  const f = await fivePages();
  await expect(split([f], { mode: 'every', n: 0 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(split([f], { mode: 'every', n: 1.5 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('select mode: one file, sorted, de-duplicated pages', async () => {
  const src = input('doc.pdf', await makePdf(3, { size: [100, 100] }));
  const out = await split([src], { mode: 'select', pages: [2, 0, 0] });
  expect(out).toHaveLength(1);
  expect(out[0].name).toBe('doc-extracted.pdf');
  expect(await pageCount(out[0].bytes)).toBe(2);
  expect(await pageWidths(out[0].bytes)).toEqual([100, 100]);
});

test('select mode rejects empty and out-of-range selections', async () => {
  const f = await fivePages();
  await expect(split([f], { mode: 'select', pages: [] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(split([f], { mode: 'select', pages: [5] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('requires exactly one input', async () => {
  await expect(split([], { mode: 'every', n: 1 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/ranges.test.ts tests/split.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/pdf/ranges"".

- [ ] **Step 3: Implement**

Create `web/src/lib/pdf/ranges.ts`:
```ts
import { PdfToolError } from './errors';

const bad = (message: string) => new PdfToolError('BAD_OPTIONS', message);

/** "1-3,5" on a 5-page doc -> [[0,1,2],[4]] (0-based). */
export function parseRanges(spec: string, pageCount: number): number[][] {
  const parts = spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw bad('Enter at least one page range, e.g. 1-3,5');

  return parts.map((part) => {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw bad(`"${part}" isn't a valid range`);
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (end < start) throw bad(`"${part}" ends before it starts`);
    if (start < 1 || end > pageCount) throw bad(`"${part}" is outside 1-${pageCount}`);
    return Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  });
}
```

Create `web/src/lib/pdf/split.ts`:
```ts
import { PDFDocument } from 'pdf-lib';
import { PdfToolError } from './errors';
import { baseName, loadPdf, single } from './load';
import { parseRanges } from './ranges';
import { PDF_MIME, type Engine, type OutputFile } from './types';

export type SplitOptions =
  | { mode: 'ranges'; ranges: string }
  | { mode: 'every'; n: number }
  | { mode: 'select'; pages: number[] };

function chunk(indices: number[], n: number): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < indices.length; i += n) groups.push(indices.slice(i, i + n));
  return groups;
}

export const split: Engine<SplitOptions> = async (inputs, opts) => {
  const file = single(inputs);
  const src = await loadPdf(file);
  const total = src.getPageCount();
  const base = baseName(file.name);

  let groups: number[][];
  switch (opts.mode) {
    case 'ranges':
      groups = parseRanges(opts.ranges, total);
      break;
    case 'every':
      if (!Number.isInteger(opts.n) || opts.n < 1) {
        throw new PdfToolError('BAD_OPTIONS', 'Pages per file must be a whole number of at least 1');
      }
      groups = chunk(src.getPageIndices(), opts.n);
      break;
    case 'select': {
      const pages = [...new Set(opts.pages)].sort((a, b) => a - b);
      if (pages.length === 0) throw new PdfToolError('BAD_OPTIONS', 'Select at least one page');
      if (pages.some((p) => p < 0 || p >= total)) {
        throw new PdfToolError('BAD_OPTIONS', `Selected pages must be within 1-${total}`);
      }
      groups = [pages];
      break;
    }
  }

  const out: OutputFile[] = [];
  for (const [i, group] of groups.entries()) {
    const doc = await PDFDocument.create();
    (await doc.copyPages(src, group)).forEach((p) => doc.addPage(p));
    const name = opts.mode === 'select' ? `${base}-extracted.pdf` : `${base}-part-${i + 1}.pdf`;
    out.push({ name, bytes: await doc.save(), mime: PDF_MIME });
  }
  return out;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/ranges.test.ts tests/split.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/pdf/ranges.ts web/src/lib/pdf/split.ts web/tests/ranges.test.ts web/tests/split.test.ts
git commit -m "feat(web): add page range parser and split engine"
```

---

### Task 5: Rotate engine

**Files:**
- Create: `web/src/lib/pdf/rotate.ts`
- Test: `web/tests/rotate.test.ts`

**Interfaces:**
- Consumes: `loadPdf`, `single`, `baseName`; `PdfToolError`; `Engine`, `PDF_MIME`
- Produces: `type RotateOptions = { rotations: number[] }`. It holds one entry per page: the clockwise delta in degrees, a multiple of 90, which may be negative. Also produces `const rotate: Engine<RotateOptions>`, whose output is named `<base>-rotated.pdf`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/rotate.test.ts`:
```ts
import { expect, test } from 'vitest';
import { rotate } from '@/lib/pdf/rotate';
import { input, makePdf, rotations } from './helpers';

test('applies per-page deltas', async () => {
  const f = input('scan.pdf', await makePdf(3));
  const [out] = await rotate([f], { rotations: [90, 0, 270] });
  expect(out.name).toBe('scan-rotated.pdf');
  expect(await rotations(out.bytes)).toEqual([90, 0, 270]);
});

test('adds to existing /Rotate and normalizes to 0-359', async () => {
  const f = input('a.pdf', await makePdf(3, { rotate: 90 }));
  const [out] = await rotate([f], { rotations: [270, -90, 180] });
  expect(await rotations(out.bytes)).toEqual([0, 0, 270]);
});

test('rejects wrong length and non-right-angle deltas', async () => {
  const f = input('a.pdf', await makePdf(2));
  await expect(rotate([f], { rotations: [90] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(rotate([f], { rotations: [45, 0] })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/rotate.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/pdf/rotate"".

- [ ] **Step 3: Implement**

Create `web/src/lib/pdf/rotate.ts`:
```ts
import { degrees } from 'pdf-lib';
import { PdfToolError } from './errors';
import { baseName, loadPdf, single } from './load';
import { PDF_MIME, type Engine } from './types';

export type RotateOptions = { rotations: number[] };

export const rotate: Engine<RotateOptions> = async (inputs, { rotations }) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  const pages = doc.getPages();
  if (rotations.length !== pages.length || rotations.some((r) => !Number.isInteger(r) || r % 90 !== 0)) {
    throw new PdfToolError('BAD_OPTIONS', 'Each page rotation must be a multiple of 90 degrees');
  }
  pages.forEach((page, i) => {
    const next = (((page.getRotation().angle + rotations[i]) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  });
  return [{ name: `${baseName(file.name)}-rotated.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run tests/rotate.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/pdf/rotate.ts web/tests/rotate.test.ts
git commit -m "feat(web): add rotate engine"
```

---

### Task 6: File intake, ZIP, and tool registry

**Files:**
- Create: `web/src/lib/files.ts`, `web/src/lib/zip.ts`, `web/src/tools.ts`
- Test: `web/tests/files.test.ts`, `web/tests/zip.test.ts`, `web/tests/tools.test.ts`

**Interfaces:**
- Consumes: `InputFile`, `OutputFile`, `PdfToolError`
- Produces:
  - `MAX_BYTES: number`
  - `extensionOf(name: string): string`. Returns a lowercase extension including the dot, or `''`.
  - `readInputs(files: File[], accept: string[], multiple: boolean): Promise<InputFile[]>`
  - `formatSize(bytes: number): string`
  - `zipFiles(files: OutputFile[]): Promise<Uint8Array>`
  - `type ToolGroup = 'word' | 'image' | 'powerpoint' | 'excel' | 'organize' | 'compress' | 'edit' | 'sign'`
  - `interface ToolDef { slug; title; subtitle; group: ToolGroup; accept: string[]; multiple: boolean; engine: 'client' | 'server'; available: boolean }`
  - `TOOLS: ToolDef[]`
  - `getTool(slug: string): ToolDef | undefined`
  - `acceptLabel(tool: ToolDef): string`

- [ ] **Step 1: Write the failing tests**

Create `web/tests/files.test.ts`:
```ts
import { expect, test } from 'vitest';
import { MAX_BYTES, extensionOf, formatSize, readInputs } from '@/lib/files';

const pdfFile = (name: string, size = 4) => new File([new Uint8Array(size)], name);

test('extensionOf', () => {
  expect(extensionOf('A.PDF')).toBe('.pdf');
  expect(extensionOf('archive.tar.gz')).toBe('.gz');
  expect(extensionOf('README')).toBe('');
});

test('reads accepted files into InputFile', async () => {
  const [f] = await readInputs([pdfFile('a.pdf', 3)], ['.pdf'], false);
  expect(f.name).toBe('a.pdf');
  expect(f.bytes).toBeInstanceOf(Uint8Array);
  expect(f.bytes.length).toBe(3);
});

test('rejects wrong extension as UNSUPPORTED_TYPE', async () => {
  await expect(readInputs([pdfFile('notes.txt')], ['.pdf'], true)).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  });
});

test('rejects multiple files for single-file tools', async () => {
  await expect(readInputs([pdfFile('a.pdf'), pdfFile('b.pdf')], ['.pdf'], false)).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  });
});

test('rejects files over 50 MB as TOO_LARGE', async () => {
  const big = { name: 'big.pdf', size: MAX_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) } as File;
  await expect(readInputs([big], ['.pdf'], false)).rejects.toMatchObject({ code: 'TOO_LARGE' });
});

test('empty selection returns empty array', async () => {
  expect(await readInputs([], ['.pdf'], true)).toEqual([]);
});

test('formatSize', () => {
  expect(formatSize(512)).toBe('512 B');
  expect(formatSize(2048)).toBe('2.0 KB');
  expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
});
```

Create `web/tests/zip.test.ts`:
```ts
import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { zipFiles } from '@/lib/zip';

const out = (name: string, text: string) => ({
  name,
  bytes: new TextEncoder().encode(text),
  mime: 'application/pdf',
});

test('zips all files and keeps duplicate names distinct', async () => {
  const bytes = await zipFiles([out('a.pdf', '1'), out('a.pdf', '2'), out('b.pdf', '3')]);
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files).sort()).toEqual(['a (2).pdf', 'a.pdf', 'b.pdf']);
  expect(await zip.file('a (2).pdf')!.async('string')).toBe('2');
});
```

Create `web/tests/tools.test.ts`:
```ts
import { expect, test } from 'vitest';
import { TOOLS, acceptLabel, getTool } from '@/tools';

test('registry has the 14 spec tools with unique slugs', () => {
  expect(TOOLS).toHaveLength(14);
  expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(14);
  expect(TOOLS.map((t) => t.slug).sort()).toEqual(
    [
      'compress-pdf', 'edit-pdf', 'excel-to-pdf', 'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png',
      'pdf-to-word', 'powerpoint-to-pdf', 'rotate-pdf', 'sign-pdf', 'split-pdf', 'watermark-pdf', 'word-to-pdf',
    ],
  );
});

test('server engine exactly for compress and office tools', () => {
  const server = TOOLS.filter((t) => t.engine === 'server').map((t) => t.slug).sort();
  expect(server).toEqual(['compress-pdf', 'excel-to-pdf', 'pdf-to-word', 'powerpoint-to-pdf', 'word-to-pdf']);
});

test('plan 1 enables merge, split, rotate only', () => {
  expect(TOOLS.filter((t) => t.available).map((t) => t.slug).sort()).toEqual(['merge-pdf', 'rotate-pdf', 'split-pdf']);
});

test('accept lists are lowercase dotted extensions', () => {
  for (const t of TOOLS) for (const ext of t.accept) expect(ext).toMatch(/^\.[a-z]+$/);
});

test('getTool', () => {
  expect(getTool('merge-pdf')?.title).toBe('Merge PDF');
  expect(getTool('nope')).toBeUndefined();
});

test('acceptLabel', () => {
  expect(acceptLabel(getTool('merge-pdf')!)).toBe('PDF FILES');
  expect(acceptLabel(getTool('split-pdf')!)).toBe('PDF FILE');
  expect(acceptLabel(getTool('word-to-pdf')!)).toBe('WORD FILE');
  expect(acceptLabel(getTool('image-to-pdf')!)).toBe('IMAGES');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/files.test.ts tests/zip.test.ts tests/tools.test.ts`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement**

Create `web/src/lib/files.ts`:
```ts
import { PdfToolError } from './pdf/errors';
import type { InputFile } from './pdf/types';

export const MAX_BYTES = 50 * 1024 * 1024;

export function extensionOf(name: string): string {
  const m = /\.[^.]+$/.exec(name.toLowerCase());
  return m ? m[0] : '';
}

export async function readInputs(files: File[], accept: string[], multiple: boolean): Promise<InputFile[]> {
  if (files.length === 0) return [];
  if (!multiple && files.length > 1) {
    throw new PdfToolError('UNSUPPORTED_TYPE', 'This tool takes one file at a time');
  }
  for (const f of files) {
    if (!accept.includes(extensionOf(f.name))) {
      throw new PdfToolError('UNSUPPORTED_TYPE', `${f.name}: expected ${accept.join(', ')}`);
    }
    if (f.size > MAX_BYTES) {
      throw new PdfToolError('TOO_LARGE', `${f.name} is larger than 50 MB`);
    }
  }
  return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

Create `web/src/lib/zip.ts`:
```ts
import JSZip from 'jszip';
import type { OutputFile } from './pdf/types';

function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; used.has(candidate); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate);
  return candidate;
}

export async function zipFiles(files: OutputFile[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) zip.file(uniqueName(f.name, used), f.bytes);
  return zip.generateAsync({ type: 'uint8array' });
}
```

Create `web/src/tools.ts`:
```ts
export type ToolGroup = 'word' | 'image' | 'powerpoint' | 'excel' | 'organize' | 'compress' | 'edit' | 'sign';

export interface ToolDef {
  slug: string;
  title: string;
  subtitle: string;
  group: ToolGroup;
  accept: string[];
  multiple: boolean;
  engine: 'client' | 'server';
  available: boolean;
}

const PDF = ['.pdf'];

// Order matches the reference tools grid.
export const TOOLS: ToolDef[] = [
  { slug: 'pdf-to-word', title: 'Convert PDF to Word', subtitle: 'Turn a PDF into an editable DOCX', group: 'word', accept: PDF, multiple: false, engine: 'server', available: false },
  { slug: 'word-to-pdf', title: 'Convert Word to PDF', subtitle: 'Convert DOC and DOCX files to PDF', group: 'word', accept: ['.doc', '.docx'], multiple: false, engine: 'server', available: false },
  { slug: 'pdf-to-jpg', title: 'Convert PDF to JPG', subtitle: 'Save each page as a JPG image', group: 'image', accept: PDF, multiple: false, engine: 'client', available: false },
  { slug: 'image-to-pdf', title: 'Convert JPG/PNG to PDF', subtitle: 'Combine images into one PDF', group: 'image', accept: ['.jpg', '.jpeg', '.png'], multiple: true, engine: 'client', available: false },
  { slug: 'pdf-to-png', title: 'Convert PDF to PNG', subtitle: 'Save each page as a PNG image', group: 'image', accept: PDF, multiple: false, engine: 'client', available: false },
  { slug: 'powerpoint-to-pdf', title: 'Convert PowerPoint to PDF', subtitle: 'Convert PPT and PPTX files to PDF', group: 'powerpoint', accept: ['.ppt', '.pptx'], multiple: false, engine: 'server', available: false },
  { slug: 'excel-to-pdf', title: 'Convert Excel to PDF', subtitle: 'Convert XLS and XLSX files to PDF', group: 'excel', accept: ['.xls', '.xlsx'], multiple: false, engine: 'server', available: false },
  { slug: 'split-pdf', title: 'Split PDF', subtitle: 'Extract pages or split into several files', group: 'organize', accept: PDF, multiple: false, engine: 'client', available: true },
  { slug: 'merge-pdf', title: 'Merge PDF', subtitle: 'Combine PDFs in the order you want', group: 'organize', accept: PDF, multiple: true, engine: 'client', available: true },
  { slug: 'compress-pdf', title: 'Compress PDF', subtitle: 'Reduce PDF file size', group: 'compress', accept: PDF, multiple: false, engine: 'server', available: false },
  { slug: 'edit-pdf', title: 'Edit PDF', subtitle: 'Add text, shapes, images and highlights', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: false },
  { slug: 'watermark-pdf', title: 'Watermark PDF', subtitle: 'Stamp text or an image on your pages', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: false },
  { slug: 'rotate-pdf', title: 'Rotate PDF', subtitle: 'Rotate one page or all of them', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: true },
  { slug: 'sign-pdf', title: 'Sign PDF', subtitle: 'Draw, type or upload your signature', group: 'sign', accept: PDF, multiple: false, engine: 'client', available: false },
];

export function getTool(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

const KIND: Record<string, string> = {
  '.pdf': 'PDF',
  '.doc': 'WORD',
  '.docx': 'WORD',
  '.xls': 'EXCEL',
  '.xlsx': 'EXCEL',
  '.ppt': 'POWERPOINT',
  '.pptx': 'POWERPOINT',
};

/** Label for the "SELECT … " button, e.g. "PDF FILE", "PDF FILES", "IMAGES". */
export function acceptLabel(tool: ToolDef): string {
  const kind = KIND[tool.accept[0]];
  if (!kind) return 'IMAGES';
  return `${kind} ${tool.multiple ? 'FILES' : 'FILE'}`;
}
```

Note: Rotate uses the `edit` group (purple), matching the reference tile colors.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/files.test.ts tests/zip.test.ts tests/tools.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/files.ts web/src/lib/zip.ts web/src/tools.ts web/tests/files.test.ts web/tests/zip.test.ts web/tests/tools.test.ts
git commit -m "feat(web): add file intake, zip helper, and tool registry"
```

---

### Task 7: Site chrome and home page

**Files:**
- Create:
  - `web/src/site.ts`, `web/src/lib/handoff.ts`
  - components: `web/src/components/{TopBar,Footer,ToolIcon,ToolsGrid,HowToUse,Dropzone,ErrorCard,HomeClient}.tsx`
  - `web/playwright.config.ts`, `web/e2e/home.spec.ts`, `web/tests/handoff.test.ts`
- Modify (replace contents): `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`
- Delete: `web/public/*.svg` (create-next-app sample assets)

**Interfaces:**
- Consumes: `TOOLS`, `ToolDef`, `ToolGroup` (tools.ts); `readInputs` (files.ts); `ERROR_MESSAGES`, `PdfToolError`, `toToolError`; `InputFile`
- Produces:
  - `SITE_NAME`
  - `setHandoff(files: InputFile[])`, `peekHandoff(): InputFile[] | null`, `takeHandoff(): InputFile[] | null`, `clearHandoff()`
  - `<Dropzone accept multiple label onFiles />`, whose root element has `data-testid="dropzone"`
  - `<ErrorCard error onDismiss />`, with `role="alert"`
  - `<ToolsGrid currentSlug? acceptingExt? />`. The section has `id="tools"`, and each tile has `data-testid="tool-tile"`.
  - `<HowToUse />`, `<ToolIcon tool />`

- [ ] **Step 1: Write the failing handoff unit test**

Create `web/tests/handoff.test.ts`:
```ts
import { expect, test } from 'vitest';
import { clearHandoff, peekHandoff, setHandoff, takeHandoff } from '@/lib/handoff';

test('peek keeps, take consumes, clear empties', () => {
  const files = [{ name: 'a.pdf', bytes: new Uint8Array([1]) }];
  setHandoff(files);
  expect(peekHandoff()).toBe(files);
  expect(takeHandoff()).toBe(files);
  expect(takeHandoff()).toBeNull();
  setHandoff(files);
  clearHandoff();
  expect(peekHandoff()).toBeNull();
});
```

Run: `cd web && npx vitest run tests/handoff.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 2: Implement handoff and the site constant**

Create `web/src/lib/handoff.ts`:
```ts
import type { InputFile } from './pdf/types';

// Module-level store survives client-side navigation (next/link, router.push).
let pending: InputFile[] | null = null;

export function setHandoff(files: InputFile[]): void {
  pending = files;
}

export function peekHandoff(): InputFile[] | null {
  return pending;
}

export function takeHandoff(): InputFile[] | null {
  const files = pending;
  pending = null;
  return files;
}

export function clearHandoff(): void {
  pending = null;
}
```

Create `web/src/site.ts`:
```ts
export const SITE_NAME = 'PDF Tools';
```

Run: `cd web && npx vitest run tests/handoff.test.ts`
Expected: PASS.

- [ ] **Step 3: Global styles and layout**

Replace `web/src/app/globals.css`:
```css
@import "tailwindcss";

@theme inline {
  --color-brand: #e5322d;
  --color-brand-dark: #c4231f;
  --color-page: #f2f2f2;
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-display: var(--font-archivo-black), system-ui, sans-serif;
}

body {
  background: var(--color-page);
  color: #333;
}
```

Replace `web/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Archivo_Black, Inter } from 'next/font/google';
import { Footer } from '@/components/Footer';
import { TopBar } from '@/components/TopBar';
import { SITE_NAME } from '@/site';
import './globals.css';

const display = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-archivo-black' });
const sans = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: `${SITE_NAME} — Free online PDF tools`,
  description: 'Merge, split, rotate, convert, sign and edit PDFs for free. Most tools run right in your browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <TopBar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Chrome components**

Create `web/src/components/TopBar.tsx`:
```tsx
import Link from 'next/link';
import { SITE_NAME } from '@/site';

export function TopBar() {
  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <Link href="/" className="text-xl font-bold text-gray-800">
          {SITE_NAME}
        </Link>
      </div>
    </header>
  );
}
```

Create `web/src/components/Footer.tsx`:
```tsx
import { SITE_NAME } from '@/site';

export function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-gray-500">
        <p>Most tools run in your browser. Uploaded files are deleted within 1 hour.</p>
        <p className="mt-1">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
```

Create `web/src/components/ToolIcon.tsx`:
```tsx
import {
  FileText, Image as ImageIcon, Merge, Minimize2, PenLine, Pencil, Presentation, RotateCw, Scissors, Sheet, Stamp,
  type LucideIcon,
} from 'lucide-react';
import type { ToolDef, ToolGroup } from '@/tools';

const GROUP_COLORS: Record<ToolGroup, string> = {
  word: '#3b7fc4',
  image: '#f5d547',
  powerpoint: '#f29b85',
  excel: '#6cc17a',
  organize: '#ee6a1a',
  compress: '#6b8e23',
  edit: '#9b5c9b',
  sign: '#1f5fbf',
};

const ICONS: Record<string, LucideIcon> = {
  'pdf-to-word': FileText,
  'word-to-pdf': FileText,
  'pdf-to-jpg': ImageIcon,
  'pdf-to-png': ImageIcon,
  'image-to-pdf': ImageIcon,
  'powerpoint-to-pdf': Presentation,
  'excel-to-pdf': Sheet,
  'split-pdf': Scissors,
  'merge-pdf': Merge,
  'compress-pdf': Minimize2,
  'edit-pdf': Pencil,
  'watermark-pdf': Stamp,
  'rotate-pdf': RotateCw,
  'sign-pdf': PenLine,
};

export function ToolIcon({ tool }: { tool: ToolDef }) {
  const Icon = ICONS[tool.slug] ?? FileText;
  const fg = tool.group === 'image' ? 'text-amber-900' : 'text-white';
  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-md"
      style={{ background: GROUP_COLORS[tool.group] }}
    >
      <Icon className={`h-6 w-6 ${fg}`} aria-hidden />
    </span>
  );
}
```

Create `web/src/components/ToolsGrid.tsx`:
```tsx
import Link from 'next/link';
import { TOOLS } from '@/tools';
import { ToolIcon } from './ToolIcon';

export function ToolsGrid({ currentSlug, acceptingExt }: { currentSlug?: string; acceptingExt?: string }) {
  return (
    <section id="tools" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-12">
      <h2 className="mb-8 text-center font-display text-3xl text-gray-800">All Our PDF Tools</h2>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {TOOLS.map((t) => {
          const dim = !t.available || (acceptingExt !== undefined && !t.accept.includes(acceptingExt));
          const cls = [
            'flex min-h-36 flex-col items-center justify-center rounded-md border-2 bg-white p-6 text-center text-gray-700',
            t.slug === currentSlug ? 'border-brand' : 'border-transparent',
            dim ? 'opacity-50' : '',
            t.available ? 'transition-shadow hover:shadow-md' : 'cursor-default',
          ].join(' ');
          const body = (
            <>
              <ToolIcon tool={t} />
              <span className="mt-3">{t.title}</span>
              {!t.available && <span className="mt-1 text-xs uppercase tracking-wide text-gray-400">Coming soon</span>}
            </>
          );
          return (
            <li key={t.slug} data-testid="tool-tile">
              {t.available ? (
                <Link href={`/${t.slug}`} className={cls}>
                  {body}
                </Link>
              ) : (
                <div className={cls} aria-disabled="true">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

Create `web/src/components/HowToUse.tsx`:
```tsx
import { Download, FilePenLine, MousePointerClick } from 'lucide-react';
import { SITE_NAME } from '@/site';

const STEPS = [
  { icon: MousePointerClick, title: 'Choose Functionality', text: 'Click on the document editing option you need' },
  { icon: FilePenLine, title: 'Edit Your Document', text: 'Use our user-friendly tool to get your work done' },
  { icon: Download, title: 'Download Your Document', text: 'Save your document. Done!' },
];

export function HowToUse() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="mb-10 text-center font-display text-3xl text-gray-800">How to Use {SITE_NAME}?</h2>
      <ol className="grid gap-10 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="text-center">
            <Icon className="mx-auto h-20 w-20 text-sky-500" strokeWidth={1.25} aria-hidden />
            <h3 className="mt-4 text-xl font-bold text-gray-800">{title}</h3>
            <p className="mt-1 text-gray-500">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

Create `web/src/components/Dropzone.tsx`:
```tsx
'use client';

import { useRef, useState } from 'react';

interface DropzoneProps {
  accept: string[];
  multiple: boolean;
  label: string;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ accept, multiple, label, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      data-testid="dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`flex flex-col items-center justify-center gap-5 border-2 border-dashed border-brand px-4 py-16 transition-colors md:py-20 ${
        over ? 'bg-red-50' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-sm bg-brand px-10 py-6 text-xl font-bold text-white shadow-sm transition-colors hover:bg-brand-dark md:px-16 md:text-2xl"
      >
        SELECT {label}
      </button>
      <p className="font-semibold text-gray-400">Or drag and drop here</p>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept.join(',')}
        multiple={multiple}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

Create `web/src/components/ErrorCard.tsx`:
```tsx
'use client';

import { ERROR_MESSAGES, type PdfToolError } from '@/lib/pdf/errors';

export function ErrorCard({ error, onDismiss }: { error: PdfToolError; onDismiss: () => void }) {
  const headline = ERROR_MESSAGES[error.code];
  return (
    <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{headline}</p>
      {error.message && error.message !== headline && <p className="mt-1 text-sm">{error.message}</p>}
      <button type="button" onClick={onDismiss} className="mt-3 text-sm font-semibold underline">
        Try again
      </button>
    </div>
  );
}
```

Create `web/src/components/HomeClient.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { readInputs } from '@/lib/files';
import { clearHandoff, peekHandoff, setHandoff } from '@/lib/handoff';
import { toToolError, type PdfToolError } from '@/lib/pdf/errors';
import { Dropzone } from './Dropzone';
import { ErrorCard } from './ErrorCard';
import { HowToUse } from './HowToUse';
import { ToolsGrid } from './ToolsGrid';

export function HomeClient() {
  const [ready, setReady] = useState(0);
  const [error, setError] = useState<PdfToolError | null>(null);

  useEffect(() => {
    const pending = peekHandoff();
    if (pending) setReady(pending.length);
  }, []);

  const onFiles = async (files: File[]) => {
    setError(null);
    try {
      const read = await readInputs(files, ['.pdf'], true);
      if (read.length === 0) return;
      setHandoff(read);
      setReady(read.length);
      document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      setError(toToolError(e));
    }
  };

  return (
    <>
      <header className="pb-8 pt-12 text-center">
        <h1 className="font-display text-4xl text-gray-800">EDIT PDF</h1>
        <p className="mt-2 font-semibold text-gray-700">Free PDF tools, right in your browser</p>
      </header>
      <div className="mx-auto max-w-5xl px-4">
        {error && <ErrorCard error={error} onDismiss={() => setError(null)} />}
        {ready > 0 ? (
          <div data-testid="home-ready" className="rounded-md bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold">
              {ready} PDF{ready > 1 ? 's' : ''} ready — choose a tool below
            </p>
            <button
              type="button"
              className="mt-3 text-sm text-gray-500 underline"
              onClick={() => {
                clearHandoff();
                setReady(0);
              }}
            >
              Choose different files
            </button>
          </div>
        ) : (
          <Dropzone accept={['.pdf']} multiple label="PDF FILE" onFiles={onFiles} />
        )}
      </div>
      <HowToUse />
      <ToolsGrid acceptingExt={ready > 0 ? '.pdf' : undefined} />
    </>
  );
}
```

Replace `web/src/app/page.tsx`:
```tsx
import { HomeClient } from '@/components/HomeClient';

export default function Home() {
  return (
    <main>
      <HomeClient />
    </main>
  );
}
```

Delete the sample assets: `rm -f web/public/*.svg`

- [ ] **Step 5: Configure Playwright and write the home e2e**

Create `web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3100', acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
```

Create `web/e2e/home.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('home shows hero dropzone and all 14 tools', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'EDIT PDF' })).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'SELECT PDF FILE' })).toBeVisible();
  await expect(page.getByTestId('tool-tile')).toHaveCount(14);
  await expect(page.getByText('Coming soon')).toHaveCount(11);
});

test('available tiles link to their tool page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Merge PDF' }).click();
  await expect(page).toHaveURL(/\/merge-pdf$/);
});

test('home rejects non-PDF files with an error card', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hi'),
  });
  await expect(page.getByRole('alert')).toContainText("This file type isn't supported");
});
```

Note: `/merge-pdf` returns 404 until Task 8 adds the route. This test asserts only the URL after the click, so it already passes in this task.

- [ ] **Step 6: Run the tests**

```bash
cd web && npm test && npx playwright test e2e/home.spec.ts
```
Expected: all unit tests PASS. All 3 home e2e tests pass in each of the 3 browsers (9 passes).

- [ ] **Step 7: Commit**

```bash
git add -A web
git commit -m "feat(web): add site chrome, home page, tools grid, dropzone"
```

---

### Task 8: Tool route, tool shell, and engine worker

**Files:**
- Create:
  - `web/src/app/[tool]/page.tsx`
  - components: `web/src/components/ToolShell.tsx`, `web/src/components/ResultPanel.tsx`, `web/src/components/workspaces/index.ts`
  - libs: `web/src/lib/download.ts`, `web/src/lib/pdf/engines.ts`, `web/src/lib/pdf/engine.worker.ts`, `web/src/lib/pdf/client.ts`
- Test: `web/tests/engines.test.ts`, `web/e2e/tool-shell.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces:
  - `engines = { validate, merge, split, rotate }`; `type EngineName = keyof typeof engines`
  - `validate: Engine<Record<string, never>>`. It returns `[]` and throws when any PDF input is invalid or encrypted.
  - `runEngine(engine: EngineName, inputs: InputFile[], opts: unknown): Promise<OutputFile[]>`. It runs the engine in a Web Worker and rejects with `PdfToolError`.
  - `downloadBytes(bytes: Uint8Array, name: string, mime: string): void`
  - `interface WorkspaceProps { inputs: InputFile[]; onInputsChange: (files: InputFile[]) => void; onAddFiles: (files: File[]) => void; run: (engine: EngineName, opts: unknown) => void; busy: boolean }`
  - `WORKSPACES: Record<string, ComponentType<WorkspaceProps>>`. It starts empty; Tasks 9–11 add entries.
  - `<ResultPanel outputs onReset />`, with `data-testid="result"`

- [ ] **Step 1: Write the failing engines test**

Create `web/tests/engines.test.ts`:
```ts
import { expect, test } from 'vitest';
import { engines } from '@/lib/pdf/engines';
import { input, makeEncryptedPdf, makePdf } from './helpers';

test('registry exposes validate, merge, split, rotate', () => {
  expect(Object.keys(engines).sort()).toEqual(['merge', 'rotate', 'split', 'validate']);
});

test('validate passes good PDFs and returns no output', async () => {
  expect(await engines.validate([input('a.pdf', await makePdf(1))], {})).toEqual([]);
});

test('validate rejects encrypted and junk PDFs', async () => {
  await expect(engines.validate([input('x.pdf', await makeEncryptedPdf())], {})).rejects.toMatchObject({ code: 'ENCRYPTED' });
  await expect(engines.validate([input('y.pdf', new Uint8Array([1, 2, 3]))], {})).rejects.toMatchObject({ code: 'INVALID_FILE' });
});
```

Run: `cd web && npx vitest run tests/engines.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 2: Implement the engine registry**

Create `web/src/lib/pdf/engines.ts`:
```ts
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
```

Run: `cd web && npx vitest run tests/engines.test.ts`
Expected: PASS.

- [ ] **Step 3: Worker and RPC client**

Create `web/src/lib/pdf/engine.worker.ts`:
```ts
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
```

Create `web/src/lib/pdf/client.ts`:
```ts
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
  worker.onerror = (e) => {
    // A crash (often out-of-memory) kills every in-flight job; start fresh next time.
    for (const p of pending.values()) p.reject(new PdfToolError('OUT_OF_MEMORY', e.message || 'Processing crashed'));
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
```

Create `web/src/lib/download.ts`:
```ts
export function downloadBytes(bytes: Uint8Array, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

- [ ] **Step 4: Workspaces map, ResultPanel, ToolShell, route**

Create `web/src/components/workspaces/index.ts`:
```ts
import type { ComponentType } from 'react';
import type { EngineName } from '@/lib/pdf/engines';
import type { InputFile } from '@/lib/pdf/types';

export interface WorkspaceProps {
  inputs: InputFile[];
  onInputsChange: (files: InputFile[]) => void;
  onAddFiles: (files: File[]) => void;
  run: (engine: EngineName, opts: unknown) => void;
  busy: boolean;
}

export const WORKSPACES: Record<string, ComponentType<WorkspaceProps>> = {};
```

Create `web/src/components/ResultPanel.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { downloadBytes } from '@/lib/download';
import { formatSize } from '@/lib/files';
import { setHandoff } from '@/lib/handoff';
import { PDF_MIME, type OutputFile } from '@/lib/pdf/types';
import { zipFiles } from '@/lib/zip';

export function ResultPanel({ outputs, onReset }: { outputs: OutputFile[]; onReset: () => void }) {
  const router = useRouter();
  const [zipping, setZipping] = useState(false);
  const single = outputs.length === 1 ? outputs[0] : null;

  const download = async () => {
    if (single) return downloadBytes(single.bytes, single.name, single.mime);
    setZipping(true);
    try {
      downloadBytes(await zipFiles(outputs), 'files.zip', 'application/zip');
    } finally {
      setZipping(false);
    }
  };

  const reuse = () => {
    if (!single) return;
    setHandoff([{ name: single.name, bytes: single.bytes }]);
    router.push('/#tools');
  };

  return (
    <div data-testid="result" className="rounded-md bg-white p-8 text-center shadow-sm">
      <h2 className="font-display text-2xl text-gray-800">
        {single ? 'Your file is ready' : `Your ${outputs.length} files are ready`}
      </h2>
      <ul className="my-4 text-sm text-gray-600">
        {outputs.map((f, i) => (
          <li key={i}>
            {f.name} · {formatSize(f.bytes.length)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={download}
        disabled={zipping}
        className="rounded-sm bg-brand px-10 py-4 text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {single ? 'DOWNLOAD' : 'DOWNLOAD ZIP'}
      </button>
      <div className="mt-4 flex justify-center gap-6 text-sm">
        <button type="button" onClick={onReset} className="underline">
          Start over
        </button>
        {single?.mime === PDF_MIME && (
          <button type="button" onClick={reuse} className="underline">
            Use in another tool
          </button>
        )}
      </div>
    </div>
  );
}
```

Create `web/src/components/ToolShell.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { extensionOf, readInputs } from '@/lib/files';
import { takeHandoff } from '@/lib/handoff';
import { runEngine } from '@/lib/pdf/client';
import type { EngineName } from '@/lib/pdf/engines';
import { toToolError, type PdfToolError } from '@/lib/pdf/errors';
import type { InputFile, OutputFile } from '@/lib/pdf/types';
import { acceptLabel, getTool } from '@/tools';
import { Dropzone } from './Dropzone';
import { ErrorCard } from './ErrorCard';
import { ResultPanel } from './ResultPanel';
import { WORKSPACES } from './workspaces';

export function ToolShell({ slug }: { slug: string }) {
  const tool = getTool(slug)!;
  const Workspace = WORKSPACES[slug];
  const [inputs, setInputs] = useState<InputFile[]>([]);
  const [outputs, setOutputs] = useState<OutputFile[] | null>(null);
  const [error, setError] = useState<PdfToolError | null>(null);
  const [busy, setBusy] = useState(false);

  // Accepts already-read files (dropzone or handoff); PDFs are parsed in the worker first
  // so encrypted/corrupt files are rejected before any workspace renders.
  const accept = useCallback(
    async (read: InputFile[], append: boolean) => {
      if (read.length === 0) return;
      const pdfs = read.filter((f) => extensionOf(f.name) === '.pdf');
      if (pdfs.length > 0) await runEngine('validate', pdfs, {});
      setInputs((prev) => (append && tool.multiple ? [...prev, ...read] : read));
    },
    [tool.multiple],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setBusy(true);
      try {
        await accept(await readInputs(files, tool.accept, tool.multiple), true);
      } catch (e) {
        setError(toToolError(e));
      } finally {
        setBusy(false);
      }
    },
    [accept, tool],
  );

  useEffect(() => {
    const handed = takeHandoff();
    if (!handed) return;
    const usable = handed.filter((f) => tool.accept.includes(extensionOf(f.name)));
    accept(tool.multiple ? usable : usable.slice(0, 1), false).catch((e) => setError(toToolError(e)));
  }, [tool, accept]);

  const run = useCallback(
    async (engine: EngineName, opts: unknown) => {
      setBusy(true);
      setError(null);
      try {
        setOutputs(await runEngine(engine, inputs, opts));
      } catch (e) {
        setError(toToolError(e));
      } finally {
        setBusy(false);
      }
    },
    [inputs],
  );

  const reset = () => {
    setInputs([]);
    setOutputs(null);
    setError(null);
  };

  if (!tool.available || !Workspace) {
    return (
      <section className="mx-auto max-w-5xl px-4">
        <div className="rounded-md bg-white p-10 text-center text-lg text-gray-600 shadow-sm">
          This tool is coming soon.
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4">
      {error && <ErrorCard error={error} onDismiss={() => setError(null)} />}
      {outputs ? (
        <ResultPanel outputs={outputs} onReset={reset} />
      ) : inputs.length === 0 ? (
        <Dropzone accept={tool.accept} multiple={tool.multiple} label={acceptLabel(tool)} onFiles={addFiles} />
      ) : (
        <Workspace inputs={inputs} onInputsChange={setInputs} onAddFiles={addFiles} run={run} busy={busy} />
      )}
    </section>
  );
}
```

Create `web/src/app/[tool]/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HowToUse } from '@/components/HowToUse';
import { ToolShell } from '@/components/ToolShell';
import { ToolsGrid } from '@/components/ToolsGrid';
import { SITE_NAME } from '@/site';
import { TOOLS, getTool } from '@/tools';

type Params = { params: Promise<{ tool: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const tool = getTool((await params).tool);
  return tool ? { title: `${tool.title} — ${SITE_NAME}`, description: tool.subtitle } : {};
}

export default async function ToolPage({ params }: Params) {
  const tool = getTool((await params).tool);
  if (!tool) notFound();
  return (
    <main>
      <header className="pb-8 pt-12 text-center">
        <h1 className="font-display text-4xl uppercase text-gray-800">{tool.title}</h1>
        <p className="mt-2 font-semibold text-gray-700">{tool.subtitle}</p>
      </header>
      <ToolShell slug={tool.slug} />
      <HowToUse />
      <ToolsGrid currentSlug={tool.slug} />
    </main>
  );
}
```

Note: until Task 9 registers a workspace, every tool page shows "coming soon", because `WORKSPACES` is empty.

- [ ] **Step 5: Write the tool-shell e2e**

Selection-time checks (encrypted, junk, wrong extension) need a registered workspace, so they live in Task 9's e2e. This task tests routing and the coming-soon state only.

Create `web/e2e/tool-shell.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('tool page renders header and current tile', async ({ page }) => {
  await page.goto('/compress-pdf');
  await expect(page.getByRole('heading', { name: 'Compress PDF', level: 1 })).toBeVisible();
  await expect(page.getByText('This tool is coming soon.')).toBeVisible();
  await expect(page.getByTestId('tool-tile')).toHaveCount(14);
});

test('unknown tool slug is a 404', async ({ page }) => {
  const res = await page.goto('/not-a-tool');
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 6: Run the tests**

```bash
cd web && npm test && npx playwright test e2e/home.spec.ts e2e/tool-shell.spec.ts
```
Expected: all unit tests PASS and all e2e tests PASS in all 3 browsers.

- [ ] **Step 7: Commit**

```bash
git add -A web
git commit -m "feat(web): add tool route, tool shell, result panel, engine worker"
```

---

### Task 9: Merge workspace

**Files:**
- Create: `web/src/components/workspaces/MergeWorkspace.tsx`, `web/e2e/fixtures.ts`, `web/e2e/merge.spec.ts`
- Modify: `web/src/components/workspaces/index.ts`

**Interfaces:**
- Consumes: `WorkspaceProps`, `WORKSPACES`; the engine name `'merge'`
- Produces: the `'merge-pdf'` entry in `WORKSPACES`, and the e2e helpers `pdfUpload(name, pages, size?)`, `encryptedUpload(name)`, `junkUpload(name)`, `readDownload(download)`.

- [ ] **Step 1: Write the e2e fixtures and the failing e2e**

Create `web/e2e/fixtures.ts`:
```ts
import { readFile } from 'node:fs/promises';
import type { Download } from '@playwright/test';
import { makeEncryptedPdf, makePdf } from '../tests/helpers';

type Upload = { name: string; mimeType: string; buffer: Buffer };

export async function pdfUpload(name: string, pages: number, size?: [number, number]): Promise<Upload> {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await makePdf(pages, { size })) };
}

export async function encryptedUpload(name: string): Promise<Upload> {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await makeEncryptedPdf()) };
}

export function junkUpload(name: string): Upload {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from('definitely not a pdf') };
}

export async function readDownload(download: Download): Promise<Buffer> {
  return readFile((await download.path())!);
}
```

Create `web/e2e/merge.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { encryptedUpload, junkUpload, pdfUpload, readDownload } from './fixtures';

const fileInput = (page: import('@playwright/test').Page) =>
  page.getByTestId('dropzone').locator('input[type=file]');

test('merge two PDFs after reordering', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('a.pdf', 2, [200, 300]), await pdfUpload('b.pdf', 3, [400, 500])]);
  await expect(page.getByTestId('merge-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Move b.pdf up' }).click();
  await expect(page.getByTestId('merge-item').first()).toContainText('b.pdf');

  await page.getByRole('button', { name: 'MERGE PDF' }).click();
  await expect(page.getByTestId('result')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('merged.pdf');

  const doc = await PDFDocument.load(await readDownload(download));
  expect(doc.getPageCount()).toBe(5);
  expect(doc.getPage(0).getWidth()).toBe(400);
});

test('same file added twice is listed twice and removable independently', async ({ page }) => {
  await page.goto('/merge-pdf');
  const a = await pdfUpload('a.pdf', 1);
  await fileInput(page).setInputFiles([a, a]);
  await expect(page.getByTestId('merge-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove a.pdf' }).first().click();
  await expect(page.getByTestId('merge-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'MERGE PDF' })).toBeDisabled();
});

test('encrypted PDF is rejected at selection', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await encryptedUpload('locked.pdf')]);
  await expect(page.getByRole('alert')).toContainText('Protected PDF — remove the password first');
  await expect(page.getByTestId('dropzone')).toBeVisible();
});

test('non-PDF bytes named .pdf are rejected at selection', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([junkUpload('fake.pdf')]);
  await expect(page.getByRole('alert')).toContainText("This file isn't a valid PDF");
});

test('wrong extension is rejected', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await expect(page.getByRole('alert')).toContainText("This file type isn't supported");
});
```

Run: `cd web && npx playwright test e2e/merge.spec.ts --project=chromium`
Expected: FAIL. The page shows "This tool is coming soon." because no workspace is registered yet.

- [ ] **Step 2: Implement MergeWorkspace**

Create `web/src/components/workspaces/MergeWorkspace.tsx`:
```tsx
'use client';

import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { WorkspaceProps } from '.';

export function MergeWorkspace({ inputs, onInputsChange, onAddFiles, run, busy }: WorkspaceProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= inputs.length || from === to) return;
    const next = [...inputs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onInputsChange(next);
  };

  const remove = (index: number) => onInputsChange(inputs.filter((_, i) => i !== index));

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <ol className="space-y-2">
        {inputs.map((f, i) => (
          <li
            key={`${i}-${f.name}`}
            data-testid="merge-item"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
            }}
            className="flex cursor-move items-center gap-3 rounded border border-gray-200 p-3"
          >
            <GripVertical className="h-4 w-4 text-gray-400" aria-hidden />
            <span className="w-6 text-sm text-gray-400">{i + 1}.</span>
            <span className="flex-1 truncate">{f.name}</span>
            <button type="button" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1 disabled:opacity-30">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" aria-label={`Move ${f.name} down`} disabled={i === inputs.length - 1} onClick={() => move(i, i + 1)} className="p-1 disabled:opacity-30">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => remove(i)} className="p-1">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>

      {inputs.length < 2 && <p className="mt-4 text-sm text-gray-500">Add at least 2 PDFs to merge.</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => addRef.current?.click()} className="font-semibold text-brand">
          + Add more PDFs
        </button>
        <input
          ref={addRef}
          type="file"
          hidden
          accept=".pdf"
          multiple
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || inputs.length < 2}
          onClick={() => run('merge', {})}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Merging…' : 'MERGE PDF'}
        </button>
      </div>
    </div>
  );
}
```

Replace the last line of `web/src/components/workspaces/index.ts` (`export const WORKSPACES … = {};`) with:
```ts
import { MergeWorkspace } from './MergeWorkspace';

export const WORKSPACES: Record<string, ComponentType<WorkspaceProps>> = {
  'merge-pdf': MergeWorkspace,
};
```
Put the import with the other imports at the top of the file.

Note: `busy` text: while `busy`, the button label is `Merging…`. `getByRole('button', { name: 'MERGE PDF' })` matches the label after the run completes. The test then waits on `result`, so this is fine.

- [ ] **Step 3: Run the e2e to verify it passes**

Run: `cd web && npx playwright test e2e/merge.spec.ts`
Expected: 5 tests PASS × 3 browsers.

- [ ] **Step 4: Commit**

```bash
git add -A web
git commit -m "feat(web): add merge workspace"
```

---

### Task 10: Thumbnails and the Split workspace

**Files:**
- Create: `web/src/lib/pdf/render.ts`, `web/src/lib/pdf/usePageThumbs.ts`, `web/src/components/PageGrid.tsx`, `web/src/components/workspaces/SplitWorkspace.tsx`, `web/e2e/split.spec.ts`
- Modify: `web/src/components/workspaces/index.ts`

**Interfaces:**
- Consumes: `WorkspaceProps`; `SplitOptions` (split.ts); `PdfToolError`; `ErrorCard`
- Produces:
  - `renderThumbnails(bytes: Uint8Array, maxWidth?: number): Promise<string[]>`, which returns JPEG data URLs. It always copies `bytes` before handing them to pdf.js.
  - `usePageThumbs(file: InputFile | undefined): { thumbs: string[] | null; error: PdfToolError | null }`
  - `<PageGrid thumbs isSelected? rotationOf? onPageClick? />`. Each tile has `data-testid="page-thumb"` and `aria-label="Page N"`.
  - The `'split-pdf'` entry in `WORKSPACES`.

- [ ] **Step 1: Write the failing e2e**

Create `web/e2e/split.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { pdfUpload, readDownload } from './fixtures';

const fileInput = (page: import('@playwright/test').Page) =>
  page.getByTestId('dropzone').locator('input[type=file]');

test('split by ranges into a zip', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 5)]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(5);

  await page.getByLabel('Ranges', { exact: true }).fill('1-2, 4');
  await page.getByRole('button', { name: 'SPLIT PDF' }).click();
  await expect(page.getByTestId('result')).toContainText('doc-part-2.pdf');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD ZIP' }).click();
  const zip = await JSZip.loadAsync(await readDownload(await downloadPromise));
  expect(Object.keys(zip.files).sort()).toEqual(['doc-part-1.pdf', 'doc-part-2.pdf']);
  const part1 = await PDFDocument.load(await zip.file('doc-part-1.pdf')!.async('uint8array'));
  expect(part1.getPageCount()).toBe(2);
});

test('bad ranges show an error and keep the input', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 5)]);
  await page.getByLabel('Ranges', { exact: true }).fill('5-3');
  await page.getByRole('button', { name: 'SPLIT PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('"5-3" ends before it starts');
  await expect(page.getByLabel('Ranges', { exact: true })).toHaveValue('5-3');
  await expect(page.getByTestId('page-thumb')).toHaveCount(5);
});

test('select pages extracts a single PDF', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 4)]);
  await page.getByLabel('Select pages').check();
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await page.getByRole('button', { name: 'SPLIT PDF' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-extracted.pdf');
  expect((await PDFDocument.load(await readDownload(download))).getPageCount()).toBe(2);
});

test('merge output handed to split via "Use in another tool"', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('a.pdf', 2), await pdfUpload('b.pdf', 3)]);
  await page.getByRole('button', { name: 'MERGE PDF' }).click();
  await page.getByRole('button', { name: 'Use in another tool' }).click();
  await expect(page.getByTestId('home-ready')).toContainText('1 PDF ready');
  await page.getByRole('link', { name: 'Split PDF' }).click();
  await expect(page.getByTestId('page-thumb')).toHaveCount(5);
});
```

Run: `cd web && npx playwright test e2e/split.spec.ts --project=chromium`
Expected: FAIL ("This tool is coming soon.").

- [ ] **Step 2: Implement rendering**

Create `web/src/lib/pdf/render.ts`:
```ts
type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

function getPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Renders every page to a JPEG data URL. Browser only. */
export async function renderThumbnails(bytes: Uint8Array, maxWidth = 160): Promise<string[]> {
  const pdfjs = await getPdfjs();
  // pdf.js transfers (detaches) the buffer it receives; always hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const urls: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxWidth / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      urls.push(canvas.toDataURL('image/jpeg', 0.7));
      page.cleanup();
    }
    return urls;
  } finally {
    await doc.destroy();
  }
}
```

Create `web/src/lib/pdf/usePageThumbs.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';
import { PdfToolError } from './errors';
import { renderThumbnails } from './render';
import type { InputFile } from './types';

interface ThumbState {
  thumbs: string[] | null;
  error: PdfToolError | null;
}

export function usePageThumbs(file: InputFile | undefined): ThumbState {
  const [state, setState] = useState<ThumbState>({ thumbs: null, error: null });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setState({ thumbs: null, error: null });
    renderThumbnails(file.bytes)
      .then((thumbs) => {
        if (!cancelled) setState({ thumbs, error: null });
      })
      .catch(() => {
        // The file already passed pdf-lib validation; this is a display-only failure.
        if (!cancelled) setState({ thumbs: null, error: new PdfToolError('INVALID_FILE', `${file.name} couldn't be displayed`) });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return state;
}
```

Create `web/src/components/PageGrid.tsx`:
```tsx
'use client';

interface PageGridProps {
  thumbs: string[];
  isSelected?: (index: number) => boolean;
  rotationOf?: (index: number) => number;
  onPageClick?: (index: number) => void;
}

export function PageGrid({ thumbs, isSelected, rotationOf, onPageClick }: PageGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {thumbs.map((src, i) => {
        const selected = isSelected?.(i);
        const content = (
          <>
            <span className="flex h-44 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnails */}
              <img
                src={src}
                alt=""
                className="max-h-40 max-w-full shadow transition-transform"
                style={{ transform: `rotate(${rotationOf?.(i) ?? 0}deg)` }}
              />
            </span>
            <span className="mt-1 block text-center text-xs text-gray-500">{i + 1}</span>
          </>
        );
        const cls = `block w-full rounded border-2 p-2 ${selected ? 'border-brand bg-red-50' : 'border-transparent'}`;
        return (
          <li key={i}>
            {onPageClick ? (
              <button
                type="button"
                data-testid="page-thumb"
                aria-label={`Page ${i + 1}`}
                aria-pressed={isSelected ? selected : undefined}
                onClick={() => onPageClick(i)}
                className={`${cls} hover:border-gray-300`}
              >
                {content}
              </button>
            ) : (
              <div data-testid="page-thumb" aria-label={`Page ${i + 1}`} className={cls}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Implement SplitWorkspace**

Create `web/src/components/workspaces/SplitWorkspace.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { SplitOptions } from '@/lib/pdf/split';
import { usePageThumbs } from '@/lib/pdf/usePageThumbs';
import { ErrorCard } from '../ErrorCard';
import { PageGrid } from '../PageGrid';
import type { WorkspaceProps } from '.';

type Mode = SplitOptions['mode'];

const MODES: { value: Mode; label: string }[] = [
  { value: 'ranges', label: 'By page ranges' },
  { value: 'every', label: 'Every N pages' },
  { value: 'select', label: 'Select pages' },
];

export function SplitWorkspace({ inputs, onInputsChange, run, busy }: WorkspaceProps) {
  const file = inputs[0];
  const { thumbs, error } = usePageThumbs(file);
  const [mode, setMode] = useState<Mode>('ranges');
  const [ranges, setRanges] = useState('');
  const [n, setN] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const opts: SplitOptions =
    mode === 'ranges' ? { mode, ranges } : mode === 'every' ? { mode, n } : { mode, pages: [...selected] };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>

      <fieldset className="mb-4 flex flex-wrap gap-6">
        <legend className="sr-only">Split mode</legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex items-center gap-2">
            <input type="radio" name="split-mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      {mode === 'ranges' && (
        <input
          aria-label="Ranges"
          placeholder="e.g. 1-3, 5"
          value={ranges}
          onChange={(e) => setRanges(e.target.value)}
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
        />
      )}
      {mode === 'every' && (
        <label className="mb-4 flex items-center gap-2">
          <input
            aria-label="Pages per file"
            type="number"
            min={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="w-24 rounded border border-gray-300 px-3 py-2"
          />
          pages per file
        </label>
      )}
      {mode === 'select' && <p className="mb-4 text-sm text-gray-500">Click pages to include them in one new PDF.</p>}

      {thumbs ? (
        <PageGrid
          thumbs={thumbs}
          isSelected={mode === 'select' ? (i) => selected.has(i) : undefined}
          onPageClick={mode === 'select' ? toggle : undefined}
        />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={() => run('split', opts)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Splitting…' : 'SPLIT PDF'}
        </button>
      </div>
    </div>
  );
}
```

Add the import and the map entry to `web/src/components/workspaces/index.ts`:
```ts
import { SplitWorkspace } from './SplitWorkspace';
```
```ts
  'split-pdf': SplitWorkspace,
```

- [ ] **Step 4: Run the e2e to verify it passes**

Run: `cd web && npx playwright test e2e/split.spec.ts`
Expected: 4 tests PASS × 3 browsers.

- [ ] **Step 5: Commit**

```bash
git add -A web
git commit -m "feat(web): add page thumbnails and split workspace"
```

---

### Task 11: Rotate workspace

**Files:**
- Create: `web/src/components/workspaces/RotateWorkspace.tsx`, `web/e2e/rotate.spec.ts`
- Modify: `web/src/components/workspaces/index.ts`

**Interfaces:**
- Consumes: `WorkspaceProps`, `usePageThumbs`, `PageGrid`, `ErrorCard`, and the `'rotate'` engine with `RotateOptions`
- Produces: the `'rotate-pdf'` entry in `WORKSPACES`.

- [ ] **Step 1: Write the failing e2e**

Create `web/e2e/rotate.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { pdfUpload, readDownload } from './fixtures';

test('rotate one page and then all pages', async ({ page }) => {
  await page.goto('/rotate-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('scan.pdf', 3)]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(3);

  await expect(page.getByRole('button', { name: 'ROTATE PDF' })).toBeDisabled();
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate all right' }).click();
  await page.getByRole('button', { name: 'ROTATE PDF' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scan-rotated.pdf');

  const doc = await PDFDocument.load(await readDownload(download));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 180, 90]);
});

test('rotate all left yields 270', async ({ page }) => {
  await page.goto('/rotate-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('s.pdf', 2)]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(2);
  await page.getByRole('button', { name: 'Rotate all left' }).click();
  await page.getByRole('button', { name: 'ROTATE PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const doc = await PDFDocument.load(await readDownload(await downloadPromise));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([270, 270]);
});
```

Run: `cd web && npx playwright test e2e/rotate.spec.ts --project=chromium`
Expected: FAIL ("This tool is coming soon.").

- [ ] **Step 2: Implement RotateWorkspace**

Create `web/src/components/workspaces/RotateWorkspace.tsx`:
```tsx
'use client';

import { RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePageThumbs } from '@/lib/pdf/usePageThumbs';
import { ErrorCard } from '../ErrorCard';
import { PageGrid } from '../PageGrid';
import type { WorkspaceProps } from '.';

const norm = (deg: number) => ((deg % 360) + 360) % 360;

export function RotateWorkspace({ inputs, onInputsChange, run, busy }: WorkspaceProps) {
  const file = inputs[0];
  const { thumbs, error } = usePageThumbs(file);
  const [rot, setRot] = useState<number[]>([]);

  useEffect(() => {
    if (thumbs) setRot(thumbs.map(() => 0));
  }, [thumbs]);

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const rotateAll = (delta: number) => setRot((r) => r.map((x) => norm(x + delta)));
  const rotateOne = (i: number) => setRot((r) => r.map((x, j) => (j === i ? norm(x + 90) : x)));
  const unchanged = rot.every((r) => r === 0);

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>
      <div className="mb-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => rotateAll(-90)} className="flex items-center gap-2 rounded border border-gray-300 px-4 py-2">
          <RotateCcw className="h-4 w-4" aria-hidden /> Rotate all left
        </button>
        <button type="button" onClick={() => rotateAll(90)} className="flex items-center gap-2 rounded border border-gray-300 px-4 py-2">
          <RotateCw className="h-4 w-4" aria-hidden /> Rotate all right
        </button>
        <span className="self-center text-sm text-gray-500">Click a page to rotate it 90°.</span>
      </div>

      {thumbs ? (
        <PageGrid thumbs={thumbs} rotationOf={(i) => rot[i] ?? 0} onPageClick={rotateOne} />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || unchanged}
          onClick={() => run('rotate', { rotations: rot })}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Rotating…' : 'ROTATE PDF'}
        </button>
      </div>
    </div>
  );
}
```

Add the import and the map entry to `web/src/components/workspaces/index.ts`:
```ts
import { RotateWorkspace } from './RotateWorkspace';
```
```ts
  'rotate-pdf': RotateWorkspace,
```

- [ ] **Step 3: Run the full suites**

```bash
cd web && npm test && npx playwright test && npm run lint
```
Expected: all unit tests PASS, all e2e specs PASS in all 3 browsers, and lint reports no errors.

- [ ] **Step 4: Commit**

```bash
git add -A web
git commit -m "feat(web): add rotate workspace"
```

---

### Task 12: Docker Compose deployment and Makefile

**Files:**
- Create: `web/Dockerfile`, `web/.dockerignore`, `docker-compose.yml`, `Makefile`

**Interfaces:**
- Consumes: `output: 'standalone'` from Task 1
- Produces: `docker compose up -d --build` serves the site on host port 3000, which is the target for the owner's `cloudflared` tunnel. Plan 3 extends this compose file with `api`, `worker`, `redis`, and `sweeper`.

- [ ] **Step 1: Write the Docker files**

Create `web/.dockerignore`:
```
node_modules
.next
e2e
tests
test-results
playwright-report
Dockerfile
.dockerignore
```

Create `web/Dockerfile`:
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

Note: `web/public/` must exist for the `COPY` to succeed. If Task 7 left it empty, create `web/public/.gitkeep`.

Create `docker-compose.yml`:
```yaml
services:
  web:
    build: ./web
    ports:
      - "3000:3000"
    restart: unless-stopped
```

Create `Makefile` (recipe lines are indented with a TAB):
```makefile
.PHONY: test test-unit test-e2e up down

test: test-unit test-e2e

test-unit:
	cd web && npm test

test-e2e:
	cd web && npx playwright test

up:
	docker compose up -d --build

down:
	docker compose down
```

- [ ] **Step 2: Build and smoke-test the container**

```bash
touch web/public/.gitkeep
docker compose up -d --build
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/merge-pdf
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/not-a-tool
docker compose down
```
Expected: `200`, `200`, `404`.

- [ ] **Step 3: Commit**

```bash
git add web/Dockerfile web/.dockerignore web/public/.gitkeep docker-compose.yml Makefile
git commit -m "build: add web Dockerfile, compose, and Makefile"
```

---

## Done criteria for Plan 1

- `make test` (or `cd web && npm test && npx playwright test`) is all green in chromium, firefox, and webkit.
- `docker compose up -d --build` serves `/`, `/merge-pdf`, `/split-pdf`, and `/rotate-pdf` on `:3000`. The other 11 tools show "coming soon".
- Pointing `cloudflared` at `http://<host>:3000` exposes the site. No other port is needed.
