# Plan 3 — Crop + Server Tools (Compress, Office→PDF, PDF→Word) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the last six tools, so all 15 work end to end:
- **Crop PDF** — browser-only. It was added to the spec at the user's request.
- **Five server tools:** Compress, Word→PDF, Excel→PDF, PowerPoint→PDF and PDF→Word, backed by a FastAPI + Redis/RQ + LibreOffice/Ghostscript/pdf2docx stack in Docker Compose.

**Architecture:**
- **Crop** is one more pdf-lib engine in the existing worker. It sets each page's CropBox through the Plan 2 visual-space geometry.
- **Server tools** follow spec §3–§4 and §8:
  - `web` proxies `/api/*` to a FastAPI `api` service.
  - `api` validates uploads, stores them under `/data/jobs/<id>/`, and enqueues an RQ job in `redis`.
  - A network-less `worker` runs the converter in a killable process group.
  - A `sweeper` deletes job directories after 1 hour.
- **The browser** uploads, polls every second, downloads the result into memory, and then deletes the job straight away.

**Tech Stack:**
- **Web:** unchanged from Plans 1–2.
- **Server:** Python 3.12 (`python:3.12-slim-bookworm`), with these exact pins:

  | Package | Version |
  |---|---|
  | fastapi | 0.143.0 |
  | uvicorn | 0.54.0 |
  | python-multipart | 0.0.32 |
  | redis | 8.1.0 |
  | rq | 2.12.0 |
  | pdf2docx | 0.5.13 |
  | PyMuPDF | 1.28.2 |

  - **Dev pins:** pytest 9.1.1, httpx 0.28.1, fakeredis 2.39.0, python-docx 1.2.0, openpyxl 3.1.5, python-pptx 1.0.2.
  - **System packages:** Debian bookworm LibreOffice (writer/calc/impress), Ghostscript, and fonts (DejaVu, Liberation, Noto CJK).
  - **Redis:** `redis:7.4-alpine`.

**Spec:** `docs/superpowers/specs/2026-10-13-pdf-editor-design.md` (Task 1 amends it to add Crop as tool 15).

### Plan series

| Plan | Scope | Status |
|---|---|---|
| 1 | Scaffold, site chrome, tool shell, worker RPC, Merge, Split, Rotate, Docker `web` | done |
| 2 | JPG/PNG→PDF, PDF→JPG/PNG, Watermark, Sign, Edit | done |
| **3 (this)** | Crop PDF; server stack; Compress, Word/Excel/PowerPoint→PDF, PDF→Word | to execute |

### Deliberate refinements of the spec (apply everywhere)

- **Crop PDF is tool 15.** The user asked for it after Plan 2, and Task 1 writes it into the spec.
  - The user drags a box over a page preview, then applies it to all pages or just the current one.
  - It sets the PDF CropBox, so content outside the box is hidden, not deleted. The UI says so; this is not redaction.
- **No "Delete now" button.** The browser deletes the job automatically as soon as the result is in memory, or as soon as the job fails. This is stricter than the spec's button. The result panel says "Your uploaded file has been deleted from our server."
- **One `server/Dockerfile` with targets `api`, `worker` and `test`** replaces the spec's `Dockerfile.api` and `Dockerfile.worker`.
  - All targets share one base layer and one non-root uid (10001), so the shared `/data/jobs` volume is writable by both.
  - The sweeper reuses the `api` image.
- **Uploaded files are stored as `in/input<ext>`, never under the user's name.**
  - The original name is reduced to a safe display base (Unicode letters kept), stored in `meta.json`, and used only for the download's `Content-Disposition`.
  - This is stricter than the spec's "sanitized basename".
- **Job status uses `meta.json` plus the RQ job.**
  - If the job directory is gone (deleted or swept), every endpoint answers 404 `NOT_FOUND`. The browser shows this as "This job has expired".
- **New client error codes:**

  | Code | Shown to user |
  |---|---|
  | `INVALID_DOCUMENT` | "This file isn't a valid Word, Excel or PowerPoint file" |
  | `RATE_LIMITED` | "Too many files in a short time — please wait a few minutes" |
  | `BUSY` | "Our converter is busy right now — please try again in a minute" |
  | `TIMEOUT` | "This file took too long to convert" |
  | `CONVERSION_FAILED` | "We couldn't convert this file" |
  | `EXPIRED` | "This job has expired — please upload the file again" |
  | `NETWORK` | "Couldn't reach the server — check your connection and try again" |

  - Office files are sniffed in the browser at selection time: OLE magic for `.doc/.xls/.ppt`, ZIP magic for `.docx/.xlsx/.pptx`.
  - This also fixes Plan 2's deferred minor: "validate treats every non-PDF as an image".
- **The rate limit is configurable** with `PDFTOOLS_RATE_LIMIT` (default 20 per 10 minutes, as in the spec). It is raised only for the server e2e run.
- **The compress result note** comes from the client:
  - "Reduced from 12.0 MB to 3.1 MB (−74%)." when the file shrank;
  - otherwise the server's "already well compressed" notice, and the original file is returned.
- **Compress output name:** `<base>-compressed.pdf`. Office tools produce `<base>.pdf`; PDF→Word produces `<base>.docx`.

## Global Constraints

- Web code lives in `web/` and server code in `server/`. Commands run from the repo root `C:\Users\IGS\VsCodeProjects\pdf-editor` unless they start with `cd web` or `cd server`.
- Work on branch `feat/plan-3-server-tools` cut from `master`.
- Max upload is 50 MB (`MAX_BYTES = 50 * 1024 * 1024` on both sides). There is one file per server job.
- Limits:
  - Rate limit: 20 jobs per 10 minutes per client IP (`CF-Connecting-IP`, falling back to the socket peer).
  - Queue cap: more than 50 queued jobs returns `503 BUSY`.
  - Jobs are deleted no later than 1 hour after upload; the sweeper runs every 10 minutes.
- Converter timeouts:

  | Converter | Timeout |
  |---|---|
  | LibreOffice | 90 s |
  | Ghostscript | 60 s |
  | pdf2docx | 120 s |

  On timeout the whole process group is killed.
- Compose limits and isolation:
  - Only `web:3000` is published.
  - `worker` and `redis` live on an `internal: true` network, so the worker has no outbound access.
  - The worker is capped at 2 CPU and 2 GB.
  - Every Python container runs as non-root uid 10001.
- Converter safety:
  - Ghostscript always runs with `-dSAFER`.
  - LibreOffice gets a fresh `-env:UserInstallation` profile per job, deleted afterwards.
- Logs carry the job id, tool, input size, duration and status — never file contents or file names.
- HTTP errors use the body `{"error": {"code": ..., "message": ...}}`, with the spec §7 status codes (400/413/429/503/404).
- Copy rules from Plans 1–2 still apply. In particular, `INVALID_FILE` keeps the exact text "This file isn't a valid PDF".
- Every engine and client helper throws `PdfToolError(code, message)`.
- E2E runs on chromium, firefox and webkit. Server-tool e2e runs against `docker compose up` (spec §9).
- The commit footer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Uploads larger than 10 MB through `web`.** Next's rewrite proxy forwards request bodies through a clone capped at `experimental.middlewareClientMaxBodySize` (10 MB by default). Without raising it, files over 10 MB are silently truncated, and the API then answers 400. A 12 MB file must convert. Pinned by the Task 7 compose smoke test (12 MB `curl` upload) and the Task 9 compress e2e (12 MB file).
2. **The job vanishes mid-flow** (swept, deleted, or the server restarted). The API answers 404, and the browser shows "This job has expired" instead of hanging or "Something went wrong". Pinned by the Task 5 API test (404 after the sweeper runs) and the Task 8 unit test (404 while polling).
3. **Hostile or odd upload names and bytes:**
   - `../../etc/passwd.pdf`, Windows paths and CJK names;
   - wrong magic bytes behind a correct extension;
   - an empty file.

   No path is ever built from the name, the download name is safe, and invalid bytes get `400 INVALID_FILE` with the job directory removed. Pinned by the Task 4 validation tests and the Task 5 API tests.
4. **A converter that hangs** is killed together with its children at the timeout, and the job reports `TIMEOUT`. Pinned by the Task 6 integration test (sleeping child process killed).
5. **Compress makes the file bigger** (an already-optimised PDF). The original comes back unchanged, with the "already well compressed" notice. Pinned by the Task 6 runner unit test and integration test.

---

## File Structure

```
docs/superpowers/specs/2026-10-13-pdf-editor-design.md   Task 1 (modify) Crop = tool 15
docker-compose.yml                                       Task 7 (modify) web, api, worker, redis, sweeper
Makefile                                                 Task 7 (modify) server + server-e2e targets
.gitignore                                               Task 4 (modify) python artefacts
server/
  requirements-api.txt, requirements-worker.txt, requirements-dev.txt, pyproject.toml   Task 4
  Dockerfile, .dockerignore                              Task 7
  scripts/make_fixtures.py                               Task 9
  pdftools/
    __init__.py, config.py, errors.py, validation.py, storage.py, ratelimit.py, sweeper.py   Task 4
    api.py, jobqueue.py                                  Task 5 (api), Task 6 (RQ queue)
    runner.py, worker.py                                 Task 6
    handlers/__init__.py, proc.py, office.py, compress.py, pdfcheck.py, pdf_to_word.py, pdf2docx_cli.py   Task 6
  tests/
    test_validation.py, test_storage.py, test_ratelimit.py, test_sweeper.py   Task 4
    test_api.py                                          Task 5
    test_runner.py, test_handlers_integration.py         Task 6
web/
  next.config.ts                                         Task 7 (modify) /api rewrite + body limit
  playwright.config.ts                                   Task 9 (modify) ignore e2e/server
  playwright.server.config.ts                            Task 9
  src/lib/pdf/crop.ts, src/lib/cropRect.ts               Tasks 1, 2
  src/lib/api/jobs.ts                                    Task 8
  src/lib/pdf/run.ts, errors.ts, engines.ts, types.ts    Tasks 1, 3, 8 (modify)
  src/components/crop/CropOverlay.tsx                    Task 2
  src/components/workspaces/CropWorkspace.tsx            Task 2
  src/components/workspaces/ServerWorkspaces.tsx         Task 9
  src/components/ResultPanel.tsx, ToolShell.tsx, ToolIcon.tsx, workspaces/index.ts   Tasks 2, 3, 8, 9
  src/tools.ts                                           Tasks 2, 9
  tests/crop.test.ts, cropRect.test.ts, jobs.test.ts     Tasks 1, 2, 8
  e2e/crop.spec.ts                                       Task 2
  e2e/server/*.spec.ts, e2e/server/fixtures/*            Task 9
```

---

### Task 1: Spec amendment and the `crop` engine

**Files:**
- Modify:
  - `docs/superpowers/specs/2026-10-13-pdf-editor-design.md`
  - `web/src/lib/pdf/engines.ts`
  - `web/tests/engines.test.ts`
- Create: `web/src/lib/pdf/crop.ts`
- Test: `web/tests/crop.test.ts`

**Interfaces:**
- Consumes: `visualSize`, `visualToUser`, `apply`, `Box` (`web/src/lib/pdf/geometry.ts`); `loadPdf`, `single`, `baseName`.
- Produces:
  - `type CropRect = { x: number; y: number; w: number; h: number }`: fractions (0–1) of the page as displayed, with the origin at the top-left
  - `type CropOptions = { rect: CropRect; pages: number[] | 'all' }`
  - `MIN_CROP = 0.02`
  - `cropBoxFor(box: Box, rotation: number, rect: CropRect): Box`
  - `crop: Engine<CropOptions>`, registered as `'crop'`, producing `<base>-cropped.pdf`

- [ ] **Step 1: Amend the spec**

In `docs/superpowers/specs/2026-10-13-pdf-editor-design.md`:
- In §1 Success criteria, change "All 14 tools work end-to-end" to "All 15 tools work end-to-end".
- Change the heading `## 2. Tools (14)` to `## 2. Tools (15)`, and add this row to the table after the `Sign PDF` row:

```
| Edit | Crop PDF | `crop-pdf` | client |
```

- In §3, change "the browser handles 10 tools locally" to "the browser handles 10 tools locally (11 with Crop)".
- In §5 Tool behavior, add after the **Sign** bullet:

```
- **Crop**: the user drags a crop box over a page preview (corner handles resize it, dragging the box moves it) and applies it to all pages or only the current page. The engine sets each page's CropBox, so the area outside the box is hidden in every viewer but remains in the file; the UI states that this is not redaction. Output: `<name>-cropped.pdf`.
```

- In §9 Testing, change "one happy path per tool (14 in total)" to "one happy path per tool (15 in total)".

- [ ] **Step 2: Write the failing tests**

`web/tests/crop.test.ts`:

```ts
import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import { crop, cropBoxFor, type CropOptions } from '@/lib/pdf/crop';
import { input, makePdf } from './helpers';

const boxOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => {
    const b = p.getCropBox();
    return [b.x, b.y, b.width, b.height].map((n) => +n.toFixed(2));
  });

test('cropBoxFor: an unrotated page maps the fractions directly (top-left origin)', () => {
  expect(cropBoxFor({ x: 0, y: 0, width: 200, height: 300 }, 0, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toEqual({
    x: 20, y: 120, width: 100, height: 150,
  });
});

test('cropBoxFor: on a /Rotate 90 page the displayed top-left quarter is the user-space bottom-left', () => {
  // Displayed page is 300×200; its top-left quarter is visual x 0-150, y 100-200.
  expect(cropBoxFor({ x: 0, y: 0, width: 200, height: 300 }, 90, { x: 0, y: 0, w: 0.5, h: 0.5 })).toEqual({
    x: 0, y: 0, width: 100, height: 150,
  });
});

test('cropBoxFor: the whole page keeps an offset box unchanged', () => {
  expect(cropBoxFor({ x: 50, y: 60, width: 200, height: 300 }, 0, { x: 0, y: 0, w: 1, h: 1 })).toEqual({
    x: 50, y: 60, width: 200, height: 300,
  });
});

const RECT = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

test('crop all pages', async () => {
  const [out] = await crop([input('doc.pdf', await makePdf(2))], { rect: RECT, pages: 'all' });
  expect(out.name).toBe('doc-cropped.pdf');
  expect(await boxOf(out.bytes)).toEqual([[20, 30, 160, 240], [20, 30, 160, 240]]);
});

test('crop only the chosen pages', async () => {
  const [out] = await crop([input('doc.pdf', await makePdf(3))], { rect: RECT, pages: [1] });
  expect(await boxOf(out.bytes)).toEqual([[0, 0, 200, 300], [20, 30, 160, 240], [0, 0, 200, 300]]);
});

test('crop is relative to the existing crop box', async () => {
  const [out] = await crop([input('o.pdf', await makePdf(1, { mediaBox: [50, 60, 200, 300] }))], { rect: RECT, pages: 'all' });
  expect(await boxOf(out.bytes)).toEqual([[70, 90, 160, 240]]);
});

test('typed errors', async () => {
  const doc = input('doc.pdf', await makePdf(2));
  const bad = (opts: CropOptions) => expect(crop([doc], opts)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await bad({ rect: { x: 0, y: 0, w: 0, h: 0.5 }, pages: 'all' });
  await bad({ rect: { x: 0.6, y: 0, w: 0.5, h: 0.5 }, pages: 'all' });
  await bad({ rect: { x: -0.1, y: 0, w: 0.5, h: 0.5 }, pages: 'all' });
  await bad({ rect: RECT, pages: [5] });
  await bad({ rect: RECT, pages: [] });
});
```

In `web/tests/engines.test.ts`, change the registry list to `['annotate', 'crop', 'imageToPdf', 'merge', 'rotate', 'split', 'validate', 'watermark']`.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd web && npx vitest run tests/crop.test.ts tests/engines.test.ts`
Expected: FAIL, because `@/lib/pdf/crop` cannot be resolved and the registry lacks `crop`.

- [ ] **Step 4: Implement `web/src/lib/pdf/crop.ts`**

```ts
import { PdfToolError } from './errors';
import { apply, visualSize, visualToUser, type Box } from './geometry';
import { baseName, loadPdf, single } from './load';
import { PDF_MIME, type Engine } from './types';

/** Fractions (0-1) of the page as displayed; origin top-left, like the editor's view space. */
export type CropRect = { x: number; y: number; w: number; h: number };
export type CropOptions = { rect: CropRect; pages: number[] | 'all' };

/** Smallest crop, as a fraction of the page side. */
export const MIN_CROP = 0.02;
const EPS = 1e-6;

function bad(message: string): never {
  throw new PdfToolError('BAD_OPTIONS', message);
}

/** The new CropBox (user space) for a page whose current CropBox is `box` and /Rotate is `rotation`. */
export function cropBoxFor(box: Box, rotation: number, rect: CropRect): Box {
  const { width: W, height: H } = visualSize(box, rotation);
  const m = visualToUser(box, rotation);
  const [ax, ay] = apply(m, rect.x * W, H - (rect.y + rect.h) * H);
  const [bx, by] = apply(m, (rect.x + rect.w) * W, H - rect.y * H);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

export const crop: Engine<CropOptions> = async (inputs, { rect, pages }) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  const values = [rect.x, rect.y, rect.w, rect.h];
  if (
    !values.every(Number.isFinite) ||
    rect.x < -EPS || rect.y < -EPS ||
    rect.w < MIN_CROP || rect.h < MIN_CROP ||
    rect.x + rect.w > 1 + EPS || rect.y + rect.h > 1 + EPS
  ) {
    bad('The crop area must be inside the page');
  }
  const total = doc.getPageCount();
  const targets = pages === 'all' ? doc.getPageIndices() : [...new Set(pages)];
  if (targets.length === 0 || targets.some((p) => !Number.isInteger(p) || p < 0 || p >= total)) {
    bad(`Pages to crop must be within 1-${total}`);
  }
  for (const index of targets) {
    const page = doc.getPage(index);
    const b = cropBoxFor(page.getCropBox(), page.getRotation().angle, rect);
    page.setCropBox(b.x, b.y, b.width, b.height);
  }
  return [{ name: `${baseName(file.name)}-cropped.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};
```

In `web/src/lib/pdf/engines.ts`, add `import { crop } from './crop';` and append `crop` to the `engines` object.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/crop.test.ts tests/engines.test.ts && npx tsc --noEmit`
Expected: PASS (7 crop tests plus the engines tests); tsc is clean.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-13-pdf-editor-design.md web/src/lib/pdf/crop.ts web/src/lib/pdf/engines.ts web/tests/crop.test.ts web/tests/engines.test.ts
git commit -m "feat(web): add crop engine and amend spec with Crop PDF as tool 15

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Crop workspace (tool goes live, 15 tools)

**Files:**
- Create:
  - `web/src/lib/cropRect.ts`
  - `web/src/components/crop/CropOverlay.tsx`
  - `web/src/components/workspaces/CropWorkspace.tsx`
  - `web/e2e/crop.spec.ts`
- Modify:
  - `web/src/tools.ts`
  - `web/src/components/ToolIcon.tsx`
  - `web/src/components/workspaces/index.ts`
  - `web/tests/tools.test.ts`
  - `web/e2e/home.spec.ts`
  - `web/e2e/tool-shell.spec.ts`
- Test: `web/tests/cropRect.test.ts`, `web/e2e/crop.spec.ts`

**Interfaces:**
- Consumes:
  - `CropRect`, `CropOptions` and engine `'crop'` (Task 1)
  - `usePdfRenderer` and `PageView` (Plan 2)
- Produces:
  - `type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'`
  - `DEFAULT_CROP: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }`
  - `moveCrop(start: CropRect, handle: CropHandle, dx: number, dy: number): CropRect`, which keeps the box inside the page and at least `MIN_CROP` in size
  - `CropOverlay({ rect, onChange, disabled })`, with test ids `crop-box` and `crop-handle-nw|ne|sw|se`
  - `CropWorkspace`, mapped under `'crop-pdf'`
  - the tool `crop-pdf` (group `edit`, client, available)

- [ ] **Step 1: Write the failing tests**

`web/tests/cropRect.test.ts`:

```ts
import { expect, test } from 'vitest';
import { DEFAULT_CROP, moveCrop } from '@/lib/cropRect';

const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
const close = (a: object, b: Record<string, number>) => {
  for (const [k, v] of Object.entries(b)) expect((a as Record<string, number>)[k]).toBeCloseTo(v);
};

test('move keeps the size and stays inside the page', () => {
  close(moveCrop(r, 'move', 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.5, h: 0.5 });
  close(moveCrop(r, 'move', 0.9, 0.9), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  close(moveCrop(r, 'move', -0.9, -0.9), { x: 0, y: 0, w: 0.5, h: 0.5 });
});

test('corner handles resize from the opposite corner', () => {
  close(moveCrop(r, 'nw', -0.1, -0.1), { x: 0.1, y: 0.1, w: 0.6, h: 0.6 });
  close(moveCrop(r, 'se', 0.1, 0.2), { x: 0.2, y: 0.2, w: 0.6, h: 0.7 });
  close(moveCrop(r, 'ne', 0.1, 0.1), { x: 0.2, y: 0.3, w: 0.6, h: 0.4 });
  close(moveCrop(r, 'sw', 0.1, 0.1), { x: 0.3, y: 0.2, w: 0.4, h: 0.6 });
});

test('resizing clamps to the page and to the minimum size', () => {
  close(moveCrop(r, 'se', 1, 1), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
  const tiny = moveCrop(r, 'nw', 1, 1);
  expect(tiny.w).toBeCloseTo(0.02);
  expect(tiny.x + tiny.w).toBeCloseTo(0.7);
});

test('default crop is an inset box', () => {
  expect(DEFAULT_CROP).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
});
```

`web/e2e/crop.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { pdfUpload, readDownload } from './fixtures';

// The page preview renders ~960 px tall; keep the crop handles inside the viewport.
test.use({ viewport: { width: 1280, height: 1600 } });

async function open(page: Page, pages: number) {
  await page.goto('/crop-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('doc.pdf', pages, [400, 500])]);
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

async function cropBoxes(page: Page) {
  await page.getByRole('button', { name: 'CROP PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-cropped.pdf');
  const doc = await PDFDocument.load(await readDownload(download));
  return doc.getPages().map((p) => Math.round(p.getCropBox().width));
}

test('default box crops every page', async ({ page }) => {
  await open(page, 2);
  expect(await cropBoxes(page)).toEqual([320, 320]);
});

test('dragging a corner and cropping only the current page', async ({ page }) => {
  await open(page, 2);
  await page.getByRole('button', { name: 'Next page' }).click();
  const handle = page.getByTestId('crop-handle-nw');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 100, h.y + h.height / 2 + 50, { steps: 5 });
  await page.mouse.up();
  await page.getByLabel('Crop this page only').check();
  const [first, second] = await cropBoxes(page);
  expect(first).toBe(400);
  expect(second).toBeLessThan(300);
});
```

In `web/tests/tools.test.ts`, replace the first two tests with:

```ts
test('registry has the 15 spec tools with unique slugs', () => {
  expect(TOOLS).toHaveLength(15);
  expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(15);
  expect(TOOLS.map((t) => t.slug).sort()).toEqual(
    [
      'compress-pdf', 'crop-pdf', 'edit-pdf', 'excel-to-pdf', 'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png',
      'pdf-to-word', 'powerpoint-to-pdf', 'rotate-pdf', 'sign-pdf', 'split-pdf', 'watermark-pdf', 'word-to-pdf',
    ],
  );
});
```

and change the `enabled tools` list to:

```ts
    'crop-pdf', 'edit-pdf', 'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png', 'rotate-pdf', 'sign-pdf', 'split-pdf', 'watermark-pdf',
```

In `web/e2e/home.spec.ts`, rename the test to `home shows hero dropzone and every tool` and replace `toHaveCount(14)` with `toHaveCount(TOOLS.length)`. In `web/e2e/tool-shell.spec.ts`, add `import { TOOLS } from '../src/tools';` and replace `toHaveCount(14)` with `toHaveCount(TOOLS.length)`.

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `cd web && npx vitest run tests/cropRect.test.ts tests/tools.test.ts`
Expected: FAIL, because `@/lib/cropRect` cannot be resolved and the registry has 14 tools.

- [ ] **Step 3: Implement `web/src/lib/cropRect.ts`**

```ts
import { MIN_CROP, type CropRect } from './pdf/crop';

export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const DEFAULT_CROP: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Applies a drag of (dx, dy) page fractions to `start`, keeping the box inside the page and at least MIN_CROP. */
export function moveCrop(start: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle === 'nw' || handle === 'sw') left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle === 'ne' || handle === 'se') right = clamp(right + dx, left + MIN_CROP, 1);
  if (handle === 'nw' || handle === 'ne') top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle === 'sw' || handle === 'se') bottom = clamp(bottom + dy, top + MIN_CROP, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}
```

Run: `cd web && npx vitest run tests/cropRect.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Implement `web/src/components/crop/CropOverlay.tsx`**

```tsx
'use client';

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { moveCrop, type CropHandle } from '@/lib/cropRect';
import type { CropRect } from '@/lib/pdf/crop';

const CORNERS: { id: Exclude<CropHandle, 'move'>; cls: string; cursor: string }[] = [
  { id: 'nw', cls: '-left-2 -top-2', cursor: 'cursor-nwse-resize' },
  { id: 'ne', cls: '-right-2 -top-2', cursor: 'cursor-nesw-resize' },
  { id: 'sw', cls: '-bottom-2 -left-2', cursor: 'cursor-nesw-resize' },
  { id: 'se', cls: '-bottom-2 -right-2', cursor: 'cursor-nwse-resize' },
];

interface Drag {
  handle: CropHandle;
  start: CropRect;
  x: number;
  y: number;
}

/** A movable, resizable crop box over a page preview. The parent must be `relative overflow-hidden`. */
export function CropOverlay({ rect, onChange, disabled = false }: { rect: CropRect; onChange: (r: CropRect) => void; disabled?: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  // Each move is computed from the box at pointerdown, so no update depends on a stale render.
  const drag = useRef<Drag | null>(null);

  const down = (handle: CropHandle) => (e: ReactPointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    drag.current = { handle, start: rect, x: e.clientX, y: e.clientY };
    try {
      layer.current?.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone; the drag still ends on pointerup.
    }
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const box = layer.current?.getBoundingClientRect();
    if (!d || !box) return;
    onChange(moveCrop(d.start, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height));
  };
  const up = () => {
    drag.current = null;
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div ref={layer} className="absolute inset-0 touch-none" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div
        data-testid="crop-box"
        onPointerDown={down('move')}
        className={`absolute border-2 border-dashed border-white ${disabled ? '' : 'cursor-move'}`}
        style={{
          left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h),
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)', outline: '1px solid rgba(0, 0, 0, 0.6)',
        }}
      >
        {CORNERS.map((c) => (
          <div
            key={c.id}
            data-testid={`crop-handle-${c.id}`}
            onPointerDown={down(c.id)}
            className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-brand ${c.cls} ${c.cursor}`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `web/src/components/workspaces/CropWorkspace.tsx`**

```tsx
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_CROP } from '@/lib/cropRect';
import type { CropOptions, CropRect } from '@/lib/pdf/crop';
import { usePdfRenderer } from '@/lib/pdf/usePdfRenderer';
import { CropOverlay } from '../crop/CropOverlay';
import { PageView } from '../editor/PageView';
import { ErrorCard } from '../ErrorCard';
import type { WorkspaceProps } from '.';

export function CropWorkspace({ inputs, onInputsChange, run, busy }: WorkspaceProps) {
  const file = inputs[0];
  const { renderer, sizes, error } = usePdfRenderer(file);
  const [page, setPage] = useState(0);
  const [rect, setRect] = useState<CropRect>(DEFAULT_CROP);
  const [scope, setScope] = useState<'all' | 'page'>('all');

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const crop = () => {
    const opts: CropOptions = { rect, pages: scope === 'all' ? 'all' : [page] };
    run('crop', opts);
  };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>
      {renderer && sizes ? (
        <>
          {sizes.length > 1 && (
            <div className="mb-3 flex items-center justify-center gap-4 text-sm">
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span>
                Page {page + 1} of {sizes.length}
              </span>
              <button type="button" aria-label="Next page" disabled={page === sizes.length - 1} onClick={() => setPage(page + 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
          <div
            className="relative mx-auto w-full max-w-3xl overflow-hidden border border-gray-200 shadow-sm"
            style={{ aspectRatio: `${sizes[page].width} / ${sizes[page].height}` }}
          >
            <PageView renderer={renderer} index={page} size={sizes[page]} />
            <CropOverlay rect={rect} onChange={setRect} disabled={busy} />
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <fieldset className="mt-5 flex flex-wrap gap-6">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Apply to</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="crop-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
          Crop all pages
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="crop-scope" checked={scope === 'page'} onChange={() => setScope('page')} />
          Crop this page only
        </label>
      </fieldset>
      <p className="mt-3 text-xs text-gray-500">
        Cropping hides everything outside the box in every PDF viewer, but the hidden content stays in the file — it is not
        redaction.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={busy} onClick={() => setRect(DEFAULT_CROP)} className="text-sm underline disabled:opacity-50">
          Reset box
        </button>
        <button
          type="button"
          disabled={busy || !sizes}
          onClick={crop}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Cropping…' : 'CROP PDF'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register the tool, the icon and the workspace**

In `web/src/tools.ts`, add this entry directly after the `rotate-pdf` entry:

```ts
  { slug: 'crop-pdf', title: 'Crop PDF', subtitle: 'Trim margins or keep just part of a page', group: 'edit', accept: PDF, multiple: false, engine: 'client', available: true },
```

In `web/src/components/ToolIcon.tsx`, add `Crop` to the lucide import and `'crop-pdf': Crop,` to `ICONS`. In `web/src/components/workspaces/index.ts`, import `CropWorkspace` and add `'crop-pdf': CropWorkspace,`.

- [ ] **Step 7: Run unit tests, types, lint and e2e**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/crop.spec.ts e2e/home.spec.ts e2e/tool-shell.spec.ts`
Expected:
- all unit tests pass;
- tsc and lint are clean;
- e2e reports 21 passed (7 tests × 3 browsers).

The second crop test drags the top-left handle 100 px right on a ~768 px-wide preview of a 400 pt page, which crops roughly 52 pt. The current page is page 2, so the result is `[400, <300]`.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/cropRect.ts web/src/components/crop web/src/components/workspaces web/src/components/ToolIcon.tsx web/src/tools.ts web/tests/cropRect.test.ts web/tests/tools.test.ts web/e2e/crop.spec.ts web/e2e/home.spec.ts web/e2e/tool-shell.spec.ts
git commit -m "feat(web): enable Crop PDF with a draggable crop box

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client groundwork for server tools — error codes, Office sniffing, result notes

**Files:**
- Modify:
  - `web/src/lib/pdf/errors.ts`
  - `web/src/lib/pdf/engines.ts`
  - `web/src/lib/pdf/types.ts`
  - `web/src/components/ResultPanel.tsx`
  - `web/tests/engines.test.ts`
  - `web/tests/errors.test.ts`
- Test: `web/tests/engines.test.ts`, `web/tests/errors.test.ts`

**Interfaces:**
- Consumes: `extensionOf`, `readImageInfo`.
- Produces:
  - `ErrorCode` gains `'INVALID_DOCUMENT' | 'RATE_LIMITED' | 'BUSY' | 'TIMEOUT' | 'CONVERSION_FAILED' | 'EXPIRED' | 'NETWORK'`, with the copy from "Deliberate refinements"
  - `OutputFile.note?: string`, which ResultPanel shows as `data-testid="result-note"`
  - `validate`:
    - parses PDFs;
    - sniffs `.jpg/.jpeg/.png` as images;
    - checks OLE magic for `.doc/.xls/.ppt` and ZIP magic for `.docx/.xlsx/.pptx`, throwing `INVALID_DOCUMENT`;
    - rejects any other extension with `UNSUPPORTED_TYPE`

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/engines.test.ts`:

```ts
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const bytes = (head: number[]) => Uint8Array.from([...head, 0, 0, 0, 0]);

test('validate accepts Office files with the right container magic', async () => {
  const files = [
    input('a.docx', bytes(ZIP)), input('b.xlsx', bytes(ZIP)), input('c.pptx', bytes(ZIP)),
    input('d.doc', bytes(OLE)), input('e.xls', bytes(OLE)), input('f.ppt', bytes(OLE)),
  ];
  expect(await engines.validate(files, {})).toEqual([]);
});

test('validate rejects Office files with the wrong bytes as INVALID_DOCUMENT', async () => {
  await expect(engines.validate([input('x.docx', bytes(OLE))], {})).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  await expect(engines.validate([input('y.doc', new TextEncoder().encode('hello'))], {})).rejects.toMatchObject({
    code: 'INVALID_DOCUMENT',
  });
});

test('validate rejects unknown extensions instead of treating them as images', async () => {
  await expect(engines.validate([input('z.txt', new TextEncoder().encode('hi'))], {})).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  });
});
```

Append to `web/tests/errors.test.ts`:

```ts
test('server-tool copy', () => {
  expect(ERROR_MESSAGES.INVALID_DOCUMENT).toBe("This file isn't a valid Word, Excel or PowerPoint file");
  expect(ERROR_MESSAGES.RATE_LIMITED).toBe('Too many files in a short time — please wait a few minutes');
  expect(ERROR_MESSAGES.BUSY).toBe('Our converter is busy right now — please try again in a minute');
  expect(ERROR_MESSAGES.TIMEOUT).toBe('This file took too long to convert');
  expect(ERROR_MESSAGES.CONVERSION_FAILED).toBe("We couldn't convert this file");
  expect(ERROR_MESSAGES.EXPIRED).toBe('This job has expired — please upload the file again');
  expect(ERROR_MESSAGES.NETWORK).toBe("Couldn't reach the server — check your connection and try again");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/engines.test.ts tests/errors.test.ts`
Expected: FAIL. The Office files are rejected as `INVALID_IMAGE`, `z.txt` gives `INVALID_IMAGE`, and the new messages are undefined.

- [ ] **Step 3: Implement**

In `web/src/lib/pdf/errors.ts`, extend `ErrorCode`, after `'INVALID_IMAGE'`, with:

```ts
  | 'INVALID_DOCUMENT'
  | 'RATE_LIMITED'
  | 'BUSY'
  | 'TIMEOUT'
  | 'CONVERSION_FAILED'
  | 'EXPIRED'
  | 'NETWORK'
```

and add to `ERROR_MESSAGES`, after `INVALID_IMAGE`:

```ts
  INVALID_DOCUMENT: "This file isn't a valid Word, Excel or PowerPoint file",
  RATE_LIMITED: 'Too many files in a short time — please wait a few minutes',
  BUSY: 'Our converter is busy right now — please try again in a minute',
  TIMEOUT: 'This file took too long to convert',
  CONVERSION_FAILED: "We couldn't convert this file",
  EXPIRED: 'This job has expired — please upload the file again',
  NETWORK: "Couldn't reach the server — check your connection and try again",
```

In `web/src/lib/pdf/engines.ts`, replace the `validate` definition with:

```ts
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png'];
const OLE_EXTS = ['.doc', '.xls', '.ppt'];
const ZIP_EXTS = ['.docx', '.xlsx', '.pptx'];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

/**
 * Checks every input at selection time: PDFs are parsed (ENCRYPTED / INVALID_FILE), images sniffed
 * (INVALID_IMAGE), Office files checked for their container format (INVALID_DOCUMENT). The server
 * re-validates Office uploads.
 */
const validate: Engine<Record<string, never>> = async (inputs) => {
  for (const f of inputs) {
    const ext = extensionOf(f.name);
    if (ext === '.pdf') await loadPdf(f);
    else if (IMAGE_EXTS.includes(ext)) {
      if (!readImageInfo(f.bytes)) throw new PdfToolError('INVALID_IMAGE', `${f.name} isn't a valid JPG or PNG image`);
    } else if (OLE_EXTS.includes(ext) || ZIP_EXTS.includes(ext)) {
      if (!startsWith(f.bytes, OLE_EXTS.includes(ext) ? OLE_MAGIC : ZIP_MAGIC)) {
        throw new PdfToolError('INVALID_DOCUMENT', `${f.name} isn't a valid Office document`);
      }
    } else {
      throw new PdfToolError('UNSUPPORTED_TYPE', `${f.name}: this file type isn't supported`);
    }
  }
  return [];
};
```

In `web/src/lib/pdf/types.ts`, add to `OutputFile`:

```ts
  /** Extra information shown with the result (e.g. compression savings, server deletion notice). */
  note?: string;
```

In `web/src/components/ResultPanel.tsx`, insert directly after the closing `</h2>`:

```tsx
      {outputs.some((f) => f.note) && (
        <p data-testid="result-note" className="mt-2 text-sm text-gray-600">
          {outputs.find((f) => f.note)?.note}
        </p>
      )}
```

- [ ] **Step 4: Run tests, types and lint**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint`
Expected: all unit tests pass; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/pdf/errors.ts web/src/lib/pdf/engines.ts web/src/lib/pdf/types.ts web/src/components/ResultPanel.tsx web/tests/engines.test.ts web/tests/errors.test.ts
git commit -m "feat(web): add server-tool error codes, Office file sniffing and result notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Server package core — config, validation, storage, rate limit, sweeper

**Files:**
- Create:
  - `server/requirements-api.txt`, `server/requirements-worker.txt`, `server/requirements-dev.txt`
  - `server/pyproject.toml`
  - `server/pdftools/__init__.py`, `config.py`, `errors.py`, `validation.py`, `storage.py`, `ratelimit.py`, `sweeper.py`
- Modify: `.gitignore`
- Test: `server/tests/test_validation.py`, `server/tests/test_storage.py`, `server/tests/test_ratelimit.py`, `server/tests/test_sweeper.py`

**Interfaces:**
- Consumes: nothing (first server task).
- Produces:
  - `config`:
    - settings `DATA_DIR`, `REDIS_URL`, `QUEUE_NAME`, `MAX_BYTES`, `RATE_LIMIT`, `RATE_WINDOW_S`, `QUEUE_CAP`, `JOB_MAX_AGE_S`, `SWEEP_EVERY_S`
    - `ToolSpec(extensions, timeout_s, output_suffix)`
    - `TOOLS` (keys `compress-pdf`, `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf`, `pdf-to-word`)
    - `COMPRESS_LEVELS`
  - `JobError(code, message)`
  - validation helpers: `extension_of(name) -> str`, `looks_like(ext, head: bytes) -> bool`, `display_base(name) -> str`, `OLE_MAGIC`, `ZIP_MAGIC`
  - `JobStore(root)`, with:
    - `new_id`, `valid_id`, `job_dir`, `create`
    - `input_path(id, ext)`, `find_input(id)`, `out_dir(id)`
    - `write_meta`, `read_meta`
    - `exists`, `delete`
  - `RateLimiter(redis, limit, window_s).allow(key, now=None) -> bool`
  - `sweep(root, now, max_age_s) -> int` and `sweeper.main()`

- [ ] **Step 1: Requirements, pytest config, ignore rules and a local venv**

`server/requirements-api.txt`:

```
fastapi==0.143.0
uvicorn==0.54.0
python-multipart==0.0.32
redis==8.1.0
rq==2.12.0
```

`server/requirements-worker.txt`:

```
pdf2docx==0.5.13
PyMuPDF==1.28.2
```

`server/requirements-dev.txt`:

```
pytest==9.1.1
httpx==0.28.1
fakeredis==2.39.0
python-docx==1.2.0
openpyxl==3.1.5
python-pptx==1.0.2
```

`server/pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
addopts = "-p no:cacheprovider"
```

Append to `.gitignore`:

```
# python (server/)
server/.venv/
__pycache__/
*.pyc
```

`server/pdftools/__init__.py` is empty.

Create the local venv. This is for the fast unit tests; LibreOffice and Ghostscript tests run in Docker from Task 7.

```bash
cd server && py -3 -m venv .venv && .venv/Scripts/python -m pip install -q -r requirements-api.txt -r requirements-dev.txt
```

Expected: the install finishes without errors. On Linux/macOS use `python3 -m venv .venv` and `.venv/bin/python` in every `.venv/Scripts/python` command of this plan.

- [ ] **Step 2: Write the failing tests**

`server/tests/test_validation.py`:

```python
import pytest

from pdftools.validation import OLE_MAGIC, ZIP_MAGIC, display_base, extension_of, looks_like


@pytest.mark.parametrize(
    "name,ext",
    [
        ("a.PDF", ".pdf"),
        ("x.tar.docx", ".docx"),
        ("C:\\dir\\r.XLSX", ".xlsx"),
        ("noext", ""),
        ("../../etc/passwd.pdf", ".pdf"),
        ("", ""),
    ],
)
def test_extension_of(name, ext):
    assert extension_of(name) == ext


def test_looks_like_checks_container_magic():
    assert looks_like(".pdf", b"%PDF-1.7\n")
    assert looks_like(".pdf", b"\xef\xbb\xbf junk before the header %PDF-1.4")
    assert not looks_like(".pdf", b"hello")
    assert looks_like(".docx", ZIP_MAGIC + b"rest")
    assert not looks_like(".docx", OLE_MAGIC + b"rest")
    assert looks_like(".ppt", OLE_MAGIC + b"rest")
    assert not looks_like(".xls", b"")
    assert not looks_like(".exe", b"MZ")


@pytest.mark.parametrize(
    "name,base",
    [
        ("report.pdf", "report"),
        ("../../etc/passwd.pdf", "passwd"),
        ("C:\\Users\\me\\報告 v2.docx", "報告 v2"),
        ('weird<>:"|?*name.pdf', "weird_name"),
        ("???.pdf", "document"),
        ("", "document"),
        ("a" * 300 + ".pdf", "a" * 100),
    ],
)
def test_display_base(name, base):
    assert display_base(name) == base
```

`server/tests/test_storage.py`:

```python
import pytest

from pdftools.storage import JobStore


def test_create_paths_meta_and_delete(tmp_path):
    store = JobStore(tmp_path)
    job_id = store.new_id()
    assert store.valid_id(job_id)
    store.create(job_id)
    src = store.input_path(job_id, ".pdf")
    assert src == tmp_path / job_id / "in" / "input.pdf"
    src.write_bytes(b"x")
    assert store.find_input(job_id) == src
    assert store.out_dir(job_id).is_dir()
    store.write_meta(job_id, {"a": 1})
    assert store.read_meta(job_id) == {"a": 1}
    assert store.exists(job_id)
    assert store.delete(job_id)
    assert not store.exists(job_id)
    assert store.read_meta(job_id) is None
    assert store.find_input(job_id) is None


@pytest.mark.parametrize("bad", ["../x", "a" * 32 + "/..", "", "ABCDEF" * 6, "g" * 32, "a" * 32 + "\n"])
def test_ids_that_could_escape_the_root_are_rejected(tmp_path, bad):
    store = JobStore(tmp_path)
    assert not store.valid_id(bad)
    with pytest.raises(ValueError):
        store.job_dir(bad)
    assert not store.exists(bad)
    assert not store.delete(bad)
    assert store.read_meta(bad) is None
```

`server/tests/test_ratelimit.py`:

```python
import fakeredis

from pdftools.ratelimit import RateLimiter


def test_allows_up_to_the_limit_per_key_and_window():
    limiter = RateLimiter(fakeredis.FakeRedis(), limit=3, window_s=600)
    assert [limiter.allow("1.2.3.4", now=1000) for _ in range(4)] == [True, True, True, False]
    assert limiter.allow("5.6.7.8", now=1000)
    assert limiter.allow("1.2.3.4", now=1000 + 600)


def test_window_keys_expire():
    redis = fakeredis.FakeRedis()
    RateLimiter(redis, limit=3, window_s=600).allow("k", now=0)
    [key] = redis.keys("*")
    assert 0 < redis.ttl(key) <= 600
```

`server/tests/test_sweeper.py`:

```python
import os
import time

from pdftools.sweeper import sweep


def test_sweep_removes_only_job_dirs_older_than_max_age(tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    (old / "in").mkdir(parents=True)
    (old / "in" / "input.pdf").write_bytes(b"x")
    new.mkdir()
    (tmp_path / "stray.txt").write_text("x")
    now = time.time()
    os.utime(old, (now - 4000, now - 4000))
    os.utime(new, (now - 100, now - 100))

    assert sweep(tmp_path, now, 3600) == 1
    assert not old.exists()
    assert new.exists()
    assert (tmp_path / "stray.txt").exists()


def test_sweep_tolerates_a_missing_root(tmp_path):
    assert sweep(tmp_path / "missing", time.time(), 3600) == 0
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd server && .venv/Scripts/python -m pytest -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'pdftools.validation'` (and the same for the other modules).

- [ ] **Step 4: Implement the modules**

`server/pdftools/config.py`:

```python
"""Settings shared by the API, the worker and the sweeper."""

import os
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(os.environ.get("PDFTOOLS_DATA", "/data/jobs"))
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = "pdftools"

MAX_BYTES = 50 * 1024 * 1024
RATE_LIMIT = int(os.environ.get("PDFTOOLS_RATE_LIMIT", "20"))
RATE_WINDOW_S = 600
QUEUE_CAP = 50
JOB_MAX_AGE_S = 3600
SWEEP_EVERY_S = 600


@dataclass(frozen=True)
class ToolSpec:
    extensions: frozenset[str]
    timeout_s: int
    #: Appended to the user's file name (without extension) for the download.
    output_suffix: str


TOOLS: dict[str, ToolSpec] = {
    "compress-pdf": ToolSpec(frozenset({".pdf"}), 60, "-compressed.pdf"),
    "word-to-pdf": ToolSpec(frozenset({".doc", ".docx"}), 90, ".pdf"),
    "excel-to-pdf": ToolSpec(frozenset({".xls", ".xlsx"}), 90, ".pdf"),
    "powerpoint-to-pdf": ToolSpec(frozenset({".ppt", ".pptx"}), 90, ".pdf"),
    "pdf-to-word": ToolSpec(frozenset({".pdf"}), 120, ".docx"),
}

#: Spec §5: Ghostscript PDFSETTINGS per compression level.
COMPRESS_LEVELS = {"low": "/printer", "medium": "/ebook", "high": "/screen"}
```

`server/pdftools/errors.py`:

```python
class JobError(Exception):
    """A conversion failure with a client-facing code (TIMEOUT, CONVERSION_FAILED, ENCRYPTED, BAD_OPTIONS)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
```

`server/pdftools/validation.py`:

```python
"""Upload checks that never trust the client: extension whitelist, magic bytes, safe display names."""

import re

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .doc/.xls/.ppt
ZIP_MAGIC = b"PK\x03\x04"  # .docx/.xlsx/.pptx

_UNSAFE = re.compile(r"[^\w.\- ]+")


def _basename(name: str) -> str:
    return name.replace("\\", "/").rsplit("/", 1)[-1]


def extension_of(name: str) -> str:
    stem, dot, ext = _basename(name).rpartition(".")
    return f".{ext.lower()}" if dot and stem else ""


def looks_like(ext: str, head: bytes) -> bool:
    """True when the first bytes match the container format the extension claims."""
    if ext == ".pdf":
        return b"%PDF-" in head[:1024]
    if ext in (".doc", ".xls", ".ppt"):
        return head.startswith(OLE_MAGIC)
    if ext in (".docx", ".xlsx", ".pptx"):
        return head.startswith(ZIP_MAGIC)
    return False


def display_base(name: str) -> str:
    """The user's file name without directory or extension, reduced to safe characters.

    Used only to name the download; it never becomes part of a filesystem path.
    """
    base = _basename(name)
    stem, dot, _ext = base.rpartition(".")
    if not dot or not stem:
        stem = base
    safe = _UNSAFE.sub("_", stem).strip(" ._-")[:100].strip(" ._-")
    return safe or "document"
```

`server/pdftools/storage.py`:

```python
"""Job directories: /data/jobs/<id>/{in/input<ext>, out/, meta.json}. Never uses user-supplied names."""

import json
import re
import shutil
import uuid
from pathlib import Path

_ID = re.compile(r"[0-9a-f]{32}")


class JobStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex

    @staticmethod
    def valid_id(job_id: str) -> bool:
        return bool(job_id) and _ID.fullmatch(job_id) is not None

    def job_dir(self, job_id: str) -> Path:
        if not self.valid_id(job_id):
            raise ValueError("invalid job id")
        return self.root / job_id

    def create(self, job_id: str) -> Path:
        d = self.job_dir(job_id)
        (d / "in").mkdir(parents=True)
        (d / "out").mkdir()
        return d

    def input_path(self, job_id: str, ext: str) -> Path:
        return self.job_dir(job_id) / "in" / f"input{ext}"

    def find_input(self, job_id: str) -> Path | None:
        files = sorted((self.job_dir(job_id) / "in").glob("input*"))
        return files[0] if files else None

    def out_dir(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "out"

    def write_meta(self, job_id: str, meta: dict) -> None:
        (self.job_dir(job_id) / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def read_meta(self, job_id: str) -> dict | None:
        if not self.valid_id(job_id):
            return None
        try:
            return json.loads((self.job_dir(job_id) / "meta.json").read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def exists(self, job_id: str) -> bool:
        return self.valid_id(job_id) and self.job_dir(job_id).is_dir()

    def delete(self, job_id: str) -> bool:
        if not self.exists(job_id):
            return False
        shutil.rmtree(self.job_dir(job_id), ignore_errors=True)
        return True
```

`server/pdftools/ratelimit.py`:

```python
import time


class RateLimiter:
    """Fixed-window counter in Redis: at most `limit` calls per key per `window_s` seconds."""

    def __init__(self, redis, limit: int, window_s: int, prefix: str = "pdftools:rl:") -> None:
        self.redis = redis
        self.limit = limit
        self.window_s = window_s
        self.prefix = prefix

    def allow(self, key: str, now: float | None = None) -> bool:
        bucket = int((time.time() if now is None else now) // self.window_s)
        redis_key = f"{self.prefix}{key}:{bucket}"
        count = self.redis.incr(redis_key)
        if count == 1:
            self.redis.expire(redis_key, self.window_s)
        return count <= self.limit
```

`server/pdftools/sweeper.py`:

```python
"""Deletes job directories older than JOB_MAX_AGE_S, regardless of job state (spec §8)."""

import logging
import shutil
import time
from pathlib import Path

from . import config

log = logging.getLogger("pdftools.sweeper")


def sweep(root: Path, now: float, max_age_s: int) -> int:
    if not root.exists():
        return 0
    removed = 0
    for entry in root.iterdir():
        try:
            if entry.is_dir() and now - entry.stat().st_mtime > max_age_s:
                shutil.rmtree(entry, ignore_errors=True)
                removed += 1
        except FileNotFoundError:
            continue  # deleted by the API in the meantime
    return removed


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    while True:
        removed = sweep(config.DATA_DIR, time.time(), config.JOB_MAX_AGE_S)
        if removed:
            log.info("swept %d job dirs", removed)
        time.sleep(config.SWEEP_EVERY_S)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && .venv/Scripts/python -m pytest -q`
Expected: all pass, 25 tests (validation 14, storage 7, rate limit 2, sweeper 2).

- [ ] **Step 6: Commit**

```bash
git add .gitignore server/requirements-api.txt server/requirements-worker.txt server/requirements-dev.txt server/pyproject.toml server/pdftools server/tests
git commit -m "feat(server): add config, upload validation, job storage, rate limiter and sweeper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: HTTP API (FastAPI) and the job queue adapter

**Files:**
- Create: `server/pdftools/api.py`, `server/pdftools/jobqueue.py`
- Test: `server/tests/test_api.py`

**Interfaces:**
- Consumes: `config`, `JobStore`, `RateLimiter`, `display_base`, `extension_of`, `looks_like`, `sweep` (Task 4).
- Produces:
  - `JobQueue` protocol:

    ```
    enqueue(job_id, tool, timeout_s) -> None
    state(job_id) -> tuple[str, dict | None] | None
    delete(job_id) -> None
    length() -> int
    ```

    `state` returns the state as one of `"queued" | "running" | "done" | "failed"`, together with the worker's result dict.
  - `RQJobQueue(redis)`: enqueues `pdftools.runner.run_job(job_id, tool)` with job id = upload id, `job_timeout = timeout_s + 30`, and result/failure TTL `JOB_MAX_AGE_S`.
  - `create_app(store, queue, limiter) -> FastAPI` and `build_app()` (uvicorn factory).
  - Routes (spec §4), all errors shaped `{"error": {"code", "message"}}`:

    | Route | Success | Errors |
    |---|---|---|
    | `POST /jobs` (multipart `file`, `tool`, `opts` JSON) | 202 `{"id"}` | 400 / 413 / 429 / 503 |
    | `GET /jobs/{id}` | `{"status", "error"?, "output"?: {name, size, inputSize, note?}}` | 404 |
    | `GET /jobs/{id}/file` | attachment download | 409 `NOT_READY` / 404 |
    | `DELETE /jobs/{id}` | 204 | 404 |
  - The worker result contract `run_job` must follow (Task 6):
    - `{"ok": True, "output": "<file name in out/>", "note": None | "already-compressed"}`
    - `{"ok": False, "error": {"code", "message"}}`

- [ ] **Step 1: Write the failing tests**

`server/tests/test_api.py`:

```python
import json
import time

import fakeredis
import pytest
from fastapi.testclient import TestClient

from pdftools import config
from pdftools.api import create_app
from pdftools.ratelimit import RateLimiter
from pdftools.storage import JobStore
from pdftools.sweeper import sweep

PDF = b"%PDF-1.7\n%test\n"
DOCX = b"PK\x03\x04" + b"\0" * 20


class FakeQueue:
    def __init__(self):
        self.jobs: dict[str, tuple[str, dict | None]] = {}
        self.size = 0
        self.deleted: list[str] = []

    def enqueue(self, job_id, tool, timeout_s):
        self.jobs[job_id] = ("queued", None)

    def state(self, job_id):
        return self.jobs.get(job_id)

    def delete(self, job_id):
        self.deleted.append(job_id)
        self.jobs.pop(job_id, None)

    def length(self):
        return self.size


@pytest.fixture
def env(tmp_path):
    store, queue = JobStore(tmp_path), FakeQueue()
    limiter = RateLimiter(fakeredis.FakeRedis(), limit=config.RATE_LIMIT, window_s=config.RATE_WINDOW_S)
    return store, queue, TestClient(create_app(store, queue, limiter))


def post(client, tool="compress-pdf", name="report.pdf", data=PDF, opts=None, headers=None):
    form = {"tool": tool}
    if opts is not None:
        form["opts"] = json.dumps(opts)
    return client.post("/jobs", data=form, files={"file": (name, data, "application/octet-stream")}, headers=headers or {})


def finish(store, queue, job_id, output="output.pdf", content=b"%PDF-out", note=None):
    (store.out_dir(job_id) / output).write_bytes(content)
    queue.jobs[job_id] = ("done", {"ok": True, "output": output, "note": note})


def test_job_lifecycle(env):
    store, queue, client = env
    r = post(client, opts={"level": "high"})
    assert r.status_code == 202
    job_id = r.json()["id"]
    assert store.find_input(job_id).name == "input.pdf"
    assert store.read_meta(job_id) == {"tool": "compress-pdf", "name": "report", "size": len(PDF), "opts": {"level": "high"}}

    assert client.get(f"/jobs/{job_id}").json() == {"status": "queued"}
    queue.jobs[job_id] = ("running", None)
    assert client.get(f"/jobs/{job_id}").json() == {"status": "running"}

    finish(store, queue, job_id, content=b"%PDF-small")
    assert client.get(f"/jobs/{job_id}").json() == {
        "status": "done",
        "output": {"name": "report-compressed.pdf", "size": 10, "inputSize": len(PDF)},
    }
    f = client.get(f"/jobs/{job_id}/file")
    assert f.status_code == 200
    assert f.content == b"%PDF-small"
    assert f.headers["content-type"] == "application/pdf"
    assert 'filename="report-compressed.pdf"' in f.headers["content-disposition"]

    assert client.delete(f"/jobs/{job_id}").status_code == 204
    assert not store.exists(job_id)
    assert job_id in queue.deleted
    assert client.get(f"/jobs/{job_id}").status_code == 404


def test_output_name_and_type_per_tool(env):
    store, queue, client = env
    job_id = post(client, tool="pdf-to-word", name="Q3 報告.pdf").json()["id"]
    finish(store, queue, job_id, output="output.docx", content=b"PK\x03\x04docx")
    assert client.get(f"/jobs/{job_id}").json()["output"]["name"] == "Q3 報告.docx"
    f = client.get(f"/jobs/{job_id}/file")
    assert f.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert "filename*=utf-8''Q3%20%E5%A0%B1%E5%91%8A.docx" in f.headers["content-disposition"]

    word = post(client, tool="word-to-pdf", name="memo.docx", data=DOCX).json()["id"]
    finish(store, queue, word)
    assert client.get(f"/jobs/{word}").json()["output"]["name"] == "memo.pdf"


@pytest.mark.parametrize(
    "tool,name,data,code",
    [
        ("nope", "a.pdf", PDF, "BAD_OPTIONS"),
        ("word-to-pdf", "a.pdf", PDF, "UNSUPPORTED_TYPE"),
        ("compress-pdf", "a.docx", DOCX, "UNSUPPORTED_TYPE"),
        ("compress-pdf", "a.pdf", b"not a pdf", "INVALID_FILE"),
        ("word-to-pdf", "a.docx", b"%PDF-1.4", "INVALID_FILE"),
        ("compress-pdf", "a.pdf", b"", "INVALID_FILE"),
    ],
)
def test_rejected_uploads_leave_nothing_behind(env, tool, name, data, code):
    store, queue, client = env
    r = post(client, tool=tool, name=name, data=data)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == code
    assert list(store.root.iterdir()) == []
    assert queue.jobs == {}


def test_path_like_names_never_reach_the_disk(env):
    store, _, client = env
    job_id = post(client, name="../../etc/passwd.pdf").json()["id"]
    assert [p.name for p in (store.root / job_id / "in").iterdir()] == ["input.pdf"]
    assert store.read_meta(job_id)["name"] == "passwd"


def test_bad_options(env):
    _, _, client = env
    r = post(client, opts={"level": "max"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_OPTIONS"
    r = client.post("/jobs", data={"tool": "compress-pdf", "opts": "{nope"}, files={"file": ("a.pdf", PDF)})
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_OPTIONS"


def test_too_large_while_streaming(env, monkeypatch):
    store, _, client = env
    monkeypatch.setattr(config, "MAX_BYTES", 10)
    r = post(client, data=PDF + b"x" * 20)
    assert r.status_code == 413 and r.json()["error"]["code"] == "TOO_LARGE"
    assert list(store.root.iterdir()) == []


def test_too_large_by_content_length(env, monkeypatch):
    store, _, client = env
    monkeypatch.setattr(config, "MAX_BYTES", 10)
    r = post(client, data=PDF + b"x" * (1024 * 1024 + 100))
    assert r.status_code == 413
    assert list(store.root.iterdir()) == []


def test_rate_limit_is_per_client_ip(env):
    _, _, client = env
    for _ in range(config.RATE_LIMIT):
        assert post(client, headers={"cf-connecting-ip": "1.1.1.1"}).status_code == 202
    r = post(client, headers={"cf-connecting-ip": "1.1.1.1"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
    assert post(client, headers={"cf-connecting-ip": "2.2.2.2"}).status_code == 202


def test_busy_when_the_queue_is_full(env):
    _, queue, client = env
    queue.size = config.QUEUE_CAP
    r = post(client)
    assert r.status_code == 503 and r.json()["error"]["code"] == "BUSY"


def test_failed_jobs_report_the_worker_error(env):
    _, queue, client = env
    job_id = post(client).json()["id"]
    queue.jobs[job_id] = ("done", {"ok": False, "error": {"code": "ENCRYPTED", "message": "Protected"}})
    assert client.get(f"/jobs/{job_id}").json() == {"status": "failed", "error": {"code": "ENCRYPTED", "message": "Protected"}}
    assert client.get(f"/jobs/{job_id}/file").status_code == 409
    queue.jobs[job_id] = ("failed", None)
    body = client.get(f"/jobs/{job_id}").json()
    assert body["status"] == "failed" and body["error"]["code"] == "CONVERSION_FAILED"


def test_already_compressed_note(env):
    store, queue, client = env
    job_id = post(client).json()["id"]
    finish(store, queue, job_id, note="already-compressed")
    assert "already well compressed" in client.get(f"/jobs/{job_id}").json()["output"]["note"]


@pytest.mark.parametrize("job_id", ["nope", "0" * 32])
def test_unknown_or_malformed_ids_are_404(env, job_id):
    _, _, client = env
    for r in (client.get(f"/jobs/{job_id}"), client.get(f"/jobs/{job_id}/file"), client.delete(f"/jobs/{job_id}")):
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "NOT_FOUND"


def test_a_job_is_gone_after_the_sweeper_runs(env):
    store, queue, client = env
    job_id = post(client).json()["id"]
    finish(store, queue, job_id)
    assert sweep(store.root, time.time() + 2 * config.JOB_MAX_AGE_S, config.JOB_MAX_AGE_S) == 1
    assert client.get(f"/jobs/{job_id}").status_code == 404
    assert client.get(f"/jobs/{job_id}/file").status_code == 404
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && .venv/Scripts/python -m pytest -q tests/test_api.py`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'pdftools.api'`.

- [ ] **Step 3: Implement `server/pdftools/jobqueue.py`**

```python
"""Queue adapter. The API depends only on the JobQueue protocol, so tests can use an in-memory fake."""

from typing import Protocol

from . import config


class JobQueue(Protocol):
    def enqueue(self, job_id: str, tool: str, timeout_s: int) -> None: ...

    def state(self, job_id: str) -> tuple[str, dict | None] | None:
        """("queued" | "running" | "done" | "failed", worker result) or None when unknown."""
        ...

    def delete(self, job_id: str) -> None: ...

    def length(self) -> int: ...


class RQJobQueue:
    def __init__(self, redis) -> None:
        from rq import Queue

        self.redis = redis
        self.queue = Queue(config.QUEUE_NAME, connection=redis)

    def enqueue(self, job_id: str, tool: str, timeout_s: int) -> None:
        self.queue.enqueue(
            "pdftools.runner.run_job",
            job_id,
            tool,
            job_id=job_id,
            job_timeout=timeout_s + 30,  # the handler kills the converter first; RQ's limit is a backstop
            result_ttl=config.JOB_MAX_AGE_S,
            failure_ttl=config.JOB_MAX_AGE_S,
        )

    def _fetch(self, job_id: str):
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        try:
            return Job.fetch(job_id, connection=self.redis)
        except NoSuchJobError:
            return None

    def state(self, job_id: str) -> tuple[str, dict | None] | None:
        from rq.job import JobStatus

        job = self._fetch(job_id)
        if job is None:
            return None
        status = job.get_status()
        if status == JobStatus.STARTED:
            return ("running", None)
        if status == JobStatus.FINISHED:
            return ("done", job.return_value())
        if status in (JobStatus.FAILED, JobStatus.STOPPED, JobStatus.CANCELED):
            return ("failed", None)
        return ("queued", None)

    def delete(self, job_id: str) -> None:
        job = self._fetch(job_id)
        if job is not None:
            job.delete(remove_from_queue=True)

    def length(self) -> int:
        return self.queue.count
```

- [ ] **Step 4: Implement `server/pdftools/api.py`**

```python
"""HTTP API: validates uploads, stores them, enqueues jobs, reports status and serves results (spec §4, §7, §8)."""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.datastructures import UploadFile

from . import config
from .jobqueue import JobQueue
from .ratelimit import RateLimiter
from .storage import JobStore
from .validation import display_base, extension_of, looks_like

log = logging.getLogger("pdftools.api")

CHUNK = 1024 * 1024
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
NOTES = {"already-compressed": "This PDF is already well compressed, so your original file is returned unchanged."}
GENERIC_FAILURE = {"code": "CONVERSION_FAILED", "message": "The file couldn't be converted"}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "This job doesn't exist or has expired")


def parse_opts(tool: str, raw: Any) -> dict:
    try:
        opts = json.loads(raw) if isinstance(raw, str) and raw else {}
    except json.JSONDecodeError:
        raise ApiError(400, "BAD_OPTIONS", "Options must be valid JSON") from None
    if not isinstance(opts, dict):
        raise ApiError(400, "BAD_OPTIONS", "Options must be a JSON object")
    if tool == "compress-pdf":
        level = opts.get("level", "medium")
        if level not in config.COMPRESS_LEVELS:
            raise ApiError(400, "BAD_OPTIONS", "Compression level must be low, medium or high")
        return {"level": level}
    return {}


def create_app(store: JobStore, queue: JobQueue, limiter: RateLimiter) -> FastAPI:
    app = FastAPI(title="PDF Tools API", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status)

    def client_key(request: Request) -> str:
        # Trusted only because the API is reachable solely through `web` (spec §8).
        return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")

    def load_meta(job_id: str) -> dict:
        meta = store.read_meta(job_id)
        if meta is None:
            raise not_found()
        return meta

    def job_state(job_id: str) -> tuple[str, dict | None]:
        state = queue.state(job_id)
        if state is None:
            raise not_found()
        return state

    def output_name(meta: dict) -> str:
        return meta["name"] + config.TOOLS[meta["tool"]].output_suffix

    @app.post("/jobs", status_code=202)
    async def create_job(request: Request) -> dict:
        if int(request.headers.get("content-length") or 0) > config.MAX_BYTES + CHUNK:
            raise ApiError(413, "TOO_LARGE", "File is larger than 50 MB")
        if not limiter.allow(client_key(request)):
            raise ApiError(429, "RATE_LIMITED", "Too many jobs — try again in a few minutes")
        if queue.length() >= config.QUEUE_CAP:
            raise ApiError(503, "BUSY", "The converter is busy — try again shortly")

        form = await request.form()
        tool, upload = form.get("tool"), form.get("file")
        spec = config.TOOLS.get(tool) if isinstance(tool, str) else None
        if spec is None:
            raise ApiError(400, "BAD_OPTIONS", "Unknown tool")
        if not isinstance(upload, UploadFile):
            raise ApiError(400, "BAD_OPTIONS", "No file was uploaded")
        ext = extension_of(upload.filename or "")
        if ext not in spec.extensions:
            raise ApiError(400, "UNSUPPORTED_TYPE", f"This tool accepts {', '.join(sorted(spec.extensions))} files")
        opts = parse_opts(tool, form.get("opts"))

        job_id = store.new_id()
        store.create(job_id)
        try:
            size, head = 0, b""
            with store.input_path(job_id, ext).open("wb") as fh:
                while chunk := await upload.read(CHUNK):
                    if size == 0:
                        head = chunk[:1024]
                    size += len(chunk)
                    if size > config.MAX_BYTES:
                        raise ApiError(413, "TOO_LARGE", "File is larger than 50 MB")
                    fh.write(chunk)
            if size == 0 or not looks_like(ext, head):
                raise ApiError(400, "INVALID_FILE", f"This isn't a valid {ext[1:].upper()} file")
        except ApiError:
            store.delete(job_id)
            raise
        finally:
            await upload.close()

        store.write_meta(job_id, {"tool": tool, "name": display_base(upload.filename or ""), "size": size, "opts": opts})
        queue.enqueue(job_id, tool, spec.timeout_s)
        log.info("job=%s tool=%s size=%d status=queued", job_id, tool, size)
        return {"id": job_id}

    @app.get("/jobs/{job_id}")
    def job_status(job_id: str) -> dict:
        meta = load_meta(job_id)
        status, result = job_state(job_id)
        if status == "done":
            if not result or not result.get("ok"):
                return {"status": "failed", "error": (result or {}).get("error") or GENERIC_FAILURE}
            out = store.out_dir(job_id) / Path(result["output"]).name
            if not out.is_file():
                raise not_found()
            output = {"name": output_name(meta), "size": out.stat().st_size, "inputSize": meta["size"]}
            if result.get("note") in NOTES:
                output["note"] = NOTES[result["note"]]
            return {"status": "done", "output": output}
        if status == "failed":
            return {"status": "failed", "error": GENERIC_FAILURE}
        return {"status": status}

    @app.get("/jobs/{job_id}/file")
    def job_file(job_id: str) -> FileResponse:
        meta = load_meta(job_id)
        status, result = job_state(job_id)
        if status != "done" or not result or not result.get("ok"):
            raise ApiError(409, "NOT_READY", "The result isn't ready")
        out = store.out_dir(job_id) / Path(result["output"]).name
        if not out.is_file():
            raise not_found()
        suffix = Path(config.TOOLS[meta["tool"]].output_suffix).suffix
        return FileResponse(out, filename=output_name(meta), media_type=MEDIA_TYPES[suffix])

    @app.delete("/jobs/{job_id}", status_code=204)
    def delete_job(job_id: str) -> Response:
        if not store.exists(job_id):
            raise not_found()
        queue.delete(job_id)
        store.delete(job_id)
        log.info("job=%s status=deleted", job_id)
        return Response(status_code=204)

    return app


def build_app() -> FastAPI:
    """uvicorn factory: `uvicorn pdftools.api:build_app --factory`."""
    from redis import Redis

    from .jobqueue import RQJobQueue

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    redis = Redis.from_url(config.REDIS_URL)
    limiter = RateLimiter(redis, config.RATE_LIMIT, config.RATE_WINDOW_S)
    return create_app(JobStore(config.DATA_DIR), RQJobQueue(redis), limiter)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && .venv/Scripts/python -m pytest -q`
Expected: all pass (Task 4's 25 plus 19 API tests).

- [ ] **Step 6: Commit**

```bash
git add server/pdftools/api.py server/pdftools/jobqueue.py server/tests/test_api.py
git commit -m "feat(server): add jobs API with validation, rate limiting, queue cap and RQ adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Worker — converters, process-group timeouts and the job runner

**Files:**
- Create:
  - `server/pdftools/runner.py`, `server/pdftools/worker.py`
  - `server/pdftools/handlers/__init__.py`, `proc.py`, `office.py`, `compress.py`, `pdfcheck.py`, `pdf_to_word.py`, `pdf2docx_cli.py`
- Test: `server/tests/test_runner.py`, `server/tests/test_handlers_integration.py`

**Interfaces:**
- Consumes: `config.TOOLS`, `config.COMPRESS_LEVELS`, `JobError`, `JobStore` (Task 4); the result contract (Task 5).
- Produces:
  - `run(cmd, timeout_s, cwd=None) -> CompletedProcess`: runs `cmd` in its own session and kills the whole process group on timeout (`JobError("TIMEOUT")`)
  - the handlers, each `handle(input_path: Path, out_dir: Path, opts: dict) -> Path` (spec §3), wired up in `HANDLERS: dict[str, Handler]`
  - `run_job(job_id, tool, store=None, handlers=None) -> dict`, which returns the result contract and never raises
  - `worker.main()`

- [ ] **Step 1: Write the failing tests**

`server/tests/test_runner.py`:

```python
import logging
from pathlib import Path

from pdftools.errors import JobError
from pdftools.runner import run_job
from pdftools.storage import JobStore

PDF = b"%PDF-" + b"x" * 100


def setup_job(tmp_path, data=PDF, opts=None, name="doc"):
    store = JobStore(tmp_path)
    job_id = store.new_id()
    store.create(job_id)
    store.input_path(job_id, ".pdf").write_bytes(data)
    store.write_meta(job_id, {"tool": "compress-pdf", "name": name, "size": len(data), "opts": opts or {}})
    return store, job_id


def writer(content: bytes, name="output.pdf"):
    seen = {}

    def handle(src: Path, out_dir: Path, opts: dict) -> Path:
        seen.update(src=src, opts=opts)
        out = out_dir / name
        out.write_bytes(content)
        return out

    return handle, seen


def test_success_returns_the_output_name_and_passes_options(tmp_path):
    store, job_id = setup_job(tmp_path, opts={"level": "high"})
    handle, seen = writer(b"%PDF-small")
    result = run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert result == {"ok": True, "output": "output.pdf", "note": None}
    assert seen["opts"] == {"level": "high"}
    assert seen["src"].name == "input.pdf"


def test_compress_that_does_not_shrink_returns_the_original(tmp_path):
    store, job_id = setup_job(tmp_path)
    handle, _ = writer(b"%PDF-" + b"y" * 500)
    result = run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert result == {"ok": True, "output": "output.pdf", "note": "already-compressed"}
    assert (store.out_dir(job_id) / "output.pdf").read_bytes() == PDF


def test_job_errors_are_returned_not_raised(tmp_path):
    store, job_id = setup_job(tmp_path)

    def boom(src, out_dir, opts):
        raise JobError("ENCRYPTED", "Protected PDF")

    assert run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": boom}) == {
        "ok": False,
        "error": {"code": "ENCRYPTED", "message": "Protected PDF"},
    }


def test_unexpected_errors_become_conversion_failed(tmp_path):
    store, job_id = setup_job(tmp_path)

    def crash(src, out_dir, opts):
        raise RuntimeError("segfault-ish")

    result = run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": crash})
    assert result["ok"] is False and result["error"]["code"] == "CONVERSION_FAILED"


def test_a_deleted_job_fails_cleanly(tmp_path):
    store = JobStore(tmp_path)
    handle, _ = writer(b"x")
    result = run_job(store.new_id(), "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert result["ok"] is False and result["error"]["code"] == "CONVERSION_FAILED"


def test_the_log_line_never_contains_the_file_name(tmp_path, caplog):
    store, job_id = setup_job(tmp_path, name="secret-salary-review")
    handle, _ = writer(b"%PDF-small")
    with caplog.at_level(logging.INFO, logger="pdftools.worker"):
        run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert job_id in caplog.text and "compress-pdf" in caplog.text and "status=done" in caplog.text
    assert "secret" not in caplog.text
```

`server/tests/test_handlers_integration.py`:

```python
"""Real LibreOffice / Ghostscript / pdf2docx runs. Executed inside the worker image (make test-server)."""

import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    shutil.which("soffice") is None or shutil.which("gs") is None,
    reason="needs LibreOffice and Ghostscript — run in the worker image: make test-server",
)

from pdftools.errors import JobError  # noqa: E402
from pdftools.handlers import HANDLERS  # noqa: E402
from pdftools.handlers.proc import run  # noqa: E402
from pdftools.runner import run_job  # noqa: E402
from pdftools.storage import JobStore  # noqa: E402


def pages_and_text(pdf: Path) -> tuple[int, str]:
    import pymupdf

    with pymupdf.open(pdf) as doc:
        return doc.page_count, "".join(page.get_text() for page in doc)


def convert(tmp_path: Path, tool: str, src: Path, opts: dict | None = None) -> Path:
    out_dir = tmp_path / "out"
    out_dir.mkdir(exist_ok=True)
    return HANDLERS[tool](src, out_dir, opts or {})


def text_pdf(path: Path, text: str = "Hello Word") -> None:
    import pymupdf

    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), text, fontsize=14)
    doc.save(path)
    doc.close()


def noisy_pdf(path: Path) -> None:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    pix = pymupdf.Pixmap(pymupdf.csRGB, 1000, 1000, os.urandom(1000 * 1000 * 3), False)
    page.insert_image(page.rect, pixmap=pix)
    doc.save(path)
    doc.close()


def test_word_to_pdf(tmp_path):
    import docx

    src = tmp_path / "input.docx"
    d = docx.Document()
    d.add_paragraph("Hello from Word")
    d.save(src)
    count, text = pages_and_text(convert(tmp_path, "word-to-pdf", src))
    assert count == 1 and "Hello from Word" in text


def test_legacy_doc_to_pdf(tmp_path):
    import docx

    modern = tmp_path / "legacy.docx"
    d = docx.Document()
    d.add_paragraph("Legacy format")
    d.save(modern)
    subprocess.run(
        ["soffice", f"-env:UserInstallation={(tmp_path / 'profile').as_uri()}", "--headless",
         "--convert-to", "doc", "--outdir", str(tmp_path / "doc"), str(modern)],
        check=True, timeout=120, capture_output=True,
    )
    src = tmp_path / "input.doc"
    shutil.move(tmp_path / "doc" / "legacy.doc", src)
    assert "Legacy format" in pages_and_text(convert(tmp_path, "word-to-pdf", src))[1]


def test_excel_to_pdf(tmp_path):
    import openpyxl

    src = tmp_path / "input.xlsx"
    wb = openpyxl.Workbook()
    wb.active["A1"] = "Hello from Excel"
    wb.save(src)
    assert "Hello from Excel" in pages_and_text(convert(tmp_path, "excel-to-pdf", src))[1]


def test_powerpoint_to_pdf(tmp_path):
    from pptx import Presentation

    prs = Presentation()
    for i in (1, 2):
        prs.slides.add_slide(prs.slide_layouts[0]).shapes.title.text = f"Slide {i}"
    src = tmp_path / "input.pptx"
    prs.save(src)
    count, text = pages_and_text(convert(tmp_path, "powerpoint-to-pdf", src))
    assert count == 2 and "Slide 2" in text


def test_compress_shrinks_an_image_heavy_pdf(tmp_path):
    src = tmp_path / "input.pdf"
    noisy_pdf(src)
    out = convert(tmp_path, "compress-pdf", src, {"level": "high"})
    assert out.stat().st_size < src.stat().st_size / 2
    assert pages_and_text(out)[0] == 1


def test_compress_returns_an_already_small_pdf_unchanged(tmp_path):
    store = JobStore(tmp_path / "jobs")
    job_id = store.new_id()
    store.create(job_id)
    src = store.input_path(job_id, ".pdf")
    text_pdf(src)
    store.write_meta(job_id, {"tool": "compress-pdf", "name": "doc", "size": src.stat().st_size, "opts": {"level": "low"}})
    result = run_job(job_id, "compress-pdf", store=store)
    assert result["ok"] and result["note"] == "already-compressed"
    assert (store.out_dir(job_id) / result["output"]).read_bytes() == src.read_bytes()


def test_pdf_to_word(tmp_path):
    import docx

    src = tmp_path / "input.pdf"
    text_pdf(src, "Hello Word")
    out = convert(tmp_path, "pdf-to-word", src)
    assert out.suffix == ".docx"
    assert "Hello Word" in "\n".join(p.text for p in docx.Document(out).paragraphs)


@pytest.mark.parametrize("tool", ["compress-pdf", "pdf-to-word"])
def test_password_protected_pdfs_report_encrypted(tmp_path, tool):
    import pymupdf

    src = tmp_path / "input.pdf"
    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "secret")
    doc.save(src, encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="user")
    with pytest.raises(JobError) as err:
        convert(tmp_path, tool, src)
    assert err.value.code == "ENCRYPTED"


def test_garbage_pdf_is_conversion_failed(tmp_path):
    src = tmp_path / "input.pdf"
    src.write_bytes(b"%PDF-1.4\nthis is not really a pdf\n")
    with pytest.raises(JobError) as err:
        convert(tmp_path, "compress-pdf", src)
    assert err.value.code == "CONVERSION_FAILED"


def test_timeout_kills_the_whole_process_group(tmp_path):
    pidfile = tmp_path / "child.pid"
    started = time.monotonic()
    with pytest.raises(JobError) as err:
        run(["sh", "-c", f"sleep 30 & echo $! > {pidfile}; wait"], timeout_s=1)
    assert err.value.code == "TIMEOUT"
    assert time.monotonic() - started < 10
    child = int(pidfile.read_text())
    time.sleep(0.5)  # the container's init (docker run --init) reaps the killed orphan
    with pytest.raises(ProcessLookupError):
        os.kill(child, 0)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && .venv/Scripts/python -m pytest -q tests/test_runner.py tests/test_handlers_integration.py`
Expected: FAIL. `test_runner.py` errors with `No module named 'pdftools.runner'`. The integration file is skipped locally because there is no `soffice`; it runs in Task 7.

- [ ] **Step 3: Implement the process helper and handlers**

`server/pdftools/handlers/proc.py`:

```python
import os
import signal
import subprocess

from ..errors import JobError


def run(cmd: list[str], timeout_s: int, cwd: str | None = None) -> subprocess.CompletedProcess:
    """Runs `cmd` in its own session; on timeout the whole process group is killed (spec §8)."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, cwd=cwd)
    try:
        out, err = proc.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise JobError("TIMEOUT", f"Conversion took longer than {timeout_s} seconds") from None
    return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
```

`server/pdftools/handlers/pdfcheck.py`:

```python
from pathlib import Path

from ..errors import JobError


def ensure_openable(src: Path) -> None:
    """ENCRYPTED for password-protected PDFs, CONVERSION_FAILED for files PyMuPDF cannot open."""
    import pymupdf

    try:
        with pymupdf.open(src) as doc:
            if doc.needs_pass:
                raise JobError("ENCRYPTED", "This PDF is password-protected")
            if doc.page_count == 0:
                raise JobError("CONVERSION_FAILED", "This PDF has no pages")
    except JobError:
        raise
    except Exception:
        raise JobError("CONVERSION_FAILED", "This PDF couldn't be read") from None
```

`server/pdftools/handlers/office.py`:

```python
import shutil
import tempfile
from pathlib import Path

from ..errors import JobError
from .proc import run


def to_pdf(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    """LibreOffice headless conversion with a throwaway profile per job (spec §8)."""
    profile = Path(tempfile.mkdtemp(prefix="lo-profile-"))
    try:
        result = run(
            [
                "soffice", f"-env:UserInstallation={profile.as_uri()}",
                "--headless", "--norestore", "--nologo", "--nodefault", "--nolockcheck",
                "--convert-to", "pdf", "--outdir", str(out_dir), str(src),
            ],
            timeout_s,
        )
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    out = out_dir / f"{src.stem}.pdf"
    if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        raise JobError("CONVERSION_FAILED", "This document couldn't be converted")
    return out
```

`server/pdftools/handlers/compress.py`:

```python
from pathlib import Path

from ..config import COMPRESS_LEVELS
from ..errors import JobError
from .pdfcheck import ensure_openable
from .proc import run


def compress(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    preset = COMPRESS_LEVELS.get(opts.get("level", "medium"))
    if preset is None:
        raise JobError("BAD_OPTIONS", "Compression level must be low, medium or high")
    ensure_openable(src)
    out = out_dir / "output.pdf"
    result = run(
        [
            "gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.5", f"-dPDFSETTINGS={preset}", "-dDetectDuplicateImages=true",
            f"-sOutputFile={out}", str(src),
        ],
        timeout_s,
    )
    if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        raise JobError("CONVERSION_FAILED", "This PDF couldn't be compressed")
    return out
```

`server/pdftools/handlers/pdf2docx_cli.py`:

```python
"""Runs pdf2docx in a child process so the worker can kill it on timeout."""

import sys

from pdf2docx import Converter


def main(src: str, dst: str) -> None:
    converter = Converter(src)
    try:
        converter.convert(dst)
    finally:
        converter.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

`server/pdftools/handlers/pdf_to_word.py`:

```python
import sys
from pathlib import Path

from ..errors import JobError
from .pdfcheck import ensure_openable
from .proc import run

# Directory that contains the `pdftools` package, so `python -m` finds it from any working directory.
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def pdf_to_word(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    ensure_openable(src)
    out = out_dir / "output.docx"
    result = run([sys.executable, "-m", "pdftools.handlers.pdf2docx_cli", str(src), str(out)], timeout_s, cwd=str(PACKAGE_ROOT))
    if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        raise JobError("CONVERSION_FAILED", "This PDF couldn't be converted to Word")
    return out
```

`server/pdftools/handlers/__init__.py`:

```python
from collections.abc import Callable
from functools import partial
from pathlib import Path

from ..config import TOOLS
from .compress import compress
from .office import to_pdf
from .pdf_to_word import pdf_to_word

Handler = Callable[[Path, Path, dict], Path]

HANDLERS: dict[str, Handler] = {
    "compress-pdf": partial(compress, timeout_s=TOOLS["compress-pdf"].timeout_s),
    "word-to-pdf": partial(to_pdf, timeout_s=TOOLS["word-to-pdf"].timeout_s),
    "excel-to-pdf": partial(to_pdf, timeout_s=TOOLS["excel-to-pdf"].timeout_s),
    "powerpoint-to-pdf": partial(to_pdf, timeout_s=TOOLS["powerpoint-to-pdf"].timeout_s),
    "pdf-to-word": partial(pdf_to_word, timeout_s=TOOLS["pdf-to-word"].timeout_s),
}
```

- [ ] **Step 4: Implement the runner and worker entry point**

`server/pdftools/runner.py`:

```python
"""The RQ job function. Returns the result contract read by the API; never raises."""

import logging
import shutil
import time

from . import config
from .errors import JobError
from .storage import JobStore

log = logging.getLogger("pdftools.worker")


def run_job(job_id: str, tool: str, store: JobStore | None = None, handlers: dict | None = None) -> dict:
    if handlers is None:
        from .handlers import HANDLERS

        handlers = HANDLERS
    store = store or JobStore(config.DATA_DIR)
    started = time.monotonic()
    status, size = "failed", 0
    try:
        meta = store.read_meta(job_id) if store.valid_id(job_id) else None
        src = store.find_input(job_id) if meta is not None else None
        if meta is None or src is None:
            raise JobError("CONVERSION_FAILED", "The upload is no longer available")
        size = src.stat().st_size
        out = handlers[tool](src, store.out_dir(job_id), meta.get("opts", {}))
        note = None
        if tool == "compress-pdf" and out.stat().st_size >= size:
            # Spec §5: if compression doesn't help, return the original with a notice.
            out.unlink()
            out = shutil.copyfile(src, store.out_dir(job_id) / "output.pdf")
            note = "already-compressed"
        status = "done"
        return {"ok": True, "output": out.name, "note": note}
    except JobError as e:
        status = e.code
        return {"ok": False, "error": {"code": e.code, "message": e.message}}
    except Exception:
        log.exception("job=%s tool=%s unexpected failure", job_id, tool)
        return {"ok": False, "error": {"code": "CONVERSION_FAILED", "message": "The file couldn't be converted"}}
    finally:
        log.info(
            "job=%s tool=%s size=%d duration=%.1fs status=%s", job_id, tool, size, time.monotonic() - started, status
        )
```

`server/pdftools/worker.py`:

```python
import logging

from . import config


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    from redis import Redis
    from rq import Queue, Worker

    redis = Redis.from_url(config.REDIS_URL)
    Worker([Queue(config.QUEUE_NAME, connection=redis)], connection=redis).work()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the local tests**

Run: `cd server && .venv/Scripts/python -m pytest -q`
Expected: all non-integration tests pass (Task 4's 25, Task 5's 19 and 6 runner tests), and `test_handlers_integration.py` reports its 11 tests as skipped.

- [ ] **Step 6: Commit**

```bash
git add server/pdftools server/tests/test_runner.py server/tests/test_handlers_integration.py
git commit -m "feat(server): add worker runner and LibreOffice/Ghostscript/pdf2docx handlers with process-group timeouts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Containers — server image, Compose stack, `/api` proxy

**Files:**
- Create: `server/Dockerfile`, `server/.dockerignore`, `server/scripts/smoke.sh`
- Modify: `docker-compose.yml`, `web/next.config.ts`, `Makefile`
- Test: the server image's test target (real converters), plus a Compose smoke test through `web`

**Interfaces:**
- Consumes: the whole `server/pdftools` package (Tasks 4–6).
- Produces:
  - **Images:** `server/Dockerfile` with targets `api` (uvicorn on 8000), `worker` (LibreOffice, Ghostscript and pdf2docx; runs `python -m pdftools.worker`) and `test` (worker plus dev deps; runs pytest).
  - **Compose services:**
    - `web` — published on 3000; the only published port;
    - `api` — on networks frontend + backend;
    - `worker` — backend only, no outbound access, `init: true`, limited to 2 CPU / 2 GB;
    - `redis` — backend only;
    - `sweeper` — no network at all;
    - shared volume `jobs:/data/jobs`.
  - **Web proxy:** `web` forwards `/api/:path*` to `${API_URL:-http://api:8000}/:path*` and accepts request bodies up to 55 MB.
  - **Make targets:** `make test-server` and `make test-e2e-server`.

- [ ] **Step 1: Write the server Dockerfile**

`server/Dockerfile`:

```dockerfile
FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
# One uid for every service so the shared /data/jobs volume is writable by api, worker and sweeper.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /tmp --no-create-home app \
 && mkdir -p /data/jobs && chown app:app /data/jobs
WORKDIR /srv
COPY requirements-api.txt ./
RUN pip install -r requirements-api.txt

FROM base AS api
COPY pdftools ./pdftools
USER app
EXPOSE 8000
CMD ["uvicorn", "pdftools.api:build_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS worker
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress ghostscript \
      fonts-dejavu fonts-liberation fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*
COPY requirements-worker.txt ./
RUN pip install -r requirements-worker.txt
COPY pdftools ./pdftools
ENV HOME=/tmp
USER app
CMD ["python", "-m", "pdftools.worker"]

FROM worker AS test
USER root
COPY requirements-dev.txt pyproject.toml ./
RUN pip install -r requirements-dev.txt
COPY tests ./tests
USER app
CMD ["python", "-m", "pytest", "-q"]
```

`server/.dockerignore`:

```
.venv
**/__pycache__
**/*.pyc
.pytest_cache
```

- [ ] **Step 2: Run the full server suite in the worker image (real converters)**

Run (from the repo root; the first build downloads LibreOffice and takes several minutes):

```bash
docker build --target test -t pdftools-test ./server && docker run --rm --init --network none pdftools-test
```

Expected: every test passes (61: 50 unit plus all 11 in `test_handlers_integration.py`). `--init` lets the timeout test confirm that the killed child was reaped.

- [ ] **Step 3: Compose stack, proxy and Make targets**

Replace `docker-compose.yml` with:

```yaml
services:
  web:
    build: ./web
    ports:
      - "3000:3000"
    depends_on:
      - api
    networks: [frontend]
    restart: unless-stopped

  api:
    build: { context: ./server, target: api }
    environment:
      REDIS_URL: redis://redis:6379/0
      PDFTOOLS_RATE_LIMIT: ${PDFTOOLS_RATE_LIMIT:-20}
    volumes:
      - jobs:/data/jobs
    depends_on:
      - redis
    networks: [frontend, backend]
    restart: unless-stopped

  worker:
    build: { context: ./server, target: worker }
    environment:
      REDIS_URL: redis://redis:6379/0
    volumes:
      - jobs:/data/jobs
    depends_on:
      - redis
    networks: [backend] # internal network: no outbound access
    init: true # reaps converter processes killed on timeout
    deploy:
      resources:
        limits: { cpus: "2", memory: 2g }
    restart: unless-stopped

  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    networks: [backend]
    restart: unless-stopped

  sweeper:
    build: { context: ./server, target: api }
    command: ["python", "-m", "pdftools.sweeper"]
    volumes:
      - jobs:/data/jobs
    network_mode: none
    restart: unless-stopped

networks:
  frontend: {}
  backend:
    internal: true

volumes:
  jobs: {}
```

Replace `web/next.config.ts` with:

```ts
import type { NextConfig } from 'next';

// Baked in at build time (rewrites are compiled into the routes manifest); the Compose service name by default.
const API_URL = process.env.API_URL ?? 'http://api:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Rewritten requests are proxied through a body clone that Next caps at 10 MB by default.
    // Uploads go up to 50 MB plus multipart overhead.
    middlewareClientMaxBodySize: '55mb',
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  webpack: (config) => {
    // pdfjs-dist references the optional Node "canvas" package; never bundle it.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
```

Replace `Makefile` with:

```make
.PHONY: test test-unit test-e2e test-server test-e2e-server up down

test: test-unit test-server test-e2e test-e2e-server

test-unit:
	cd web && npm test

test-e2e:
	cd web && npx playwright test

# Server unit + integration tests inside the worker image (real LibreOffice, Ghostscript, pdf2docx).
test-server:
	docker build --target test -t pdftools-test ./server
	docker run --rm --init --network none pdftools-test

# Server-tool e2e against the full Compose stack; the rate limit is raised so the 3-browser run fits.
test-e2e-server:
	PDFTOOLS_RATE_LIMIT=1000 docker compose up -d --build
	cd web && npx playwright test -c playwright.server.config.ts; status=$$?; cd .. && docker compose down; exit $$status

up:
	docker compose up -d --build

down:
	docker compose down
```

`server/scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
# Usage: server/scripts/smoke.sh <base-url> <tool> <file>
# Uploads one file through the public /api proxy, waits for the job, downloads the result and deletes the job.
set -euo pipefail
base=$1 tool=$2 file=$3
id=$(curl -sS -f -F "tool=$tool" -F "opts={}" -F "file=@$file" "$base/api/jobs" | sed -E 's/.*"id":"([0-9a-f]+)".*/\1/')
echo "job $id"
for _ in $(seq 1 180); do
  status=$(curl -sS -f "$base/api/jobs/$id")
  case "$status" in
    *'"done"'*) echo "$status"; break ;;
    *'"failed"'*) echo "$status" >&2; exit 1 ;;
  esac
  sleep 1
done
curl -sS -f -o /dev/null -w "download %{http_code} %{size_download} bytes\n" "$base/api/jobs/$id/file"
curl -sS -f -o /dev/null -w "delete %{http_code}\n" -X DELETE "$base/api/jobs/$id"
curl -sS -o /dev/null -w "after delete %{http_code}\n" "$base/api/jobs/$id"
```

- [ ] **Step 4: Bring the stack up and run the smoke checks**

Run from the repo root:

```bash
cd web && npx tsc --noEmit && cd .. && docker compose up -d --build
docker compose ps --format '{{.Service}} {{.Ports}}'
cd web && node -e "const {PDFDocument}=require('pdf-lib');const c=require('crypto');(async()=>{const d=await PDFDocument.create();d.addPage([200,300]);await d.attach(c.randomBytes(12*1024*1024),'blob.bin',{mimeType:'application/octet-stream'});require('fs').writeFileSync('../big.pdf',await d.save());})()" && cd ..
bash server/scripts/smoke.sh http://localhost:3000 compress-pdf big.pdf
docker compose exec worker python -c "import socket; socket.create_connection(('1.1.1.1', 53), timeout=3)"; echo "worker outbound exit=$?"
curl -s -o /dev/null -w "api direct from host: %{http_code}\n" --max-time 3 http://localhost:8000/jobs/x || true
rm big.pdf
```

Expected:
- **Published ports:** only `web` lists a published port (`0.0.0.0:3000->3000/tcp`).
- **Smoke run:** prints `job <id>`, then a `"status":"done"` body for the 12 MB file, then `download 200 …`, `delete 204` and `after delete 404`.
- **Worker isolation:** the worker connection attempt fails, with `worker outbound exit=1`.
- **API exposure:** the direct API request prints `000`, because the API is not reachable from the host.

Leave the stack running for Task 9, or bring it down with `docker compose down`.

- [ ] **Step 5: Commit**

```bash
git add server/Dockerfile server/.dockerignore server/scripts/smoke.sh docker-compose.yml web/next.config.ts Makefile
git commit -m "feat: add server images and Compose stack with internal worker network and /api proxy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Browser job client and server engines in `runTool`

**Files:**
- Create: `web/src/lib/api/jobs.ts`
- Modify:
  - `web/src/lib/pdf/run.ts`
  - `web/src/components/ToolShell.tsx`
  - `web/src/components/workspaces/index.ts`
- Test: `web/tests/jobs.test.ts`

**Interfaces:**
- Consumes:
  - the API routes and error codes (Task 5)
  - the error codes and `OutputFile.note` (Task 3)
  - `formatSize` (`web/src/lib/files.ts`)
- Produces:
  - `type JobPhase = 'uploading' | 'queued' | 'running' | 'downloading'`
  - `interface JobDeps { fetch: typeof fetch; sleep: (ms: number) => Promise<void> }`
  - `runServerJob(tool: string, file: InputFile, opts: object, onPhase?: (p: JobPhase) => void, deps?: JobDeps): Promise<OutputFile[]>`
    - it always DELETEs the job after success or failure;
    - it maps server codes to client codes, with 404 → `EXPIRED`, `INVALID_FILE` on an Office file → `INVALID_DOCUMENT`, and a thrown fetch → `NETWORK`.
  - `SERVER_ENGINES` (`compress`, `wordToPdf`, `excelToPdf`, `powerpointToPdf` and `pdfToWord`, mapped to the slugs) and `type ServerEngine`
  - `ToolEngine` now includes `ServerEngine`
  - `runTool(engine, inputs, opts, onStatus?: (status: string) => void)`
  - `WorkspaceProps.status?: string | null`, the phase label while a server job runs

- [ ] **Step 1: Write the failing tests**

`web/tests/jobs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/jobs.test.ts`
Expected: FAIL, because `@/lib/api/jobs` cannot be resolved.

- [ ] **Step 3: Implement `web/src/lib/api/jobs.ts`**

```ts
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
    for (let poll = 0; ; poll++) {
      if (poll >= MAX_POLLS) throw new PdfToolError('TIMEOUT', '');
      const res = await send(deps, `/api/jobs/${id}`);
      if (res.status === 404) throw new PdfToolError('EXPIRED', '');
      if (!res.ok) throw new PdfToolError('UNKNOWN', `Server error (${res.status})`);
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
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/jobs.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Route server engines through `runTool` and show the phase**

Replace `web/src/lib/pdf/run.ts` with:

```ts
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
```

In `web/src/components/ToolShell.tsx`:
- add `const [status, setStatus] = useState<string | null>(null);` next to the other state;
- in `run`, change `setOutputs(await runTool(engine, inputs, opts));` to `setOutputs(await runTool(engine, inputs, opts, setStatus));`;
- add `setStatus(null);` inside its `finally` block, before `setBusy(false);`;
- add `status={status}` to the `<Workspace … />` element.

In `web/src/components/workspaces/index.ts`, add to `WorkspaceProps`:

```ts
  /** Progress label while a server job runs ("Uploading…", "Converting…"); null otherwise. */
  status?: string | null;
```

- [ ] **Step 6: Run unit tests, types and lint**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint`
Expected: all unit tests pass; tsc and lint are clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/api/jobs.ts web/src/lib/pdf/run.ts web/src/components/ToolShell.tsx web/src/components/workspaces/index.ts web/tests/jobs.test.ts
git commit -m "feat(web): add server job client (upload, poll, download, auto-delete) and server engines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Server-tool workspaces, server e2e, final verification

**Files:**
- Create:
  - `web/src/components/workspaces/ServerWorkspaces.tsx`
  - `server/scripts/make_fixtures.py`
  - `web/e2e/server/fixtures/sample.docx`, `sample.xlsx`, `sample.pptx` (generated, committed)
  - `web/e2e/server/server-tools.spec.ts`
  - `web/playwright.server.config.ts`
- Modify:
  - `web/src/components/workspaces/index.ts`
  - `web/src/tools.ts`
  - `web/tests/tools.test.ts`
  - `web/e2e/tool-shell.spec.ts`
  - `web/e2e/fixtures.ts`
  - `web/playwright.config.ts`
- Test: `web/e2e/server/server-tools.spec.ts`, plus the full suites

**Interfaces:**
- Consumes:
  - `ServerEngine` and `WorkspaceProps.status` (Task 8)
  - the Compose stack (Task 7)
  - `result-note` (Task 3)
- Produces:
  - workspaces `CompressWorkspace`, `WordToPdfWorkspace`, `ExcelToPdfWorkspace`, `PowerpointToPdfWorkspace` and `PdfToWordWorkspace`
  - the five server tools are available, so all 15 tools are live
  - e2e fixture `bigPdfUpload(name, megabytes)`

- [ ] **Step 1: Generate the Office fixtures**

`server/scripts/make_fixtures.py`:

```python
"""Writes the Office sample files used by the server e2e tests: python server/scripts/make_fixtures.py <dir>."""

import sys
from pathlib import Path

import docx
import openpyxl
from pptx import Presentation


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)

    document = docx.Document()
    document.add_heading("Sample document", 1)
    document.add_paragraph("Hello from Word.")
    document.save(out / "sample.docx")

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["Item", "Qty"])
    sheet.append(["Apples", 3])
    workbook.save(out / "sample.xlsx")

    deck = Presentation()
    for i in (1, 2):
        deck.slides.add_slide(deck.slide_layouts[0]).shapes.title.text = f"Slide {i}"
    deck.save(out / "sample.pptx")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
```

Run: `server/.venv/Scripts/python server/scripts/make_fixtures.py web/e2e/server/fixtures && ls web/e2e/server/fixtures`
Expected: `sample.docx  sample.pptx  sample.xlsx`.

- [ ] **Step 2: Write the server e2e test and its config**

Append to `web/e2e/fixtures.ts`, and add `import { randomBytes } from 'node:crypto';` and `import { PDFDocument } from 'pdf-lib';` at the top:

```ts
/** A one-page PDF padded to roughly `megabytes` with an incompressible attachment. */
export async function bigPdfUpload(name: string, megabytes: number): Promise<Upload> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  await doc.attach(randomBytes(megabytes * 1024 * 1024), 'padding.bin', { mimeType: 'application/octet-stream' });
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}
```

`web/playwright.server.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

// Server tools need the full Compose stack: run `make test-e2e-server` (or `docker compose up -d --build` first).
export default defineConfig({
  testDir: './e2e/server',
  timeout: 180_000,
  use: { baseURL: process.env.SERVER_BASE_URL ?? 'http://localhost:3000', acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

In `web/playwright.config.ts`, add `testIgnore: 'server/**',` after `testDir: './e2e',`.

`web/e2e/server/server-tools.spec.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { alertWith, bigPdfUpload, pdfUpload, readDownload } from '../fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');
const fixture = async (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: await readFile(path.join(__dirname, 'fixtures', name)),
});

async function download(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  return downloadPromise;
}

test('compress a 12 MB PDF through the /api proxy', async ({ page }) => {
  await page.goto('/compress-pdf');
  await fileInput(page).setInputFiles([await bigPdfUpload('big.pdf', 12)]);
  await page.getByLabel('High compression').check();
  await page.getByRole('button', { name: 'COMPRESS PDF' }).click();
  const note = page.getByTestId('result-note');
  await expect(note).toContainText(/Reduced from 12\.0 MB|already well compressed/, { timeout: 120_000 });
  await expect(note).toContainText('deleted from our server');
  const d = await download(page);
  expect(d.suggestedFilename()).toBe('big-compressed.pdf');
  expect((await PDFDocument.load(await readDownload(d))).getPageCount()).toBe(1);
});

const OFFICE = [
  ['word-to-pdf', 'sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1],
  ['excel-to-pdf', 'sample.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1],
  ['powerpoint-to-pdf', 'sample.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 2],
] as const;

for (const [slug, file, mime, pages] of OFFICE) {
  test(`${slug} converts ${file}`, async ({ page }) => {
    await page.goto(`/${slug}`);
    await fileInput(page).setInputFiles([await fixture(file, mime)]);
    await page.getByRole('button', { name: 'CONVERT TO PDF' }).click();
    const d = await download(page);
    expect(d.suggestedFilename()).toBe('sample.pdf');
    expect((await PDFDocument.load(await readDownload(d))).getPageCount()).toBe(pages);
  });
}

test('PDF to Word produces an editable DOCX', async ({ page }) => {
  await page.goto('/pdf-to-word');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1)]);
  await expect(page.getByText('Complex layouts')).toBeVisible();
  await page.getByRole('button', { name: 'CONVERT TO WORD' }).click();
  const d = await download(page);
  expect(d.suggestedFilename()).toBe('doc.docx');
  const zip = await JSZip.loadAsync(await readDownload(d));
  expect(await zip.file('word/document.xml')!.async('string')).toContain('Page 1');
});

test('a text file renamed to .docx is rejected before upload', async ({ page }) => {
  await page.goto('/word-to-pdf');
  await fileInput(page).setInputFiles([{ name: 'fake.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a document') }]);
  await expect(alertWith(page, "This file isn't a valid Word, Excel or PowerPoint file")).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
});
```

- [ ] **Step 3: Run the server e2e to verify it fails**

Make sure the stack from Task 7 is running (`docker compose up -d --build`). Then run:

`cd web && npx playwright test -c playwright.server.config.ts --project=chromium`

Expected: FAIL. The tool pages still show "This tool is coming soon.", so there is no dropzone.

- [ ] **Step 4: Implement `web/src/components/workspaces/ServerWorkspaces.tsx`**

```tsx
'use client';

import { FileText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatSize } from '@/lib/files';
import type { ServerEngine } from '@/lib/pdf/run';
import type { WorkspaceProps } from '.';

const PRIVACY =
  'This tool uploads your file to our server for conversion. It is deleted as soon as you have the result, and always within 1 hour.';

interface ServerToolProps extends WorkspaceProps {
  engine: ServerEngine;
  action: string;
  busyAction: string;
  opts?: object;
  children?: ReactNode;
}

function ServerTool({ inputs, run, busy, status, engine, action, busyAction, opts = {}, children }: ServerToolProps) {
  const file = inputs[0];
  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <FileText className="h-6 w-6 shrink-0 text-gray-400" aria-hidden />
        <p className="truncate font-semibold">{file.name}</p>
        <span className="ml-auto shrink-0 text-sm text-gray-500">{formatSize(file.bytes.length)}</span>
      </div>
      {children}
      <p className="mt-4 text-xs text-gray-500">{PRIVACY}</p>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-4">
        {busy && status && (
          <span role="status" className="text-sm text-gray-600">
            {status}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(engine, opts)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? busyAction : action}
        </button>
      </div>
    </div>
  );
}

const LEVELS = [
  { value: 'low', label: 'Low compression', hint: 'Best quality, smaller savings' },
  { value: 'medium', label: 'Recommended compression', hint: 'Good quality, good savings' },
  { value: 'high', label: 'High compression', hint: 'Smallest file, lower image quality' },
] as const;
type Level = (typeof LEVELS)[number]['value'];

export function CompressWorkspace(props: WorkspaceProps) {
  const [level, setLevel] = useState<Level>('medium');
  return (
    <ServerTool {...props} engine="compress" action="COMPRESS PDF" busyAction="Compressing…" opts={{ level }}>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Compression level</legend>
        {LEVELS.map((l) => (
          <label key={l.value} className="flex items-start gap-2">
            <input type="radio" name="level" className="mt-1" checked={level === l.value} onChange={() => setLevel(l.value)} />
            <span>
              <span className="font-semibold">{l.label}</span>
              <span className="block text-sm text-gray-500">{l.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </ServerTool>
  );
}

export function WordToPdfWorkspace(props: WorkspaceProps) {
  return <ServerTool {...props} engine="wordToPdf" action="CONVERT TO PDF" busyAction="Converting…" />;
}

export function ExcelToPdfWorkspace(props: WorkspaceProps) {
  return <ServerTool {...props} engine="excelToPdf" action="CONVERT TO PDF" busyAction="Converting…" />;
}

export function PowerpointToPdfWorkspace(props: WorkspaceProps) {
  return <ServerTool {...props} engine="powerpointToPdf" action="CONVERT TO PDF" busyAction="Converting…" />;
}

export function PdfToWordWorkspace(props: WorkspaceProps) {
  return (
    <ServerTool {...props} engine="pdfToWord" action="CONVERT TO WORD" busyAction="Converting…">
      <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
        Complex layouts — multiple columns, tables, unusual fonts — may not convert perfectly. Check the Word file before
        relying on it.
      </p>
    </ServerTool>
  );
}
```

- [ ] **Step 5: Register the workspaces, enable the tools, update the shell tests**

In `web/src/components/workspaces/index.ts`, import the five workspaces from `./ServerWorkspaces` and add:

```ts
  'compress-pdf': CompressWorkspace,
  'word-to-pdf': WordToPdfWorkspace,
  'excel-to-pdf': ExcelToPdfWorkspace,
  'powerpoint-to-pdf': PowerpointToPdfWorkspace,
  'pdf-to-word': PdfToWordWorkspace,
```

In `web/src/tools.ts`, set `available: true` on `compress-pdf`, `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf` and `pdf-to-word`.

In `web/tests/tools.test.ts`, replace the `enabled tools` test with:

```ts
test('every tool is enabled', () => {
  expect(TOOLS.filter((t) => !t.available)).toEqual([]);
});
```

In `web/e2e/tool-shell.spec.ts`, replace the first test with:

```ts
test('tool page renders header, dropzone and every tile', async ({ page }) => {
  await page.goto('/compress-pdf');
  await expect(page.getByRole('heading', { name: 'Compress PDF', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'SELECT PDF FILE' })).toBeVisible();
  await expect(page.getByTestId('tool-tile')).toHaveCount(TOOLS.length);
});
```

- [ ] **Step 6: Run everything**

Run from the repo root:

```bash
cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test && cd ..
cd server && .venv/Scripts/python -m pytest -q && cd ..
make test-server
make test-e2e-server
```

If `make` is not installed, run the recipe lines of `test-server` and `test-e2e-server` from `Makefile` by hand.

Expected:
- every web unit test passes; tsc and lint are clean;
- client e2e reports **129 passed**: Plan 2's 123, plus crop's 2 tests × 3 browsers. `e2e/server` is ignored by this config;
- local server tests pass, with the integration tests skipped;
- `make test-server` passes every test, integration included;
- `make test-e2e-server` reports 18 passed (6 tests × 3 browsers) and then brings the stack down.

- [ ] **Step 7: Commit**

```bash
git add server/scripts/make_fixtures.py web/e2e/server web/e2e/fixtures.ts web/playwright.server.config.ts web/playwright.config.ts web/src/components/workspaces web/src/tools.ts web/tests/tools.test.ts web/e2e/tool-shell.spec.ts
git commit -m "feat(web): enable Compress, Word/Excel/PowerPoint to PDF and PDF to Word (server tools)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
