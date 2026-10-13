# Plan 2 — Client Tools (Images, Watermark, Sign, Edit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on the six remaining browser-only tools — JPG/PNG→PDF, PDF→JPG, PDF→PNG, Watermark, Sign and Edit — so that 9 of the 14 tools work end to end with no file leaving the device.

**Architecture:** New pdf-lib engines (`imageToPdf`, `watermark`, `annotate`) run in the existing engine worker. PDF→image rasterising needs a canvas, so it runs on the main thread through pdf.js (which still parses in its own worker), behind a `runTool` dispatcher that the tool shell calls instead of `runEngine`. Every drawing engine works in one shared coordinate system ("visual space", see below) so stamps, signatures and edits land where the user put them on rotated or cropped pages. Sign and Edit share one SVG overlay editor (`PageEditor`) driven by a pure, unit-tested reducer with undo/redo.

**Tech Stack:** unchanged from Plan 1 — Node 22, Next.js 15.5, React 19.1, TypeScript strict, Tailwind v4, pdf-lib 1.17.1, pdfjs-dist 4.10.38, jszip 3.10.1, lucide-react 0.468.0, Vitest 3.2.4, Playwright 1.55.0. New: three Google script fonts through `next/font/google` (Dancing Script, Great Vibes, Caveat), self-hosted at build time like Plan 1's Inter. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-13-pdf-editor-design.md`

### Plan series

| Plan | Scope | Status |
|---|---|---|
| 1 | Scaffold, site chrome, tool shell, worker RPC, Merge, Split, Rotate, Docker `web` service | done (merged to `master`) |
| **2 (this)** | JPG/PNG→PDF, PDF→JPG, PDF→PNG, Watermark, Sign, Edit | to execute |
| 3 | FastAPI + Redis/RQ worker + sweeper, Compress, Word/Excel/PPT→PDF, PDF→Word, `/api` rewrite | written after Plan 2 lands |

### Coordinate spaces (read before Tasks 1, 6, 8, 9, 10)

| Name | Origin | y axis | Units | Used by |
|---|---|---|---|---|
| **user space** | PDF's own, can be rotated by `/Rotate` and offset by the CropBox | up | points | pdf-lib draw calls, pdf.js text positions |
| **visual space** | bottom-left of the page *as displayed* (CropBox, after `/Rotate`) | up | points | every engine's drawing code, via `drawInVisualSpace` |
| **view space** | top-left of the page as displayed | down | points | editor objects (`EditObject`), the SVG overlay (`viewBox="0 0 W H"`) |

`drawInVisualSpace(page, fn)` pushes a transformation matrix so that `fn` can draw in visual space. View → visual is just `yVisual = pageHeight - yView`.

### Deliberate refinements of the spec (apply everywhere)

- **PDF→JPG/PNG rasterises on the main thread.**
  - The spec says engines run in the worker. But this one needs a canvas, and pdf.js inside our module worker would need a nested worker, which is unreliable in Safari.
  - pdf.js still parses in its own worker; only the canvas painting is on the main thread.
  - `runTool` (Task 5) routes it; everything else still goes through the engine worker.
- **Text in Watermark and Edit is limited to Latin (WinAnsi) characters.**
  - The spec mandates the standard 14 fonts for Edit, and those fonts cannot encode other scripts.
  - Text such as `机密` is rejected with `BAD_OPTIONS`: "… can only use Latin characters (A–Z, accents and common symbols)".
  - Unicode text needs an embedded font of several MB and is out of scope here.
- **Edit offers the 12 Latin standard fonts** (Helvetica, Times and Courier families). Symbol and ZapfDingbats are left out because they do not render letters.
- **Text boxes are resized by font size, not by drag handles.** Every other object has a corner resize handle.
- **New client error code `INVALID_IMAGE`**, with the message "This file isn't a valid JPG or PNG image". Image inputs are sniffed by their bytes, not their extension.
- **JPG/PNG→PDF layout:**
  - "Fit to image" places pixels at 96 per inch (0.75 pt each).
  - Margins: none = 0, small = 20 pt, large = 40 pt.
  - On A4/Letter the image is scaled to fit the area inside the margins (up or down) and centred.
  - "Auto" orientation means landscape when the image is wider than tall.
- **EXIF orientation:**
  - JPG/PNG→PDF honours it, as phone photos would otherwise appear sideways.
  - Images inserted in Edit/Sign are redrawn upright as PNG before use.
  - Watermark images ignore it, since they are typically logos.
  - Mirrored orientations (2, 4, 5, 7) are treated as their rotation only.
- **Watermark options:**
  - rotation is one of 0°, 45°, −45° or 90°;
  - position is the 9-grid or "Tiled";
  - the 9-grid sits 36 pt from the edges;
  - an image watermark's width is a percentage of the page width.
- **Undo granularity:** one drag, one resize or one text-typing session is one undo step.
- **Output names:**
  - `<base>-page-<n>.<jpg|png>`, with `n` zero-padded to the page-count width;
  - `<base>.pdf`, or `images.pdf` for more than one image;
  - `<base>-watermarked.pdf`, `<base>-signed.pdf` and `<base>-edited.pdf`.

### Not in this plan (recorded so nobody adds them silently)

- Watermark live preview.
- Unicode/CJK text.
- Editing or reordering existing PDF pages inside Edit.
- Signatures persisting beyond the browser tab.
- ZIP file naming (still `files.zip`, a Plan 1 deferred minor).

## Global Constraints

- All web code lives in `web/`. Commands run from the repo root `C:\Users\IGS\VsCodeProjects\pdf-editor` unless they start with `cd web`.
- Work on a branch `feat/plan-2-client-tools` cut from `master`.
- Max input size is 50 MB per file (`MAX_BYTES` in `web/src/lib/files.ts`). Images picked *inside* a workspace (watermark image, inserted image, uploaded signature) obey the same cap.
- Client-tool file bytes are never sent over the network. There is no `fetch`/`XMLHttpRequest` in `web/src/lib/`.
- Every engine throws `PdfToolError(code, message)` and never a bare `Error`. User-facing headline copy comes from `ERROR_MESSAGES`.
- Spec-mandated copy stays verbatim:
  - `INVALID_FILE`: "This file isn't a valid PDF"
  - `ENCRYPTED`: "Protected PDF — remove the password first"
- PDF→JPG/PNG DPI choices are exactly 72, 150 and 300. A single page downloads as an image; several pages download as a ZIP (via the existing ResultPanel).
- Brand red `#e5322d`. The primary action button of every workspace is the red, uppercase button at the bottom right, as in Plan 1.
- E2E runs on chromium, firefox and webkit.
- The commit footer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pages with `/Rotate` or a CropBox that does not start at 0,0.** Watermarks, signatures and edits must appear upright where the user placed them, not sideways or off-page. Pinned by:
   - Task 1 `drawInVisualSpace` tests (rotated and offset);
   - Task 6 watermark tests (top-left on a `/Rotate 90` page, centre on an offset MediaBox);
   - Task 9 annotate test (text on a `/Rotate 90` page).
2. **Phone photos with EXIF orientation 6/8.** JPG/PNG→PDF pages must come out portrait for a portrait photo. Pinned by:
   - Task 2 `readImageInfo` EXIF tests;
   - Task 3 engine test (orientation-6 JPEG gives a portrait page).
3. **Non-Latin text in Watermark or Edit** (e.g. `机密`) must give a clear `BAD_OPTIONS` card, not "Something went wrong". Pinned by Task 6 and Task 9 unit tests.
4. **Huge pages at 300 DPI** (A0 posters, long strips) must still produce an image, scaled under the browser canvas limit, instead of a blank or failed render. Pinned by the Task 5 `pixelSize` tests.
5. **Wrong or lying files for image tools:**
   - a JPEG named `.png` is accepted (sniffed by content);
   - a text file named `.png` is rejected at selection with "This file isn't a valid JPG or PNG image".
   
   Pinned by the Task 2 `validate` unit test and the Task 4 e2e.

---

## File Structure

```
web/src/lib/
  image.ts                     Task 2  readImageInfo (JPEG/PNG header sniffing, EXIF), orientationRotation, displaySize
  reorder.ts                   Task 4  moveItem
  canvas.ts                    Task 10 alphaBounds, trimCanvas, canvasToPng
  signatureFonts.ts            Task 10 three next/font script fonts
  editor/model.ts              Task 8  EditObject types, reducer (undo/redo), bounds/translate/resize/withStyle, penPath
  editor/prepareImage.ts       Task 10 read + EXIF-normalise an image picked in Sign/Edit
  pdf/color.ts                 Task 1  hexColor
  pdf/geometry.ts              Task 1  visual space, drawInVisualSpace, rotatedOrigin/Bounds
  pdf/embedImage.ts            Task 3  embedImage, drawImageInBox
  pdf/imageToPdf.ts            Task 3  engine + layoutImage
  pdf/pdfToImages.ts           Task 5  main-thread engine + pixelSize + PageRenderer interface
  pdf/pdfjsRenderer.ts         Task 5  browser PageRenderer on pdf.js
  pdf/run.ts                   Task 5  runTool dispatcher (main-thread vs worker engines)
  pdf/watermark.ts             Task 6  engine + anchorCenter/tileCenters
  pdf/annotate.ts              Task 9  engine (flattens EditObjects)
  pdf/usePdfRenderer.ts        Task 10 React hook: renderer + page sizes
  pdf/errors.ts                Task 2  (modify) INVALID_IMAGE
  pdf/engines.ts               Tasks 2,3,6,9 (modify) validate images; register engines
  pdf/render.ts                Task 5  (modify) export getPdfjs
web/src/components/
  ToolShell.tsx                Tasks 2,5 (modify) validate all inputs, onError, runTool
  workspaces/index.ts          Tasks 2,4,5,7,10,11 (modify) props + map
  workspaces/MergeWorkspace.tsx      Task 4 (modify) use moveItem
  workspaces/ImageToPdfWorkspace.tsx Task 4
  workspaces/PdfToImageWorkspace.tsx Task 5
  workspaces/WatermarkWorkspace.tsx  Task 7
  workspaces/SignWorkspace.tsx       Task 10
  workspaces/EditWorkspace.tsx       Task 11
  editor/PageView.tsx          Task 10
  editor/PageEditor.tsx        Task 10
  sign/SignatureCreator.tsx    Task 10
web/src/tools.ts               Tasks 4,5,7,10,11 (modify) available: true
web/tests/                     unit tests per task; helpers.ts extended in Tasks 1, 2
web/e2e/                       image-to-pdf, pdf-to-image, watermark, sign, edit specs; fixtures.ts extended in Task 2
```

---

### Task 1: Visual-space geometry and color helpers

**Files:**
- Create: `web/src/lib/pdf/geometry.ts`, `web/src/lib/pdf/color.ts`
- Modify: `web/tests/helpers.ts` (adds a `mediaBox` option to `makePdf`, and `pageText`)
- Test: `web/tests/geometry.test.ts`, `web/tests/color.test.ts`

**Interfaces:**
- Consumes: pdf-lib `PDFPage`, `pushGraphicsState`, `popGraphicsState`, `concatTransformationMatrix`; `PdfToolError` from `web/src/lib/pdf/errors.ts`.
- Produces:
  - `interface Size { width: number; height: number }`
  - `interface Box extends Size { x: number; y: number }`
  - `type Matrix = [number, number, number, number, number, number]`
  - `normRotation(deg: number): 0 | 90 | 180 | 270`
  - `visualSize(box: Size, rotation: number): Size`
  - `visualToUser(box: Box, rotation: number): Matrix`
  - `apply(m: Matrix, x: number, y: number): [number, number]`
  - `drawInVisualSpace(page: PDFPage, draw: (size: Size) => void): void`
  - `rotatedOrigin(cx, cy, w, h, deg): [number, number]` and `rotatedBounds(w, h, deg): Size`
  - `hexColor(hex: string): RGB`, which throws `BAD_OPTIONS`
  - test helpers `makePdf(pages, { rotate?, size?, mediaBox?: [x, y, w, h] })` and `pageText(bytes): Promise<TextItem[][]>`, where `TextItem = { str: string; x: number; y: number }` in user space

- [ ] **Step 1: Extend the test helpers**

In `web/tests/helpers.ts`, replace `makePdf` with the version below and append `TextItem` and `pageText`:

```ts
export async function makePdf(
  pages: number,
  opts: { rotate?: number; size?: [number, number]; mediaBox?: [number, number, number, number] } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(opts.size ?? [200, 300]);
    if (opts.mediaBox) page.setMediaBox(...opts.mediaBox);
    page.drawText(`Page ${i + 1}`, { x: 20, y: 20, size: 12 });
    if (opts.rotate) page.setRotation(degrees(opts.rotate));
  }
  return doc.save();
}
```

```ts
export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/** Non-blank text items per page, positioned in PDF user space (pdf.js text extraction). */
export async function pageText(bytes: Uint8Array): Promise<TextItem[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    const pages: TextItem[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { items } = await (await doc.getPage(i)).getTextContent();
      pages.push(
        items.flatMap((it) => ('str' in it && it.str.trim() ? [{ str: it.str, x: it.transform[4], y: it.transform[5] }] : [])),
      );
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 2: Write the failing tests**

`web/tests/geometry.test.ts`:

```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from 'vitest';
import {
  apply,
  drawInVisualSpace,
  normRotation,
  rotatedBounds,
  rotatedOrigin,
  visualSize,
  visualToUser,
  type Size,
} from '@/lib/pdf/geometry';
import { makePdf, pageText } from './helpers';

const box = { x: 10, y: 20, width: 200, height: 300 };

test('normRotation', () => {
  expect([0, 90, 180, 270, 360, -90, 450].map(normRotation)).toEqual([0, 90, 180, 270, 0, 270, 90]);
});

test('visualSize swaps width and height for 90 and 270', () => {
  expect(visualSize(box, 0)).toEqual({ width: 200, height: 300 });
  expect(visualSize(box, 90)).toEqual({ width: 300, height: 200 });
  expect(visualSize(box, 180)).toEqual({ width: 200, height: 300 });
  expect(visualSize(box, 270)).toEqual({ width: 300, height: 200 });
});

test('visualToUser maps the displayed bottom-left and top-left corners', () => {
  // [rotation, user point of visual (0,0), user point of the visual top-left corner]
  const cases: [number, [number, number], [number, number]][] = [
    [0, [10, 20], [10, 320]],
    [90, [210, 20], [10, 20]],
    [180, [210, 320], [210, 20]],
    [270, [10, 320], [210, 320]],
  ];
  for (const [r, bottomLeft, topLeft] of cases) {
    const m = visualToUser(box, r);
    expect(apply(m, 0, 0)).toEqual(bottomLeft);
    expect(apply(m, 0, visualSize(box, r).height)).toEqual(topLeft);
  }
});

async function drawMark(pdf: Uint8Array): Promise<{ seen: Size | undefined; at: { x: number; y: number } }> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPage(0);
  let seen: Size | undefined;
  drawInVisualSpace(page, (size) => {
    seen = size;
    page.drawText('MARK', { x: 10, y: 10, size: 12, font });
  });
  const [items] = await pageText(await doc.save());
  return { seen, at: items.find((t) => t.str === 'MARK')! };
}

test('drawInVisualSpace: visual (10,10) on a /Rotate 90 page lands at user (190,10)', async () => {
  const { seen, at } = await drawMark(await makePdf(1, { rotate: 90 }));
  expect(seen).toEqual({ width: 300, height: 200 });
  expect(at.x).toBeCloseTo(190);
  expect(at.y).toBeCloseTo(10);
});

test('drawInVisualSpace honours a CropBox that does not start at 0,0', async () => {
  const { seen, at } = await drawMark(await makePdf(1, { mediaBox: [50, 60, 200, 300] }));
  expect(seen).toEqual({ width: 200, height: 300 });
  expect(at.x).toBeCloseTo(60);
  expect(at.y).toBeCloseTo(70);
});

test('rotatedOrigin keeps a box centred on (cx, cy)', () => {
  const [x0, y0] = rotatedOrigin(100, 100, 40, 20, 0);
  expect(x0).toBeCloseTo(80);
  expect(y0).toBeCloseTo(90);
  const [x90, y90] = rotatedOrigin(100, 100, 40, 20, 90);
  expect(x90).toBeCloseTo(110);
  expect(y90).toBeCloseTo(80);
});

test('rotatedBounds', () => {
  const b = rotatedBounds(40, 20, 90);
  expect(b.width).toBeCloseTo(20);
  expect(b.height).toBeCloseTo(40);
  const d = rotatedBounds(10, 10, 45);
  expect(d.width).toBeCloseTo(Math.SQRT2 * 10);
});
```

`web/tests/color.test.ts`:

```ts
import { expect, test } from 'vitest';
import { hexColor } from '@/lib/pdf/color';
import type { PdfToolError } from '@/lib/pdf/errors';

test('hexColor parses #rrggbb in either case', () => {
  expect(hexColor('#FF8000')).toMatchObject({ red: 1, green: 128 / 255, blue: 0 });
  expect(hexColor('#e5322d')).toMatchObject({ red: 229 / 255, green: 50 / 255, blue: 45 / 255 });
});

test('hexColor rejects anything else as BAD_OPTIONS', () => {
  for (const bad of ['red', '#fff', '#12345g', '']) {
    let code: string | undefined;
    try {
      hexColor(bad);
    } catch (e) {
      code = (e as PdfToolError).code;
    }
    expect(code).toBe('BAD_OPTIONS');
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/geometry.test.ts tests/color.test.ts`
Expected: FAIL. Both files fail to resolve `@/lib/pdf/geometry` or `@/lib/pdf/color`.

- [ ] **Step 4: Implement**

`web/src/lib/pdf/color.ts`:

```ts
import { rgb, type RGB } from 'pdf-lib';
import { PdfToolError } from './errors';

/** "#e5322d" -> pdf-lib RGB. Anything else is BAD_OPTIONS. */
export function hexColor(hex: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new PdfToolError('BAD_OPTIONS', `"${hex}" isn't a valid color`);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
```

`web/src/lib/pdf/geometry.ts`:

```ts
import { concatTransformationMatrix, popGraphicsState, pushGraphicsState, type PDFPage } from 'pdf-lib';

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

export type Matrix = [number, number, number, number, number, number];

export function normRotation(deg: number): 0 | 90 | 180 | 270 {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

/** Size of the page as a viewer shows it: the CropBox, swapped for 90/270 rotation. */
export function visualSize(box: Size, rotation: number): Size {
  const r = normRotation(rotation);
  return r === 90 || r === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

/**
 * Matrix from visual space (origin at the bottom-left of the page as displayed, y up, points)
 * to PDF user space, for a page with this CropBox and /Rotate.
 */
export function visualToUser(box: Box, rotation: number): Matrix {
  const { x, y, width: w, height: h } = box;
  switch (normRotation(rotation)) {
    case 0:
      return [1, 0, 0, 1, x, y];
    case 90:
      return [0, 1, -1, 0, x + w, y];
    case 180:
      return [-1, 0, 0, -1, x + w, y + h];
    case 270:
      return [0, -1, 1, 0, x, y + h];
  }
}

export function apply(m: Matrix, px: number, py: number): [number, number] {
  return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]];
}

/** Runs `draw` with the page's coordinate system switched to visual space. */
export function drawInVisualSpace(page: PDFPage, draw: (size: Size) => void): void {
  const box = page.getCropBox();
  const rotation = page.getRotation().angle;
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...visualToUser(box, rotation)));
  draw(visualSize(box, rotation));
  page.pushOperators(popGraphicsState());
}

/** Bottom-left origin for drawing a w×h box rotated `deg` (counter-clockwise) about its centre (cx, cy). */
export function rotatedOrigin(cx: number, cy: number, w: number, h: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return [cx - (w / 2) * cos + (h / 2) * sin, cy - (w / 2) * sin - (h / 2) * cos];
}

/** Axis-aligned size of a w×h box rotated by `deg`. */
export function rotatedBounds(w: number, h: number, deg: number): Size {
  const t = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  return { width: w * cos + h * sin, height: w * sin + h * cos };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/geometry.test.ts tests/color.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/pdf/geometry.ts web/src/lib/pdf/color.ts web/tests/geometry.test.ts web/tests/color.test.ts web/tests/helpers.ts
git commit -m "feat(web): add visual-space geometry and color helpers for page drawing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Image intake — sniffing, `INVALID_IMAGE`, validating every input

**Files:**
- Create: `web/src/lib/image.ts`
- Modify:
  - `web/src/lib/pdf/errors.ts`
  - `web/src/lib/pdf/engines.ts`
  - `web/src/components/ToolShell.tsx`
  - `web/src/components/workspaces/index.ts`
  - `web/tests/helpers.ts`
  - `web/e2e/fixtures.ts`
- Test:
  - `web/tests/image.test.ts`
  - `web/tests/engines.test.ts` (modify)
  - `web/tests/errors.test.ts` (modify)

**Interfaces:**
- Consumes: `loadPdf` (`web/src/lib/pdf/load.ts`), `extensionOf` (`web/src/lib/files.ts`).
- Produces:
  - `interface ImageInfo { type: 'jpg' | 'png'; width: number; height: number; orientation: number }` (`width`/`height` are the stored pixel size; `orientation` is EXIF 1–8, or 1 for PNG)
  - `readImageInfo(bytes: Uint8Array): ImageInfo | null`
  - `orientationRotation(o: number): 0 | 90 | 180 | 270` (clockwise)
  - `displaySize(info: ImageInfo): { width: number; height: number }`
  - `ErrorCode` gains `'INVALID_IMAGE'`
  - the `validate` engine accepts `.jpg`/`.jpeg`/`.png` inputs by content
  - `WorkspaceProps` gains `onError: (error: PdfToolError) => void`
  - test helpers `makePng(w, h)`, `tinyJpeg()` (a 4×2 JPEG), `withExifOrientation(jpeg, o, littleEndian?)` and `imageCounts(pdf): Promise<number[]>` (image XObjects per page)
  - e2e fixtures `pngUpload(name, w, h)` and `jpgUpload(name)`

- [ ] **Step 1: Add the image test helpers**

Append to `web/tests/helpers.ts`, and add `PDFDict, PDFName, PDFStream` to its `pdf-lib` import plus `import { deflateSync } from 'node:zlib';` at the top:

```ts
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function pngChunk(type: string, data: Uint8Array): number[] {
  const typed = [...[...type].map((ch) => ch.charCodeAt(0)), ...data];
  return [...u32(data.length), ...typed, ...u32(crc32(typed))];
}

/** A valid 8-bit RGB PNG of the given size. */
export function makePng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = 255;
      raw[o + 1] = (x * 40) & 255;
      raw[o + 2] = (y * 40) & 255;
    }
  }
  const ihdr = Uint8Array.from([...u32(width), ...u32(height), 8, 2, 0, 0, 0]);
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', deflateSync(raw)),
    ...pngChunk('IEND', new Uint8Array()),
  ]);
}

/** 4×2 baseline JPEG (left half red, right half blue), encoded by Chromium. */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAaEAEAAQUAAAAAAAAAAAAAAAAAAgQGNoOz/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwn/xAAcEQAABwEBAAAAAAAAAAAAAAAAAgMFBjazc3T/2gAMAwEAAhEDEQA/AIWvzK67XziAo1BKm0+ZDIoCZ2dz7raGH//Z';

/**
 * Fresh copy each call. Uint8Array.from matters: pdf-lib's JPEG parser ignores byteOffset,
 * so a pooled Buffer view fails with "SOI not found".
 */
export function tinyJpeg(): Uint8Array {
  return Uint8Array.from(Buffer.from(TINY_JPEG_BASE64, 'base64'));
}

/** Inserts an EXIF APP1 segment carrying only an Orientation tag right after the JPEG's SOI marker. */
export function withExifOrientation(jpeg: Uint8Array, orientation: number, littleEndian = false): Uint8Array {
  const tiff = littleEndian
    ? [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]
    : [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  return Uint8Array.from([...jpeg.slice(0, 2), 0xff, 0xe1, len >> 8, len & 255, ...payload, ...jpeg.slice(2)]);
}

/** Number of image XObjects referenced from each page's resources. */
export async function imageCounts(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) return 0;
    return xobjects.entries().filter(([, ref]) => {
      const obj = doc.context.lookup(ref);
      return obj instanceof PDFStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image');
    }).length;
  });
}
```

Append to `web/e2e/fixtures.ts`, and extend its helpers import to `import { makeEncryptedPdf, makePdf, makePng, tinyJpeg } from '../tests/helpers';`:

```ts
export function pngUpload(name: string, width: number, height: number): Upload {
  return { name, mimeType: 'image/png', buffer: Buffer.from(makePng(width, height)) };
}

export function jpgUpload(name: string): Upload {
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(tinyJpeg()) };
}
```

- [ ] **Step 2: Write the failing tests**

`web/tests/image.test.ts`:

```ts
import { expect, test } from 'vitest';
import { displaySize, orientationRotation, readImageInfo } from '@/lib/image';
import { makePng, tinyJpeg, withExifOrientation } from './helpers';

test('reads PNG type and size', () => {
  expect(readImageInfo(makePng(30, 20))).toEqual({ type: 'png', width: 30, height: 20, orientation: 1 });
});

test('reads JPEG type and size', () => {
  expect(readImageInfo(tinyJpeg())).toEqual({ type: 'jpg', width: 4, height: 2, orientation: 1 });
});

test('reads EXIF orientation in both byte orders', () => {
  expect(readImageInfo(withExifOrientation(tinyJpeg(), 6))).toMatchObject({ width: 4, height: 2, orientation: 6 });
  expect(readImageInfo(withExifOrientation(tinyJpeg(), 8, true))).toMatchObject({ orientation: 8 });
});

test('works on a view into a larger buffer', () => {
  const png = makePng(5, 7);
  const padded = new Uint8Array(png.length + 10);
  padded.set(png, 10);
  expect(readImageInfo(padded.subarray(10))).toMatchObject({ type: 'png', width: 5, height: 7 });
});

test('rejects non-images and truncated headers', () => {
  expect(readImageInfo(new TextEncoder().encode('hello, not an image'))).toBeNull();
  expect(readImageInfo(makePng(1, 1).slice(0, 10))).toBeNull();
  expect(readImageInfo(tinyJpeg().slice(0, 20))).toBeNull();
  expect(readImageInfo(new Uint8Array())).toBeNull();
});

test('orientationRotation and displaySize', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 8].map(orientationRotation)).toEqual([0, 0, 180, 180, 270, 90, 90, 270]);
  expect(displaySize({ type: 'jpg', width: 4, height: 2, orientation: 6 })).toEqual({ width: 2, height: 4 });
  expect(displaySize({ type: 'jpg', width: 4, height: 2, orientation: 3 })).toEqual({ width: 4, height: 2 });
});
```

Append to `web/tests/engines.test.ts`, and add `makePng, tinyJpeg` to its helpers import:

```ts
test('validate accepts JPG/PNG by content, whatever the extension says', async () => {
  const files = [input('a.png', makePng(2, 2)), input('b.jpg', tinyJpeg()), input('really-a-jpeg.png', tinyJpeg())];
  expect(await engines.validate(files, {})).toEqual([]);
});

test('validate rejects non-image bytes with an image extension as INVALID_IMAGE', async () => {
  await expect(engines.validate([input('x.png', new TextEncoder().encode('nope'))], {})).rejects.toMatchObject({
    code: 'INVALID_IMAGE',
  });
});
```

Append to `web/tests/errors.test.ts`:

```ts
test('INVALID_IMAGE copy', () => {
  expect(ERROR_MESSAGES.INVALID_IMAGE).toBe("This file isn't a valid JPG or PNG image");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/image.test.ts tests/engines.test.ts tests/errors.test.ts`
Expected: FAIL. `image.test.ts` cannot resolve `@/lib/image`; the engines test fails because the PDF loader rejects the PNG with `INVALID_FILE`; the errors test fails because `INVALID_IMAGE` is undefined.

- [ ] **Step 4: Implement `web/src/lib/image.ts`**

```ts
export interface ImageInfo {
  type: 'jpg' | 'png';
  /** Pixel size as stored, before EXIF orientation. */
  width: number;
  height: number;
  /** EXIF orientation 1-8 (1 = as stored). Always 1 for PNG. */
  orientation: number;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
// Start-of-frame markers that carry the image size (excludes DHT 0xC4, JPG 0xC8, DAC 0xCC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Reads type, size and EXIF orientation from the file headers only. Null for anything but JPEG/PNG. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { type: 'png', width, height, orientation: 1 } : null;
  }

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // markers without a length field
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan data before any frame header
    const length = view.getUint16(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    if (marker === 0xe1) orientation = exifOrientation(bytes, view, i + 4, length - 2) ?? orientation;
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const height = view.getUint16(i + 5);
      const width = view.getUint16(i + 7);
      return width > 0 && height > 0 ? { type: 'jpg', width, height, orientation } : null;
    }
    i += 2 + length;
  }
  return null;
}

function exifOrientation(bytes: Uint8Array, view: DataView, start: number, length: number): number | null {
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
  if (length < 14 || !exifHeader.every((b, k) => bytes[start + k] === b)) return null;
  const tiff = start + 6;
  const end = start + length;
  const little = bytes[tiff] === 0x49; // "II"
  if (!little && bytes[tiff] !== 0x4d) return null; // "MM"
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Clockwise rotation a viewer applies for an EXIF orientation. Mirroring (2, 4, 5, 7) is ignored. */
export function orientationRotation(orientation: number): 0 | 90 | 180 | 270 {
  if (orientation === 3 || orientation === 4) return 180;
  if (orientation === 6 || orientation === 7) return 90;
  if (orientation === 5 || orientation === 8) return 270;
  return 0;
}

/** Pixel size as displayed, after EXIF orientation. */
export function displaySize(info: ImageInfo): { width: number; height: number } {
  const r = orientationRotation(info.orientation);
  return r === 90 || r === 270 ? { width: info.height, height: info.width } : { width: info.width, height: info.height };
}
```

- [ ] **Step 5: Add `INVALID_IMAGE` and validate images**

In `web/src/lib/pdf/errors.ts`, add `| 'INVALID_IMAGE'` to `ErrorCode` after `'INVALID_FILE'`, and add this entry to `ERROR_MESSAGES` after `INVALID_FILE`:

```ts
  INVALID_IMAGE: "This file isn't a valid JPG or PNG image",
```

In `web/src/lib/pdf/engines.ts`, replace the `validate` definition and add the imports:

```ts
import { extensionOf } from '../files';
import { readImageInfo } from '../image';
import { PdfToolError } from './errors';
```

```ts
/** Checks every input at selection time: PDFs are parsed (ENCRYPTED / INVALID_FILE), images are sniffed (INVALID_IMAGE). */
const validate: Engine<Record<string, never>> = async (inputs) => {
  for (const f of inputs) {
    if (extensionOf(f.name) === '.pdf') await loadPdf(f);
    else if (!readImageInfo(f.bytes)) throw new PdfToolError('INVALID_IMAGE', `${f.name} isn't a valid JPG or PNG image`);
  }
  return [];
};
```

- [ ] **Step 6: Validate every input in ToolShell, and pass `onError` to workspaces**

In `web/src/components/ToolShell.tsx`, inside `accept`, replace:

```ts
      const pdfs = read.filter((f) => extensionOf(f.name) === '.pdf');
      if (pdfs.length > 0) await runEngine('validate', pdfs, {});
```

with:

```ts
      await runEngine('validate', read, {});
```

and add `onError={setError}` to the `<Workspace … />` element, after `onAddFiles={addFiles}`.

In `web/src/components/workspaces/index.ts`, add `import type { PdfToolError } from '@/lib/pdf/errors';` and add this field to `WorkspaceProps`, after `run`:

```ts
  /** Shows an error card above the workspace, e.g. for a bad image picked inside the workspace. */
  onError: (error: PdfToolError) => void;
```

- [ ] **Step 7: Run unit tests, types and lint**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint`
Expected: every unit test passes (the 56 existing tests plus the new ones); `tsc` and `lint` report no errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/image.ts web/src/lib/pdf/errors.ts web/src/lib/pdf/engines.ts web/src/components/ToolShell.tsx web/src/components/workspaces/index.ts web/tests web/e2e/fixtures.ts
git commit -m "feat(web): sniff JPG/PNG inputs and validate every selected file

Adds INVALID_IMAGE, EXIF orientation parsing and an onError prop for workspaces.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `imageToPdf` engine

**Files:**
- Create: `web/src/lib/pdf/embedImage.ts`, `web/src/lib/pdf/imageToPdf.ts`
- Modify: `web/src/lib/pdf/engines.ts`, `web/tests/engines.test.ts`
- Test: `web/tests/imageToPdf.test.ts`

**Interfaces:**
- Consumes:
  - `readImageInfo`, `displaySize` and `orientationRotation` (Task 2)
  - `baseName` (`web/src/lib/pdf/load.ts`)
  - `Size` (Task 1)
- Produces:
  - `interface EmbeddedImage { image: PDFImage; rotation: 0 | 90 | 180 | 270 }`
  - `embedImage(doc, bytes: Uint8Array | undefined, label: string): Promise<EmbeddedImage>`, which throws `INVALID_IMAGE` with "`<label>` isn't a valid JPG or PNG image"
  - `drawImageInBox(page, img: EmbeddedImage, box: { x; y; width; height }): void`, where the box is bottom-left origin with y up, and the image is drawn upright after its EXIF rotation
  - `type ImageToPdfOptions = { pageSize: 'fit' | 'a4' | 'letter'; orientation: 'auto' | 'portrait' | 'landscape'; margin: 'none' | 'small' | 'large' }`
  - `layoutImage(display: Size, opts): { pageWidth; pageHeight; x; y; width; height }`
  - `imageToPdf: Engine<ImageToPdfOptions>`, registered as engine `'imageToPdf'`

- [ ] **Step 1: Write the failing tests**

`web/tests/imageToPdf.test.ts`:

```ts
import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import { imageToPdf, layoutImage, type ImageToPdfOptions } from '@/lib/pdf/imageToPdf';
import { imageCounts, input, makePng, tinyJpeg, withExifOrientation } from './helpers';

const FIT: ImageToPdfOptions = { pageSize: 'fit', orientation: 'auto', margin: 'none' };
const A4: ImageToPdfOptions = { pageSize: 'a4', orientation: 'auto', margin: 'none' };

async function pageSizes(bytes: Uint8Array): Promise<[number, number][]> {
  return (await PDFDocument.load(bytes)).getPages().map((p) => [+p.getWidth().toFixed(2), +p.getHeight().toFixed(2)]);
}

test('fit: page is the image at 96 px per inch, plus margins', () => {
  expect(layoutImage({ width: 40, height: 20 }, FIT)).toEqual({ pageWidth: 30, pageHeight: 15, x: 0, y: 0, width: 30, height: 15 });
  expect(layoutImage({ width: 40, height: 20 }, { ...FIT, margin: 'small' })).toEqual({
    pageWidth: 70, pageHeight: 55, x: 20, y: 20, width: 30, height: 15,
  });
});

test('a4 auto goes landscape for a wide image and centres it', () => {
  const l = layoutImage({ width: 400, height: 200 }, A4);
  expect(l.pageWidth).toBeCloseTo(841.89);
  expect(l.pageHeight).toBeCloseTo(595.28);
  expect(l.width).toBeCloseTo(841.89);
  expect(l.height).toBeCloseTo(841.89 / 2);
  expect(l.x).toBeCloseTo(0);
  expect(l.y).toBeCloseTo((595.28 - 841.89 / 2) / 2);
});

test('forced portrait with a large margin scales into the margin box', () => {
  const l = layoutImage({ width: 400, height: 200 }, { pageSize: 'a4', orientation: 'portrait', margin: 'large' });
  expect(l.pageWidth).toBeCloseTo(595.28);
  expect(l.width).toBeCloseTo(595.28 - 80);
  expect(l.x).toBeCloseTo(40);
  expect(l.y).toBeCloseTo((841.89 - (595.28 - 80) / 2) / 2);
});

test('letter auto stays portrait for a tall image', () => {
  expect(layoutImage({ width: 100, height: 300 }, { ...A4, pageSize: 'letter' })).toMatchObject({ pageWidth: 612, pageHeight: 792 });
});

test('one page per image, in input order, named images.pdf', async () => {
  const out = await imageToPdf([input('wide.png', makePng(40, 20)), input('tiny.jpg', tinyJpeg())], FIT);
  expect(out).toHaveLength(1);
  expect(out[0].name).toBe('images.pdf');
  expect(out[0].mime).toBe('application/pdf');
  expect(await pageSizes(out[0].bytes)).toEqual([[30, 15], [3, 1.5]]);
  expect(await imageCounts(out[0].bytes)).toEqual([1, 1]);
});

test('a single image is named after the image', async () => {
  const [out] = await imageToPdf([input('scan.png', makePng(4, 4))], A4);
  expect(out.name).toBe('scan.pdf');
});

test('EXIF orientation 6 (phone held upright) gives a portrait page', async () => {
  const [out] = await imageToPdf([input('photo.jpg', withExifOrientation(tinyJpeg(), 6))], FIT);
  expect(await pageSizes(out.bytes)).toEqual([[1.5, 3]]);
});

test('typed errors', async () => {
  await expect(imageToPdf([input('x.png', new TextEncoder().encode('nope'))], FIT)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  await expect(imageToPdf([], FIT)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    imageToPdf([input('a.png', makePng(2, 2))], { ...FIT, pageSize: 'a3' } as unknown as ImageToPdfOptions),
  ).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});
```

In `web/tests/engines.test.ts`, change the registry assertion to:

```ts
test('registry exposes the worker engines', () => {
  expect(Object.keys(engines).sort()).toEqual(['imageToPdf', 'merge', 'rotate', 'split', 'validate']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/imageToPdf.test.ts tests/engines.test.ts`
Expected: FAIL. `@/lib/pdf/imageToPdf` cannot be resolved, and the registry test lacks `imageToPdf`.

- [ ] **Step 3: Implement `web/src/lib/pdf/embedImage.ts`**

```ts
import { degrees, type PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib';
import { orientationRotation, readImageInfo } from '../image';
import { PdfToolError } from './errors';

export interface EmbeddedImage {
  image: PDFImage;
  /** Clockwise rotation a viewer applies to show the image upright (from EXIF). */
  rotation: 0 | 90 | 180 | 270;
}

export async function embedImage(doc: PDFDocument, bytes: Uint8Array | undefined, label: string): Promise<EmbeddedImage> {
  const info = bytes ? readImageInfo(bytes) : null;
  if (!bytes || !info) throw new PdfToolError('INVALID_IMAGE', `${label} isn't a valid JPG or PNG image`);
  try {
    const image = info.type === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    return { image, rotation: orientationRotation(info.orientation) };
  } catch {
    throw new PdfToolError('INVALID_IMAGE', `${label} couldn't be read — the image may be damaged`);
  }
}

export interface PlacedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the image upright (after its EXIF rotation) so that it exactly fills `box`.
 * The box uses a bottom-left origin with y up; pdf-lib rotates images about their (x, y) corner.
 */
export function drawImageInBox(page: PDFPage, { image, rotation }: EmbeddedImage, box: PlacedBox): void {
  const { x, y, width: w, height: h } = box;
  switch (rotation) {
    case 0:
      page.drawImage(image, { x, y, width: w, height: h });
      break;
    case 90:
      page.drawImage(image, { x, y: y + h, width: h, height: w, rotate: degrees(-90) });
      break;
    case 180:
      page.drawImage(image, { x: x + w, y: y + h, width: w, height: h, rotate: degrees(180) });
      break;
    case 270:
      page.drawImage(image, { x: x + w, y, width: h, height: w, rotate: degrees(90) });
      break;
  }
}
```

- [ ] **Step 4: Implement `web/src/lib/pdf/imageToPdf.ts`**

```ts
import { PDFDocument } from 'pdf-lib';
import { displaySize, readImageInfo } from '../image';
import { drawImageInBox, embedImage } from './embedImage';
import { PdfToolError } from './errors';
import type { Size } from './geometry';
import { baseName } from './load';
import { PDF_MIME, type Engine } from './types';

export type ImageToPdfOptions = {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: 'none' | 'small' | 'large';
};

/** Portrait [width, height] in points. */
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS = { none: 0, small: 20, large: 40 } as const;
const ORIENTATIONS = ['auto', 'portrait', 'landscape'];
/** "Fit to image" places pixels at 96 per inch. */
const PT_PER_PX = 0.75;

export interface ImageLayout {
  pageWidth: number;
  pageHeight: number;
  /** The image box, bottom-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page size and image box for an image whose *displayed* pixel size is `display`. */
export function layoutImage(display: Size, opts: ImageToPdfOptions): ImageLayout {
  const m = MARGINS[opts.margin];
  if (opts.pageSize === 'fit') {
    const width = display.width * PT_PER_PX;
    const height = display.height * PT_PER_PX;
    return { pageWidth: width + 2 * m, pageHeight: height + 2 * m, x: m, y: m, width, height };
  }
  const [short, long] = PAGE_SIZES[opts.pageSize];
  const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && display.width > display.height);
  const pageWidth = landscape ? long : short;
  const pageHeight = landscape ? short : long;
  const scale = Math.min((pageWidth - 2 * m) / display.width, (pageHeight - 2 * m) / display.height);
  const width = display.width * scale;
  const height = display.height * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

export const imageToPdf: Engine<ImageToPdfOptions> = async (inputs, opts) => {
  if (inputs.length === 0) throw new PdfToolError('BAD_OPTIONS', 'Add at least one image');
  if (
    !(opts.pageSize === 'fit' || opts.pageSize in PAGE_SIZES) ||
    !(opts.margin in MARGINS) ||
    !ORIENTATIONS.includes(opts.orientation)
  ) {
    throw new PdfToolError('BAD_OPTIONS', 'Choose a page size, orientation and margin');
  }

  const doc = await PDFDocument.create();
  for (const file of inputs) {
    const info = readImageInfo(file.bytes);
    if (!info) throw new PdfToolError('INVALID_IMAGE', `${file.name} isn't a valid JPG or PNG image`);
    const embedded = await embedImage(doc, file.bytes, file.name);
    const layout = layoutImage(displaySize(info), opts);
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    drawImageInBox(page, embedded, layout);
  }
  const name = inputs.length === 1 ? `${baseName(inputs[0].name)}.pdf` : 'images.pdf';
  return [{ name, bytes: await doc.save(), mime: PDF_MIME }];
};
```

- [ ] **Step 5: Register the engine**

In `web/src/lib/pdf/engines.ts`, add `import { imageToPdf } from './imageToPdf';` and change the export to:

```ts
export const engines = { validate, merge, split, rotate, imageToPdf };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/imageToPdf.test.ts tests/engines.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/pdf/embedImage.ts web/src/lib/pdf/imageToPdf.ts web/src/lib/pdf/engines.ts web/tests/imageToPdf.test.ts web/tests/engines.test.ts
git commit -m "feat(web): add imageToPdf engine with page size, orientation, margin and EXIF support

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: JPG/PNG→PDF workspace (tool goes live)

**Files:**
- Create: `web/src/lib/reorder.ts`, `web/src/components/workspaces/ImageToPdfWorkspace.tsx`, `web/e2e/image-to-pdf.spec.ts`
- Modify:
  - `web/src/components/workspaces/MergeWorkspace.tsx`
  - `web/src/components/workspaces/index.ts`
  - `web/src/tools.ts`
  - `web/tests/tools.test.ts`
  - `web/e2e/home.spec.ts`
- Test: `web/tests/reorder.test.ts`, `web/e2e/image-to-pdf.spec.ts`

**Interfaces:**
- Consumes:
  - `WorkspaceProps` (with `onError`, Task 2)
  - `ImageToPdfOptions` and engine `'imageToPdf'` (Task 3)
  - fixtures `pngUpload` and `jpgUpload` (Task 2)
- Produces:
  - `moveItem<T>(list: T[], from: number, to: number): T[]`, which returns the same array when the move is a no-op
  - `ImageToPdfWorkspace`, mapped under `'image-to-pdf'`
  - `image-to-pdf` becomes `available: true`

- [ ] **Step 1: Write the failing tests**

`web/tests/reorder.test.ts`:

```ts
import { expect, test } from 'vitest';
import { moveItem } from '@/lib/reorder';

test('moves an item and returns a new array', () => {
  const list = ['a', 'b', 'c'];
  expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b']);
  expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
  expect(list).toEqual(['a', 'b', 'c']);
});

test('no-op moves return the same array', () => {
  const list = ['a', 'b'];
  expect(moveItem(list, 1, 1)).toBe(list);
  expect(moveItem(list, 0, -1)).toBe(list);
  expect(moveItem(list, 1, 2)).toBe(list);
});
```

`web/e2e/image-to-pdf.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { alertWith, jpgUpload, pngUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('images become one PDF in the chosen order', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await expect(page.getByRole('button', { name: 'SELECT IMAGES' })).toBeVisible();
  await fileInput(page).setInputFiles([pngUpload('tall.png', 200, 300), jpgUpload('wide.jpg')]);
  await expect(page.getByTestId('image-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Move wide.jpg left' }).click();
  await expect(page.getByTestId('image-item').first()).toContainText('wide.jpg');

  await page.getByRole('button', { name: 'CONVERT TO PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('images.pdf');

  const doc = await PDFDocument.load(await readDownload(download));
  // Defaults are A4 / auto / small margin: the wide image gives a landscape page, the tall one a portrait page.
  expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([842, 595]);
});

test('fit to image without margin makes the page the image size', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await fileInput(page).setInputFiles([pngUpload('logo.png', 400, 200)]);
  await page.getByLabel('Page size').selectOption('fit');
  await page.getByLabel('Margin').selectOption('none');
  await page.getByRole('button', { name: 'CONVERT TO PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('logo.pdf');
  const p = (await PDFDocument.load(await readDownload(download))).getPage(0);
  expect([p.getWidth(), p.getHeight()]).toEqual([300, 150]);
});

test('a text file renamed to .png is rejected at selection', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await fileInput(page).setInputFiles([{ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }]);
  await expect(alertWith(page, "This file isn't a valid JPG or PNG image")).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
});
```

In `web/tests/tools.test.ts`, replace the `plan 1 enables merge, split, rotate only` test with:

```ts
test('enabled tools', () => {
  expect(TOOLS.filter((t) => t.available).map((t) => t.slug).sort()).toEqual([
    'image-to-pdf', 'merge-pdf', 'rotate-pdf', 'split-pdf',
  ]);
});
```

In `web/e2e/home.spec.ts`, add `import { TOOLS } from '../src/tools';` and replace the hard-coded `toHaveCount(11)` line with:

```ts
  await expect(page.getByText('Coming soon')).toHaveCount(TOOLS.filter((t) => !t.available).length);
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `cd web && npx vitest run tests/reorder.test.ts tests/tools.test.ts`
Expected: FAIL. `@/lib/reorder` cannot be resolved, and `enabled tools` lacks `image-to-pdf`.

- [ ] **Step 3: Implement `web/src/lib/reorder.ts` and use it in Merge**

```ts
/** Moves list[from] to index `to`. Returns the same array when the move is out of range or a no-op. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```

In `web/src/components/workspaces/MergeWorkspace.tsx`, add `import { moveItem } from '@/lib/reorder';` and replace the body of `move` with:

```ts
  const move = (from: number, to: number) => {
    const next = moveItem(inputs, from, to);
    if (next !== inputs) onInputsChange(next);
  };
```

- [ ] **Step 4: Implement `web/src/components/workspaces/ImageToPdfWorkspace.tsx`**

```tsx
'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ImageToPdfOptions } from '@/lib/pdf/imageToPdf';
import type { InputFile } from '@/lib/pdf/types';
import { moveItem } from '@/lib/reorder';
import type { WorkspaceProps } from '.';

function useObjectUrls(files: InputFile[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(new Blob([f.bytes as BlobPart])));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

const selectCls = 'rounded border border-gray-300 px-3 py-2 font-normal text-gray-900 disabled:opacity-50';
const labelCls = 'flex flex-col gap-1 text-sm font-semibold text-gray-600';

export function ImageToPdfWorkspace({ inputs, onInputsChange, onAddFiles, run, busy }: WorkspaceProps) {
  const [pageSize, setPageSize] = useState<ImageToPdfOptions['pageSize']>('a4');
  const [orientation, setOrientation] = useState<ImageToPdfOptions['orientation']>('auto');
  const [margin, setMargin] = useState<ImageToPdfOptions['margin']>('small');
  const urls = useObjectUrls(inputs);
  const addRef = useRef<HTMLInputElement>(null);

  const move = (from: number, to: number) => {
    const next = moveItem(inputs, from, to);
    if (next !== inputs) onInputsChange(next);
  };
  const remove = (index: number) => onInputsChange(inputs.filter((_, i) => i !== index));

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {inputs.map((f, i) => (
          <li key={`${i}-${f.name}`} data-testid="image-item" className="rounded border border-gray-200 p-2">
            <div className="flex h-32 items-center justify-center overflow-hidden bg-gray-50">
              {urls[i] && (
                // eslint-disable-next-line @next/next/no-img-element -- object URL preview
                <img src={urls[i]} alt={f.name} className="max-h-32 max-w-full" />
              )}
            </div>
            <p className="mt-1 truncate text-xs text-gray-600">
              {i + 1}. {f.name}
            </p>
            <div className="mt-1 flex justify-center gap-1">
              <button type="button" aria-label={`Move ${f.name} left`} disabled={busy || i === 0} onClick={() => move(i, i - 1)} className="p-1 disabled:opacity-30">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button type="button" aria-label={`Move ${f.name} right`} disabled={busy || i === inputs.length - 1} onClick={() => move(i, i + 1)} className="p-1 disabled:opacity-30">
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => remove(i)} className="p-1 disabled:opacity-30">
                <X className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className={labelCls}>
          Page size
          <select value={pageSize} disabled={busy} onChange={(e) => setPageSize(e.target.value as ImageToPdfOptions['pageSize'])} className={selectCls}>
            <option value="fit">Fit to image</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>
        <label className={labelCls}>
          Orientation
          <select value={orientation} disabled={busy || pageSize === 'fit'} onChange={(e) => setOrientation(e.target.value as ImageToPdfOptions['orientation'])} className={selectCls}>
            <option value="auto">Auto</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label className={labelCls}>
          Margin
          <select value={margin} disabled={busy} onChange={(e) => setMargin(e.target.value as ImageToPdfOptions['margin'])} className={selectCls}>
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={busy} onClick={() => addRef.current?.click()} className="font-semibold text-brand disabled:opacity-50">
          + Add more images
        </button>
        <input
          ref={addRef}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png"
          multiple
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || inputs.length === 0}
          onClick={() => run('imageToPdf', { pageSize, orientation, margin } satisfies ImageToPdfOptions)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Converting…' : 'CONVERT TO PDF'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Register the workspace and enable the tool**

In `web/src/components/workspaces/index.ts`, import `ImageToPdfWorkspace` from `./ImageToPdfWorkspace` and add `'image-to-pdf': ImageToPdfWorkspace,` to `WORKSPACES`.

In `web/src/tools.ts`, change the `image-to-pdf` entry's `available: false` to `available: true`.

- [ ] **Step 6: Run unit tests, types, lint and the e2e specs**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/image-to-pdf.spec.ts e2e/home.spec.ts e2e/merge.spec.ts`
Expected: all unit tests pass; tsc and lint are clean; e2e reports 33 passed (11 tests × 3 browsers: image-to-pdf 3, home 3, merge 5).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/reorder.ts web/src/components/workspaces web/src/tools.ts web/tests/reorder.test.ts web/tests/tools.test.ts web/e2e/image-to-pdf.spec.ts web/e2e/home.spec.ts
git commit -m "feat(web): enable JPG/PNG to PDF with reorder, page size, orientation and margin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: PDF→JPG and PDF→PNG (main-thread rasterising, tools go live)

**Files:**
- Create:
  - `web/src/lib/pdf/pdfToImages.ts`
  - `web/src/lib/pdf/pdfjsRenderer.ts`
  - `web/src/lib/pdf/run.ts`
  - `web/src/components/workspaces/PdfToImageWorkspace.tsx`
  - `web/e2e/pdf-to-image.spec.ts`
- Modify:
  - `web/src/lib/pdf/render.ts` (export `getPdfjs`)
  - `web/src/components/ToolShell.tsx`
  - `web/src/components/workspaces/index.ts`
  - `web/src/tools.ts`
  - `web/tests/tools.test.ts`
- Test: `web/tests/pdfToImages.test.ts`, `web/e2e/pdf-to-image.spec.ts`

**Interfaces:**
- Consumes:
  - `single` and `baseName` (`load.ts`)
  - `Size` (Task 1)
  - `readImageInfo` (Task 2, used by the e2e test to read output dimensions)
  - `usePageThumbs` and `PageGrid` (Plan 1)
- Produces:
  - `type ImageFormat = 'jpg' | 'png'`
  - `type PdfToImagesOptions = { format: ImageFormat; dpi: 72 | 150 | 300; pages: number[] | 'all' }`
  - `interface PageRenderer { pageCount: number; pageSize(i): Promise<Size>; render(i, scale, mime): Promise<Uint8Array>; destroy(): Promise<void> }`
  - `type OpenRenderer = (bytes: Uint8Array) => Promise<PageRenderer>`
  - `MAX_PIXELS = 16_000_000`, `MAX_SIDE = 16_384`, and `pixelSize(page: Size, dpi): { scale; width; height }`
  - `pdfToImages(inputs, opts, open: OpenRenderer): Promise<OutputFile[]>`
  - `openPdfjsRenderer: OpenRenderer` (browser only)
  - `type ToolEngine = EngineName | 'pdfToImages'` and `runTool(engine: ToolEngine, inputs, opts): Promise<OutputFile[]>`
  - `WorkspaceProps.run` now takes a `ToolEngine`
  - `PdfToJpgWorkspace` and `PdfToPngWorkspace`

- [ ] **Step 1: Write the failing unit tests**

`web/tests/pdfToImages.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { Size } from '@/lib/pdf/geometry';
import { MAX_PIXELS, MAX_SIDE, pdfToImages, pixelSize, type OpenRenderer } from '@/lib/pdf/pdfToImages';
import { input } from './helpers';

function fakeRenderer(sizes: Size[]) {
  const calls: { index: number; scale: number; mime: string }[] = [];
  let destroyed = false;
  const open: OpenRenderer = async () => ({
    pageCount: sizes.length,
    pageSize: async (i) => sizes[i],
    render: async (index, scale, mime) => {
      calls.push({ index, scale, mime });
      return new Uint8Array([index]);
    },
    destroy: async () => {
      destroyed = true;
    },
  });
  return { open, calls, destroyed: () => destroyed };
}

const pdf = input('doc.pdf', new Uint8Array([1]));
const page = { width: 200, height: 300 };

test('all pages: zero-padded names, DPI scale, mime, and the document is closed', async () => {
  const r = fakeRenderer(Array(12).fill(page));
  const out = await pdfToImages([pdf], { format: 'jpg', dpi: 150, pages: 'all' }, r.open);
  expect(out).toHaveLength(12);
  expect(out[0]).toMatchObject({ name: 'doc-page-01.jpg', mime: 'image/jpeg' });
  expect(out[11].name).toBe('doc-page-12.jpg');
  expect(r.calls[0].scale).toBeCloseTo(150 / 72);
  expect(r.destroyed()).toBe(true);
});

test('selected pages are sorted and de-duplicated', async () => {
  const r = fakeRenderer([page, page, page]);
  const out = await pdfToImages([pdf], { format: 'png', dpi: 72, pages: [2, 0, 2] }, r.open);
  expect(out.map((f) => f.name)).toEqual(['doc-page-1.png', 'doc-page-3.png']);
  expect(out[0].mime).toBe('image/png');
  expect(r.calls.map((c) => c.index)).toEqual([0, 2]);
});

test('bad options are BAD_OPTIONS and the document is still closed', async () => {
  const r = fakeRenderer([page, page]);
  await expect(pdfToImages([pdf], { format: 'png', dpi: 72, pages: [] }, r.open)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  expect(r.destroyed()).toBe(true);
  await expect(pdfToImages([pdf], { format: 'png', dpi: 72, pages: [2] }, r.open)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    pdfToImages([pdf], { format: 'png', dpi: 100 as 72, pages: 'all' }, r.open),
  ).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(pdfToImages([], { format: 'png', dpi: 72, pages: 'all' }, r.open)).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
});

test('pixelSize gives the exact DPI size for ordinary pages', () => {
  expect(pixelSize(page, 150)).toMatchObject({ width: 417, height: 625 });
  expect(pixelSize(page, 72)).toEqual({ scale: 1, width: 200, height: 300 });
});

test('pixelSize caps huge pages under the canvas area limit and keeps the aspect ratio', () => {
  const a0 = { width: 2384, height: 3370 };
  const s = pixelSize(a0, 300);
  expect(s.width * s.height).toBeLessThanOrEqual(MAX_PIXELS);
  expect(s.width / s.height).toBeCloseTo(2384 / 3370, 2);
});

test('pixelSize caps the longest side for long strips', () => {
  const s = pixelSize({ width: 20000, height: 10 }, 72);
  expect(s.width).toBeLessThanOrEqual(MAX_SIDE);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/pdfToImages.test.ts`
Expected: FAIL, because `@/lib/pdf/pdfToImages` cannot be resolved.

- [ ] **Step 3: Implement `web/src/lib/pdf/pdfToImages.ts`**

```ts
import { PdfToolError } from './errors';
import type { Size } from './geometry';
import { baseName, single } from './load';
import type { InputFile, OutputFile } from './types';

export type ImageFormat = 'jpg' | 'png';

export type PdfToImagesOptions = { format: ImageFormat; dpi: 72 | 150 | 300; pages: number[] | 'all' };

/** Renders pages of one opened PDF. The browser implementation is pdfjsRenderer.ts; unit tests use a fake. */
export interface PageRenderer {
  pageCount: number;
  /** Page size in points as displayed (CropBox after /Rotate). */
  pageSize(index: number): Promise<Size>;
  /** Encodes page `index` (0-based) at `scale` pixels per point. */
  render(index: number, scale: number, mime: string): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

export type OpenRenderer = (bytes: Uint8Array) => Promise<PageRenderer>;

/** Safari caps canvas area at 16,777,216 px; stay safely under it. */
export const MAX_PIXELS = 16_000_000;
/** Longest canvas side every target browser accepts. */
export const MAX_SIDE = 16_384;

const MIME: Record<ImageFormat, string> = { jpg: 'image/jpeg', png: 'image/png' };
const DPIS = [72, 150, 300];

/** Pixels-per-point scale and output size for a page at `dpi`, capped to what a browser canvas can hold. */
export function pixelSize(page: Size, dpi: number): { scale: number; width: number; height: number } {
  const scale = Math.min(
    dpi / 72,
    Math.sqrt(MAX_PIXELS / (page.width * page.height)),
    MAX_SIDE / Math.max(page.width, page.height),
  );
  return {
    scale,
    width: Math.max(1, Math.round(page.width * scale)),
    height: Math.max(1, Math.round(page.height * scale)),
  };
}

/** Main-thread engine (needs a canvas): one image per selected page. */
export async function pdfToImages(
  inputs: InputFile[],
  opts: PdfToImagesOptions,
  open: OpenRenderer,
): Promise<OutputFile[]> {
  const file = single(inputs);
  if (!(opts.format in MIME) || !DPIS.includes(opts.dpi)) {
    throw new PdfToolError('BAD_OPTIONS', 'Choose JPG or PNG at 72, 150 or 300 DPI');
  }
  const renderer = await open(file.bytes);
  try {
    const total = renderer.pageCount;
    const pages =
      opts.pages === 'all' ? Array.from({ length: total }, (_, i) => i) : [...new Set(opts.pages)].sort((a, b) => a - b);
    if (pages.length === 0) throw new PdfToolError('BAD_OPTIONS', 'Select at least one page');
    if (pages.some((p) => !Number.isInteger(p) || p < 0 || p >= total)) {
      throw new PdfToolError('BAD_OPTIONS', `Selected pages must be within 1-${total}`);
    }
    const base = baseName(file.name);
    const digits = String(total).length;
    const mime = MIME[opts.format];
    const out: OutputFile[] = [];
    for (const p of pages) {
      const { scale } = pixelSize(await renderer.pageSize(p), opts.dpi);
      out.push({
        name: `${base}-page-${String(p + 1).padStart(digits, '0')}.${opts.format}`,
        bytes: await renderer.render(p, scale, mime),
        mime,
      });
    }
    return out;
  } finally {
    await renderer.destroy();
  }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `cd web && npx vitest run tests/pdfToImages.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Implement the browser renderer and the dispatcher**

In `web/src/lib/pdf/render.ts`, change `function getPdfjs()` to `export function getPdfjs()`.

`web/src/lib/pdf/pdfjsRenderer.ts`:

```ts
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfToolError } from './errors';
import type { OpenRenderer } from './pdfToImages';
import { getPdfjs } from './render';

/** Browser-only PageRenderer backed by pdf.js. Pages are painted on white so JPEGs never get a black background. */
export const openPdfjsRenderer: OpenRenderer = async (bytes) => {
  const pdfjs = await getPdfjs();
  let doc: PDFDocumentProxy;
  try {
    // pdf.js detaches the buffer it is given; always hand it a copy.
    doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch {
    throw new PdfToolError('INVALID_FILE', "This PDF couldn't be opened for rendering");
  }
  return {
    pageCount: doc.numPages,
    async pageSize(index) {
      const viewport = (await doc.getPage(index + 1)).getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height };
    },
    async render(index, scale, mime) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new PdfToolError('OUT_OF_MEMORY', 'This page is too large to render in your browser');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
      // Release the pixel buffer right away; Safari keeps canvas memory until GC otherwise.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new PdfToolError('OUT_OF_MEMORY', 'This page is too large to render in your browser');
      return new Uint8Array(await blob.arrayBuffer());
    },
    destroy: () => doc.destroy(),
  };
};
```

`web/src/lib/pdf/run.ts`:

```ts
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
```

- [ ] **Step 6: Route the shell through `runTool`**

In `web/src/components/ToolShell.tsx`:
- replace `import type { EngineName } from '@/lib/pdf/engines';` with `import { runTool, type ToolEngine } from '@/lib/pdf/run';`;
- change the `run` callback's parameter type from `EngineName` to `ToolEngine`;
- change its body line to `setOutputs(await runTool(engine, inputs, opts));`.

`runEngine` stays imported for `validate`.

In `web/src/components/workspaces/index.ts`:
- replace `import type { EngineName } from '@/lib/pdf/engines';` with `import type { ToolEngine } from '@/lib/pdf/run';`;
- change `run: (engine: EngineName, opts: unknown) => void;` to `run: (engine: ToolEngine, opts: unknown) => void;`.

- [ ] **Step 7: Write the failing e2e test**

`web/e2e/pdf-to-image.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readImageInfo } from '../src/lib/image';
import { pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('PDF to JPG: all pages at 150 DPI in a zip', async ({ page }) => {
  await page.goto('/pdf-to-jpg');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2, [200, 300])]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(2);
  await expect(page.getByLabel('150 DPI (standard)')).toBeChecked();

  await page.getByRole('button', { name: 'CONVERT TO JPG' }).click();
  await expect(page.getByTestId('result')).toContainText('doc-page-2.jpg');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD ZIP' }).click();
  const zip = await JSZip.loadAsync(await readDownload(await downloadPromise));
  expect(Object.keys(zip.files).sort()).toEqual(['doc-page-1.jpg', 'doc-page-2.jpg']);
  const info = readImageInfo(await zip.file('doc-page-1.jpg')!.async('uint8array'));
  expect(info).toMatchObject({ type: 'jpg', width: 417, height: 625 });
});

test('PDF to PNG: one selected page at 72 DPI downloads a single image', async ({ page }) => {
  await page.goto('/pdf-to-png');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 3, [200, 300])]);
  await page.getByLabel('72 DPI (screen)').check();
  await page.getByLabel('Select pages').check();
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page.getByRole('button', { name: 'CONVERT TO PNG' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-page-2.png');
  expect(readImageInfo(new Uint8Array(await readDownload(download)))).toMatchObject({ type: 'png', width: 200, height: 300 });
});

test('convert is disabled while "Select pages" has nothing selected', async ({ page }) => {
  await page.goto('/pdf-to-jpg');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2)]);
  await page.getByLabel('Select pages').check();
  await expect(page.getByRole('button', { name: 'CONVERT TO JPG' })).toBeDisabled();
});
```

- [ ] **Step 8: Implement `web/src/components/workspaces/PdfToImageWorkspace.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { ImageFormat, PdfToImagesOptions } from '@/lib/pdf/pdfToImages';
import { usePageThumbs } from '@/lib/pdf/usePageThumbs';
import { ErrorCard } from '../ErrorCard';
import { PageGrid } from '../PageGrid';
import type { WorkspaceProps } from '.';

const DPIS: { value: PdfToImagesOptions['dpi']; label: string }[] = [
  { value: 72, label: '72 DPI (screen)' },
  { value: 150, label: '150 DPI (standard)' },
  { value: 300, label: '300 DPI (print)' },
];

function PdfToImageWorkspace({ format, inputs, onInputsChange, run, busy }: WorkspaceProps & { format: ImageFormat }) {
  const file = inputs[0];
  const { pageCount, thumbs, error } = usePageThumbs(file);
  const [dpi, setDpi] = useState<PdfToImagesOptions['dpi']>(150);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const opts: PdfToImagesOptions = { format, dpi, pages: all ? 'all' : [...selected] };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>

      <fieldset className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Image quality</legend>
        {DPIS.map((d) => (
          <label key={d.value} className="flex items-center gap-2">
            <input type="radio" name="dpi" checked={dpi === d.value} onChange={() => setDpi(d.value)} />
            {d.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mb-4 flex flex-wrap gap-6">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Pages</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="pages" checked={all} onChange={() => setAll(true)} />
          All pages
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pages" checked={!all} onChange={() => setAll(false)} />
          Select pages
        </label>
      </fieldset>
      {!all && <p className="mb-4 text-sm text-gray-500">Click pages to convert only those.</p>}

      {pageCount !== null ? (
        <PageGrid thumbs={thumbs} isSelected={all ? undefined : (i) => selected.has(i)} onPageClick={all ? undefined : toggle} />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || (!all && selected.size === 0)}
          onClick={() => run('pdfToImages', opts)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Converting…' : `CONVERT TO ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}

export function PdfToJpgWorkspace(props: WorkspaceProps) {
  return <PdfToImageWorkspace {...props} format="jpg" />;
}

export function PdfToPngWorkspace(props: WorkspaceProps) {
  return <PdfToImageWorkspace {...props} format="png" />;
}
```

- [ ] **Step 9: Register the workspaces and enable both tools**

In `web/src/components/workspaces/index.ts`, import `PdfToJpgWorkspace` and `PdfToPngWorkspace` from `./PdfToImageWorkspace`, and add:

```ts
  'pdf-to-jpg': PdfToJpgWorkspace,
  'pdf-to-png': PdfToPngWorkspace,
```

In `web/src/tools.ts`, set `available: true` on `pdf-to-jpg` and `pdf-to-png`. In `web/tests/tools.test.ts`, change the `enabled tools` list to:

```ts
    'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png', 'rotate-pdf', 'split-pdf',
```

- [ ] **Step 10: Run unit tests, types, lint and e2e**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/pdf-to-image.spec.ts e2e/home.spec.ts e2e/rotate.spec.ts`
Expected:
- all unit tests pass;
- tsc and lint are clean;
- e2e reports 24 passed (8 tests × 3 browsers).

The JPG is 417×625 because 200 pt × 150/72 = 416.7, which rounds to 417.

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/pdf web/src/components web/src/tools.ts web/tests/pdfToImages.test.ts web/tests/tools.test.ts web/e2e/pdf-to-image.spec.ts
git commit -m "feat(web): enable PDF to JPG/PNG with DPI choice and page selection

Rasterising runs on the main thread through runTool; huge pages are capped
under the browser canvas limit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `watermark` engine

**Files:**
- Create: `web/src/lib/pdf/watermark.ts`
- Modify: `web/src/lib/pdf/engines.ts`, `web/tests/engines.test.ts`
- Test: `web/tests/watermark.test.ts`

**Interfaces:**
- Consumes:
  - `drawInVisualSpace`, `rotatedOrigin`, `rotatedBounds` and `Size` (Task 1)
  - `hexColor` (Task 1)
  - `embedImage` (Task 3)
  - `parseRanges`, `loadPdf`, `single` and `baseName` (Plan 1)
- Produces:
  - `POSITIONS` (readonly tuple) and `type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'tiled'`
  - `type WatermarkOptions`, which is either of:
    - `{ mode: 'text'; text; fontSize; color; opacity; rotation; position; pages }`
    - `{ mode: 'image'; image: Uint8Array; scale; opacity; rotation; position; pages }`

    `pages` is `''` for all pages, or a range string like `1-3,5`. `opacity` is 0.05–1. `scale` is the fraction of the page width (0.05–1).
  - `EDGE_MARGIN = 36`
  - `anchorCenter(position, page: Size, box: Size): [number, number]`
  - `tileCenters(page: Size, box: Size): [number, number][]`
  - `watermark: Engine<WatermarkOptions>`, registered as `'watermark'`, producing `<base>-watermarked.pdf`

- [ ] **Step 1: Write the failing tests**

`web/tests/watermark.test.ts`:

```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from 'vitest';
import { anchorCenter, tileCenters, watermark, type WatermarkOptions } from '@/lib/pdf/watermark';
import { imageCounts, input, makePdf, makePng, pageText, type TextItem } from './helpers';

const TEXT: WatermarkOptions = {
  mode: 'text', text: 'MARK', fontSize: 20, color: '#ff0000', opacity: 0.5, rotation: 0, position: 'center', pages: '',
};

async function markSize(text: string, size: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  return { w: font.widthOfTextAtSize(text, size), h: font.heightAtSize(size, { descender: false }) };
}

const marks = (items: TextItem[], text = 'MARK') => items.filter((t) => t.str === text);

test('anchorCenter puts the 9-grid 36 pt from the edges', () => {
  const page = { width: 200, height: 300 };
  const box = { width: 20, height: 10 };
  expect(anchorCenter('top-left', page, box)).toEqual([46, 259]);
  expect(anchorCenter('middle-left', page, box)).toEqual([46, 150]);
  expect(anchorCenter('center', page, box)).toEqual([100, 150]);
  expect(anchorCenter('bottom-right', page, box)).toEqual([154, 41]);
});

test('tileCenters covers the page, and always yields at least one tile', () => {
  expect(tileCenters({ width: 200, height: 100 }, { width: 28, height: 28 })).toEqual([[50, 50], [150, 50]]);
  expect(tileCenters({ width: 200, height: 100 }, { width: 500, height: 500 })).toEqual([[100, 50]]);
});

test('text watermark is centred on every page', async () => {
  const [out] = await watermark([input('doc.pdf', await makePdf(2))], TEXT);
  expect(out.name).toBe('doc-watermarked.pdf');
  const { w, h } = await markSize('MARK', 20);
  for (const items of await pageText(out.bytes)) {
    const [m] = marks(items);
    expect(m.x).toBeCloseTo(100 - w / 2, 1);
    expect(m.y).toBeCloseTo(150 - h / 2, 1);
  }
});

test('pages limits which pages are stamped', async () => {
  const [out] = await watermark([input('doc.pdf', await makePdf(3))], { ...TEXT, pages: '2' });
  expect((await pageText(out.bytes)).map((items) => marks(items).length)).toEqual([0, 1, 0]);
});

test('top-left on a /Rotate 90 page lands at the displayed top-left corner', async () => {
  const [out] = await watermark([input('r.pdf', await makePdf(1, { rotate: 90 }))], { ...TEXT, position: 'top-left' });
  const { h } = await markSize('MARK', 20);
  const [m] = marks((await pageText(out.bytes))[0]);
  // Visual origin (36, 164 - h) on a 300×200 displayed page maps to user (200 - (164 - h), 36).
  expect(m.x).toBeCloseTo(36 + h, 1);
  expect(m.y).toBeCloseTo(36, 1);
});

test('centre respects a CropBox that does not start at 0,0', async () => {
  const [out] = await watermark([input('o.pdf', await makePdf(1, { mediaBox: [50, 60, 200, 300] }))], TEXT);
  const { w, h } = await markSize('MARK', 20);
  const [m] = marks((await pageText(out.bytes))[0]);
  expect(m.x).toBeCloseTo(150 - w / 2, 1);
  expect(m.y).toBeCloseTo(210 - h / 2, 1);
});

test('tiled repeats the mark across the page', async () => {
  const [out] = await watermark([input('doc.pdf', await makePdf(1))], {
    ...TEXT, text: 'DRAFT', fontSize: 12, rotation: 45, position: 'tiled',
  });
  expect(marks((await pageText(out.bytes))[0], 'DRAFT').length).toBeGreaterThan(4);
});

test('image watermark is drawn on the selected pages only', async () => {
  const opts: WatermarkOptions = {
    mode: 'image', image: makePng(40, 20), scale: 0.5, opacity: 0.4, rotation: 45, position: 'center', pages: '1',
  };
  const [out] = await watermark([input('doc.pdf', await makePdf(2))], opts);
  expect(await imageCounts(out.bytes)).toEqual([1, 0]);
});

test('typed errors', async () => {
  const doc = input('doc.pdf', await makePdf(2));
  await expect(watermark([doc], { ...TEXT, text: '机密' })).rejects.toMatchObject({
    code: 'BAD_OPTIONS',
    message: expect.stringContaining('Latin'),
  });
  await expect(watermark([doc], { ...TEXT, text: '   ' })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(watermark([doc], { ...TEXT, opacity: 0 })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(watermark([doc], { ...TEXT, pages: '9' })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(watermark([doc], { ...TEXT, color: 'red' })).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    watermark([doc], { ...TEXT, position: 'nowhere' as WatermarkOptions['position'] }),
  ).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(
    watermark([doc], { mode: 'image', image: new Uint8Array([1, 2]), scale: 0.5, opacity: 1, rotation: 0, position: 'center', pages: '' }),
  ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
});
```

In `web/tests/engines.test.ts`, change the registry list to `['imageToPdf', 'merge', 'rotate', 'split', 'validate', 'watermark']`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/watermark.test.ts tests/engines.test.ts`
Expected: FAIL, because `@/lib/pdf/watermark` cannot be resolved.

- [ ] **Step 3: Implement `web/src/lib/pdf/watermark.ts`**

```ts
import { StandardFonts, degrees, type PDFDocument, type PDFPage } from 'pdf-lib';
import { hexColor } from './color';
import { embedImage } from './embedImage';
import { PdfToolError } from './errors';
import { drawInVisualSpace, rotatedBounds, rotatedOrigin, type Size } from './geometry';
import { baseName, loadPdf, single } from './load';
import { parseRanges } from './ranges';
import { PDF_MIME, type Engine } from './types';

export const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
  'tiled',
] as const;
export type WatermarkPosition = (typeof POSITIONS)[number];

interface CommonOptions {
  /** 0.05-1 */
  opacity: number;
  /** Degrees, counter-clockwise as the page is displayed. */
  rotation: number;
  position: WatermarkPosition;
  /** '' = every page, otherwise a range list such as "1-3,5". */
  pages: string;
}
type TextWatermark = CommonOptions & { mode: 'text'; text: string; fontSize: number; color: string };
/** `scale` is the stamp width as a fraction of the page width (0.05-1). */
type ImageWatermark = CommonOptions & { mode: 'image'; image: Uint8Array; scale: number };
export type WatermarkOptions = TextWatermark | ImageWatermark;

/** Distance of the 9-grid positions from the page edge, in points. */
export const EDGE_MARGIN = 36;
/** Gap between tiles, in points. */
const TILE_GAP = 72;

function bad(message: string): never {
  throw new PdfToolError('BAD_OPTIONS', message);
}

/** Centre of a stamp whose (rotated) bounding box is `box`, in visual space. */
export function anchorCenter(position: Exclude<WatermarkPosition, 'tiled'>, page: Size, box: Size): [number, number] {
  const [row, col] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const cx =
    col === 'left' ? EDGE_MARGIN + box.width / 2 : col === 'right' ? page.width - EDGE_MARGIN - box.width / 2 : page.width / 2;
  const cy =
    row === 'top' ? page.height - EDGE_MARGIN - box.height / 2 : row === 'bottom' ? EDGE_MARGIN + box.height / 2 : page.height / 2;
  return [cx, cy];
}

/** Centres for a repeating grid of stamps; a stamp bigger than the page still gets one tile. */
export function tileCenters(page: Size, box: Size): [number, number][] {
  const stepX = box.width + TILE_GAP;
  const stepY = box.height + TILE_GAP;
  const centers: [number, number][] = [];
  for (let y = Math.min(stepY / 2, page.height / 2); y < page.height; y += stepY) {
    for (let x = Math.min(stepX / 2, page.width / 2); x < page.width; x += stepX) centers.push([x, y]);
  }
  return centers;
}

interface Stamp {
  /** Unrotated stamp size on a page of this (visual) size. */
  size(page: Size): Size;
  /** Draws with its unrotated bottom-left corner at (x, y), rotated about that corner. */
  draw(page: PDFPage, x: number, y: number, size: Size): void;
}

async function textStamp(doc: PDFDocument, opts: TextWatermark): Promise<Stamp> {
  const text = opts.text.trim();
  if (!text) bad('Enter the watermark text');
  if (!(opts.fontSize >= 6 && opts.fontSize <= 200)) bad('Font size must be between 6 and 200');
  const color = hexColor(opts.color);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  let width = 0;
  try {
    width = font.widthOfTextAtSize(text, opts.fontSize);
  } catch {
    bad('Watermark text can only use Latin characters (A–Z, accents and common symbols)');
  }
  const height = font.heightAtSize(opts.fontSize, { descender: false });
  return {
    size: () => ({ width, height }),
    draw: (page, x, y) =>
      page.drawText(text, { x, y, size: opts.fontSize, font, color, opacity: opts.opacity, rotate: degrees(opts.rotation) }),
  };
}

async function imageStamp(doc: PDFDocument, opts: ImageWatermark): Promise<Stamp> {
  if (!(opts.scale >= 0.05 && opts.scale <= 1)) bad('Image size must be between 5% and 100% of the page width');
  const { image } = await embedImage(doc, opts.image, 'The watermark image');
  return {
    size: (page) => ({ width: page.width * opts.scale, height: (page.width * opts.scale * image.height) / image.width }),
    draw: (page, x, y, size) =>
      page.drawImage(image, { x, y, width: size.width, height: size.height, opacity: opts.opacity, rotate: degrees(opts.rotation) }),
  };
}

export const watermark: Engine<WatermarkOptions> = async (inputs, opts) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  if (!(opts.opacity >= 0.05 && opts.opacity <= 1)) bad('Opacity must be between 5% and 100%');
  if (!Number.isFinite(opts.rotation) || Math.abs(opts.rotation) > 360) bad('Rotation must be between -360 and 360 degrees');
  if (!POSITIONS.includes(opts.position)) bad('Choose a watermark position');
  const targets = opts.pages.trim()
    ? [...new Set(parseRanges(opts.pages, doc.getPageCount()).flat())]
    : doc.getPageIndices();
  const stamp = opts.mode === 'text' ? await textStamp(doc, opts) : await imageStamp(doc, opts);

  for (const index of targets) {
    const page = doc.getPage(index);
    drawInVisualSpace(page, (pageSize) => {
      const size = stamp.size(pageSize);
      const box = rotatedBounds(size.width, size.height, opts.rotation);
      const centers = opts.position === 'tiled' ? tileCenters(pageSize, box) : [anchorCenter(opts.position, pageSize, box)];
      for (const [cx, cy] of centers) {
        const [x, y] = rotatedOrigin(cx, cy, size.width, size.height, opts.rotation);
        stamp.draw(page, x, y, size);
      }
    });
  }
  return [{ name: `${baseName(file.name)}-watermarked.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};
```

- [ ] **Step 4: Register the engine**

In `web/src/lib/pdf/engines.ts`, add `import { watermark } from './watermark';` and append `watermark` to the `engines` object.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/watermark.test.ts tests/engines.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/pdf/watermark.ts web/src/lib/pdf/engines.ts web/tests/watermark.test.ts web/tests/engines.test.ts
git commit -m "feat(web): add watermark engine (text or image, 9-grid or tiled, page ranges)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Watermark workspace (tool goes live)

**Files:**
- Create: `web/src/components/workspaces/WatermarkWorkspace.tsx`, `web/e2e/watermark.spec.ts`
- Modify: `web/src/components/workspaces/index.ts`, `web/src/tools.ts`, `web/tests/tools.test.ts`
- Test: `web/e2e/watermark.spec.ts`

**Interfaces:**
- Consumes:
  - `WatermarkOptions`, `WatermarkPosition` and engine `'watermark'` (Task 6)
  - `readImageInfo` (Task 2)
  - `MAX_BYTES`
  - `WorkspaceProps.onError` (Task 2)
  - test helpers `pageText` and `imageCounts`, plus fixture `pngUpload`
- Produces: `WatermarkWorkspace`, mapped under `'watermark-pdf'`; `watermark-pdf` becomes available.

- [ ] **Step 1: Write the failing e2e test**

`web/e2e/watermark.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { imageCounts, pageText } from '../tests/helpers';
import { pdfUpload, pngUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

async function downloadResult(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  return downloadPromise;
}

test('text watermark on every page', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2)]);
  await page.getByLabel('Watermark text').fill('TOP SECRET');
  await page.getByLabel('Font size').fill('24');
  await page.getByLabel('Rotation').selectOption('0');
  await page.getByRole('button', { name: 'ADD WATERMARK' }).click();

  const download = await downloadResult(page);
  expect(download.suggestedFilename()).toBe('doc-watermarked.pdf');
  const pages = await pageText(new Uint8Array(await readDownload(download)));
  expect(pages.map((items) => items.some((t) => t.str === 'TOP SECRET'))).toEqual([true, true]);
});

test('image watermark on selected pages only', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2)]);
  await page.getByLabel('Image', { exact: true }).check();
  await page.getByLabel('Watermark image').setInputFiles(pngUpload('logo.png', 60, 30));
  await expect(page.getByText('logo.png')).toBeVisible();
  await page.getByLabel('Pages', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'ADD WATERMARK' }).click();

  const download = await downloadResult(page);
  expect(await imageCounts(new Uint8Array(await readDownload(download)))).toEqual([0, 1]);
});

test('a non-image picked as the watermark image shows an error', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1)]);
  await page.getByLabel('Image', { exact: true }).check();
  await page.getByLabel('Watermark image').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
  await expect(page.getByRole('alert').filter({ hasText: "This file isn't a valid JPG or PNG image" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ADD WATERMARK' })).toBeDisabled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx playwright test e2e/watermark.spec.ts --project=chromium`
Expected: FAIL. The page shows "This tool is coming soon.", so there is no dropzone.

- [ ] **Step 3: Implement `web/src/components/workspaces/WatermarkWorkspace.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { MAX_BYTES } from '@/lib/files';
import { readImageInfo } from '@/lib/image';
import { PdfToolError } from '@/lib/pdf/errors';
import type { WatermarkOptions, WatermarkPosition } from '@/lib/pdf/watermark';
import type { WorkspaceProps } from '.';

const POSITION_LABELS: [WatermarkPosition, string][] = [
  ['center', 'Center'],
  ['tiled', 'Tiled (repeat across the page)'],
  ['top-left', 'Top left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['middle-left', 'Middle left'],
  ['middle-right', 'Middle right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right'],
];
const ROTATIONS = [0, 45, -45, 90];

const fieldCls = 'rounded border border-gray-300 px-3 py-2 font-normal text-gray-900';
const labelCls = 'flex flex-col gap-1 text-sm font-semibold text-gray-600';

export function WatermarkWorkspace({ inputs, run, busy, onError }: WorkspaceProps) {
  const file = inputs[0];
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState('#e5322d');
  const [image, setImage] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [scale, setScale] = useState(50);
  const [opacity, setOpacity] = useState(40);
  const [rotation, setRotation] = useState(45);
  const [position, setPosition] = useState<WatermarkPosition>('center');
  const [pages, setPages] = useState('');

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return onError(new PdfToolError('TOO_LARGE', `${f.name} is larger than 50 MB`));
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!readImageInfo(bytes)) {
      setImage(null);
      return onError(new PdfToolError('INVALID_IMAGE', `${f.name} isn't a valid JPG or PNG image`));
    }
    setImage({ name: f.name, bytes });
  };

  const ready = mode === 'text' ? text.trim() !== '' : image !== null;
  const submit = () => {
    const common = { opacity: opacity / 100, rotation, position, pages };
    const opts: WatermarkOptions =
      mode === 'text' ? { mode, text, fontSize, color, ...common } : { mode, image: image!.bytes, scale: scale / 100, ...common };
    run('watermark', opts);
  };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>

      <fieldset className="mb-5 flex gap-6">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Watermark type</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="wm-mode" checked={mode === 'text'} onChange={() => setMode('text')} />
          Text
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="wm-mode" checked={mode === 'image'} onChange={() => setMode('image')} />
          Image
        </label>
      </fieldset>

      {mode === 'text' ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <label className={labelCls}>
            Watermark text
            <input value={text} maxLength={100} onChange={(e) => setText(e.target.value)} className={fieldCls} />
          </label>
          <label className={labelCls}>
            Font size
            <input type="number" min={6} max={200} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className={`${fieldCls} w-24`} />
          </label>
          <label className={labelCls}>
            Color
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded border border-gray-300" />
          </label>
        </div>
      ) : (
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>
            Watermark image
            <input type="file" accept=".png,.jpg,.jpeg" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} className="text-sm font-normal" />
            {image && <span className="text-xs font-normal text-gray-500">{image.name}</span>}
          </label>
          <label className={labelCls}>
            Image size: {scale}% of page width
            <input type="range" min={10} max={100} step={5} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <label className={labelCls}>
          Opacity: {opacity}%
          <input type="range" min={5} max={100} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
        <label className={labelCls}>
          Rotation
          <select value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className={fieldCls}>
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>
                {r}°
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value as WatermarkPosition)} className={fieldCls}>
            {POSITION_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Pages
          <input value={pages} placeholder="All pages, or e.g. 1-3, 5" onChange={(e) => setPages(e.target.value)} className={fieldCls} />
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={submit}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Adding watermark…' : 'ADD WATERMARK'}
        </button>
      </div>
    </div>
  );
}
```

The label texts "Opacity: 40%" and "Image size: 50% …" change with the value. The e2e test does not select by those labels, and the remaining labels are stable.

- [ ] **Step 4: Register the workspace and enable the tool**

In `web/src/components/workspaces/index.ts`, import `WatermarkWorkspace` and add `'watermark-pdf': WatermarkWorkspace,`. In `web/src/tools.ts`, set `available: true` on `watermark-pdf`. In `web/tests/tools.test.ts`, change the list to:

```ts
    'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png', 'rotate-pdf', 'split-pdf', 'watermark-pdf',
```

- [ ] **Step 5: Run unit tests, types, lint and e2e**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/watermark.spec.ts e2e/home.spec.ts`
Expected:
- all unit tests pass;
- tsc and lint are clean;
- e2e reports 18 passed (6 tests × 3 browsers).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/workspaces web/src/tools.ts web/tests/tools.test.ts web/e2e/watermark.spec.ts
git commit -m "feat(web): enable Watermark PDF (text or image, opacity, rotation, position, pages)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Editor model — objects, geometry and undo/redo reducer

**Files:**
- Create: `web/src/lib/editor/model.ts`
- Test: `web/tests/editorModel.test.ts`

**Interfaces:**
- Consumes: nothing (pure TypeScript, no DOM, no pdf-lib).
- Produces (all used by Tasks 9–11):
  - `STANDARD_FONTS` (the 12 Latin standard-14 names) and `type FontName`
  - `TEXT_BASELINE = 0.8`, `LINE_HEIGHT = 1.2`, `HIGHLIGHT_OPACITY = 0.4` and `HIGHLIGHT_COLOR = '#ffe600'`
  - `interface DrawStyle { color: string; strokeWidth: number; font: FontName; size: number }` and `DEFAULT_STYLE`
  - `EditObject = TextObject | BoxObject | LineObject | PenObject | ImageObject`, all in **view space**:

    | Type | Fields |
    |---|---|
    | `TextObject` | `type: 'text'`, `x`, `y` (top-left of the text box), `text`, `font`, `size`, `color` |
    | `BoxObject` | `type: 'rect' \| 'ellipse' \| 'highlight' \| 'whiteout'`, `x`, `y`, `w`, `h`, `color`, `strokeWidth` |
    | `LineObject` | `type: 'line'`, `x1`, `y1`, `x2`, `y2`, `color`, `strokeWidth` |
    | `PenObject` | `type: 'pen'`, `points: number[]` (flat x,y pairs), `color`, `strokeWidth` |
    | `ImageObject` | `type: 'image'`, `x`, `y`, `w`, `h`, `imageId` |

    Every object also has `id: string` and `page: number` (0-based).
  - `interface Rect { x; y; w; h }`
  - `newId(): string`
  - `bounds(o, textWidth: (t: TextObject) => number): Rect`
  - `translate(o, dx, dy): EditObject`
  - `resize(o, from: Rect, to: Rect): EditObject`
  - `withStyle(o, patch: Partial<DrawStyle>): EditObject`, which returns the same object when nothing applies
  - `penPath(points): string`
  - `EditorState { objects; selectedId; past; future; gestureStart }`, `initialEditorState` and `editorReducer(state, action)`
  - `EditorAction`, which is one of:
    - `add { object }`
    - `begin`
    - `change { id, object }`
    - `end`
    - `remove { id }`
    - `select { id | null }`
    - `undo`
    - `redo`

- [ ] **Step 1: Write the failing tests**

`web/tests/editorModel.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  bounds,
  editorReducer,
  initialEditorState,
  newId,
  penPath,
  resize,
  translate,
  withStyle,
  type EditObject,
  type EditorAction,
  type EditorState,
} from '@/lib/editor/model';

const rect: EditObject = { id: 'r', page: 0, type: 'rect', x: 10, y: 20, w: 30, h: 40, color: '#000000', strokeWidth: 2 };
const line: EditObject = { id: 'l', page: 0, type: 'line', x1: 50, y1: 10, x2: 10, y2: 30, color: '#000000', strokeWidth: 1 };
const pen: EditObject = { id: 'p', page: 0, type: 'pen', points: [0, 0, 10, 20, 4, 8], color: '#000000', strokeWidth: 1 };
const text: EditObject = { id: 't', page: 0, type: 'text', x: 5, y: 6, text: 'a\nbb', font: 'Helvetica', size: 10, color: '#000000' };
const image: EditObject = { id: 'i', page: 0, type: 'image', x: 0, y: 0, w: 1, h: 1, imageId: 'img' };
const textWidth = () => 25;

const run = (actions: EditorAction[], from: EditorState = initialEditorState) => actions.reduce(editorReducer, from);

test('bounds per object type', () => {
  expect(bounds(rect, textWidth)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  expect(bounds(line, textWidth)).toEqual({ x: 10, y: 10, w: 40, h: 20 });
  expect(bounds(pen, textWidth)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  expect(bounds(text, textWidth)).toEqual({ x: 5, y: 6, w: 25, h: 24 }); // 2 lines × 10 pt × 1.2
});

test('translate moves every point', () => {
  expect(translate(line, 1, 2)).toMatchObject({ x1: 51, y1: 12, x2: 11, y2: 32 });
  expect(translate(pen, 1, 2)).toMatchObject({ points: [1, 2, 11, 22, 5, 10] });
  expect(translate(rect, -10, 5)).toMatchObject({ x: 0, y: 25, w: 30, h: 40 });
  expect(translate(text, 1, 1)).toMatchObject({ x: 6, y: 7 });
});

test('resize maps an object from one box into another; text is not resizable', () => {
  expect(resize(rect, bounds(rect, textWidth), { x: 0, y: 0, w: 60, h: 20 })).toMatchObject({ x: 0, y: 0, w: 60, h: 20 });
  expect(resize(line, { x: 10, y: 10, w: 40, h: 20 }, { x: 10, y: 10, w: 80, h: 40 })).toMatchObject({
    x1: 90, y1: 10, x2: 10, y2: 50,
  });
  expect(resize(pen, { x: 0, y: 0, w: 10, h: 20 }, { x: 0, y: 0, w: 20, h: 20 })).toMatchObject({ points: [0, 0, 20, 20, 8, 8] });
  expect(resize(text, bounds(text, textWidth), { x: 0, y: 0, w: 99, h: 99 })).toBe(text);
});

test('withStyle only touches applicable fields and keeps identity when nothing applies', () => {
  expect(withStyle(rect, { color: '#ff0000', strokeWidth: 4, size: 30 })).toMatchObject({ color: '#ff0000', strokeWidth: 4 });
  expect(withStyle(text, { font: 'Courier', size: 20, strokeWidth: 8 })).toMatchObject({ font: 'Courier', size: 20, color: '#000000' });
  expect(withStyle(text, { strokeWidth: 8 })).toBe(text);
  expect(withStyle(image, { color: '#ff0000' })).toBe(image);
});

test('penPath', () => {
  expect(penPath([1, 2, 3, 4])).toBe('M 1 2 L 3 4');
  expect(penPath([5, 6])).toBe('M 5 6 L 5 6');
});

test('newId is unique', () => {
  expect(new Set(Array.from({ length: 1000 }, newId)).size).toBe(1000);
});

test('add selects the object and is one undo step', () => {
  const s = run([{ type: 'add', object: rect }]);
  expect(s.objects).toEqual([rect]);
  expect(s.selectedId).toBe('r');
  const undone = editorReducer(s, { type: 'undo' });
  expect(undone.objects).toEqual([]);
  expect(undone.selectedId).toBeNull();
  expect(editorReducer(undone, { type: 'redo' }).objects).toEqual([rect]);
});

test('a drag (begin, many changes, end) is a single undo step', () => {
  const s = run([
    { type: 'add', object: rect },
    { type: 'begin' },
    { type: 'change', id: 'r', object: translate(rect, 1, 0) },
    { type: 'change', id: 'r', object: translate(rect, 2, 0) },
    { type: 'change', id: 'r', object: translate(rect, 3, 0) },
    { type: 'end' },
  ]);
  expect(s.objects[0]).toMatchObject({ x: 13 });
  expect(s.past).toHaveLength(2);
  expect(editorReducer(s, { type: 'undo' }).objects[0]).toMatchObject({ x: 10 });
});

test('begin and end without a change add no history', () => {
  const s = run([{ type: 'add', object: rect }, { type: 'begin' }, { type: 'end' }]);
  expect(s.past).toHaveLength(1);
  expect(s.gestureStart).toBeNull();
});

test('a change outside a gesture is its own step and clears redo', () => {
  const s = run([{ type: 'add', object: rect }, { type: 'add', object: line }, { type: 'undo' }]);
  expect(s.future).toHaveLength(1);
  const changed = editorReducer(s, { type: 'change', id: 'r', object: { ...rect, color: '#ff0000' } });
  expect(changed.past).toHaveLength(2);
  expect(changed.future).toEqual([]);
});

test('remove clears the selection; undo brings the object back', () => {
  const s = run([{ type: 'add', object: rect }, { type: 'remove', id: 'r' }]);
  expect(s.objects).toEqual([]);
  expect(s.selectedId).toBeNull();
  expect(editorReducer(s, { type: 'undo' }).objects).toEqual([rect]);
  expect(editorReducer(s, { type: 'remove', id: 'nope' })).toBe(s);
});

test('undo is ignored mid-gesture and when there is nothing to undo', () => {
  expect(editorReducer(initialEditorState, { type: 'undo' })).toBe(initialEditorState);
  expect(editorReducer(initialEditorState, { type: 'redo' })).toBe(initialEditorState);
  const mid = run([{ type: 'add', object: rect }, { type: 'begin' }]);
  expect(editorReducer(mid, { type: 'undo' })).toBe(mid);
});

test('history keeps the last 100 steps', () => {
  let s = initialEditorState;
  for (let i = 0; i < 105; i++) s = editorReducer(s, { type: 'add', object: { ...rect, id: `r${i}` } });
  expect(s.past).toHaveLength(100);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/editorModel.test.ts`
Expected: FAIL, because `@/lib/editor/model` cannot be resolved.

- [ ] **Step 3: Implement `web/src/lib/editor/model.ts`**

```ts
/** The 12 standard-14 PDF fonts that render Latin text (Symbol and ZapfDingbats are left out). */
export const STANDARD_FONTS = [
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
] as const;
export type FontName = (typeof STANDARD_FONTS)[number];

/**
 * The first text baseline sits TEXT_BASELINE font sizes below the text box top, and lines are
 * LINE_HEIGHT font sizes apart. Shared by the SVG view and the PDF export so text lands where it was placed.
 */
export const TEXT_BASELINE = 0.8;
export const LINE_HEIGHT = 1.2;
export const HIGHLIGHT_OPACITY = 0.4;
export const HIGHLIGHT_COLOR = '#ffe600';

export interface DrawStyle {
  color: string;
  strokeWidth: number;
  font: FontName;
  size: number;
}

export const DEFAULT_STYLE: DrawStyle = { color: '#e5322d', strokeWidth: 2, font: 'Helvetica', size: 16 };

// All coordinates are view space: points, origin at the top-left of the page as displayed, y down.
interface Base {
  id: string;
  /** 0-based page index. */
  page: number;
}
export interface TextObject extends Base {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font: FontName;
  size: number;
  color: string;
}
export interface BoxObject extends Base {
  type: 'rect' | 'ellipse' | 'highlight' | 'whiteout';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
}
export interface LineObject extends Base {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}
export interface PenObject extends Base {
  type: 'pen';
  /** Flat [x0, y0, x1, y1, …]. */
  points: number[];
  color: string;
  strokeWidth: number;
}
export interface ImageObject extends Base {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  imageId: string;
}
export type EditObject = TextObject | BoxObject | LineObject | PenObject | ImageObject;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let counter = 0;
/** Unique within the tab. Avoids crypto.randomUUID, which needs a secure context (plain-HTTP LAN access). */
export function newId(): string {
  counter += 1;
  return `o${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Bounding box in view space. Text needs a measurer because its width depends on the font. */
export function bounds(o: EditObject, textWidth: (t: TextObject) => number): Rect {
  switch (o.type) {
    case 'text':
      return { x: o.x, y: o.y, w: textWidth(o), h: o.size * LINE_HEIGHT * o.text.split('\n').length };
    case 'line':
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    case 'pen': {
      const xs = o.points.filter((_, i) => i % 2 === 0);
      const ys = o.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    default:
      return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
}

export function translate(o: EditObject, dx: number, dy: number): EditObject {
  switch (o.type) {
    case 'line':
      return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
    case 'pen':
      return { ...o, points: o.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    default:
      return { ...o, x: o.x + dx, y: o.y + dy };
  }
}

/** Scales an object from its old bounding box `from` into `to`. Text is sized by font size instead. */
export function resize(o: EditObject, from: Rect, to: Rect): EditObject {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const mapX = (x: number) => to.x + (x - from.x) * sx;
  const mapY = (y: number) => to.y + (y - from.y) * sy;
  switch (o.type) {
    case 'text':
      return o;
    case 'line':
      return { ...o, x1: mapX(o.x1), y1: mapY(o.y1), x2: mapX(o.x2), y2: mapY(o.y2) };
    case 'pen':
      return { ...o, points: o.points.map((v, i) => (i % 2 === 0 ? mapX(v) : mapY(v))) };
    default:
      return { ...o, x: to.x, y: to.y, w: to.w, h: to.h };
  }
}

/** Applies the style fields that make sense for this object; returns `o` itself when none do. */
export function withStyle(o: EditObject, p: Partial<DrawStyle>): EditObject {
  if (o.type === 'image' || o.type === 'whiteout') return o;
  if (o.type === 'text') {
    if (p.color === undefined && p.font === undefined && p.size === undefined) return o;
    return { ...o, color: p.color ?? o.color, font: p.font ?? o.font, size: p.size ?? o.size };
  }
  if (p.color === undefined && p.strokeWidth === undefined) return o;
  return { ...o, color: p.color ?? o.color, strokeWidth: p.strokeWidth ?? o.strokeWidth };
}

/** SVG path for a pen stroke; a single point becomes a zero-length segment so round caps draw a dot. */
export function penPath(points: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) parts.push(`${i === 0 ? 'M' : 'L'} ${points[i]} ${points[i + 1]}`);
  if (parts.length === 1) parts.push(`L ${points[0]} ${points[1]}`);
  return parts.join(' ');
}

export interface EditorState {
  objects: EditObject[];
  selectedId: string | null;
  past: EditObject[][];
  future: EditObject[][];
  /** Objects as they were when the current gesture began; becomes one history step on 'end'. */
  gestureStart: EditObject[] | null;
}

export const initialEditorState: EditorState = { objects: [], selectedId: null, past: [], future: [], gestureStart: null };

export type EditorAction =
  | { type: 'add'; object: EditObject }
  | { type: 'begin' }
  | { type: 'change'; id: string; object: EditObject }
  | { type: 'end' }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

function pushHistory(past: EditObject[][], snapshot: EditObject[]): EditObject[][] {
  return [...past, snapshot].slice(-HISTORY_LIMIT);
}

function commit(state: EditorState, objects: EditObject[]): EditorState {
  return { ...state, objects, past: pushHistory(state.past, state.objects), future: [] };
}

function keepSelection(objects: EditObject[], id: string | null): string | null {
  return id !== null && objects.some((o) => o.id === id) ? id : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'add':
      return { ...commit(state, [...state.objects, action.object]), selectedId: action.object.id };
    case 'begin':
      return state.gestureStart ? state : { ...state, gestureStart: state.objects };
    case 'change': {
      const objects = state.objects.map((o) => (o.id === action.id ? action.object : o));
      return state.gestureStart ? { ...state, objects } : commit(state, objects);
    }
    case 'end': {
      if (!state.gestureStart) return state;
      if (state.gestureStart === state.objects) return { ...state, gestureStart: null };
      return { ...state, gestureStart: null, past: pushHistory(state.past, state.gestureStart), future: [] };
    }
    case 'remove': {
      if (!state.objects.some((o) => o.id === action.id)) return state;
      const next = commit(state, state.objects.filter((o) => o.id !== action.id));
      return { ...next, selectedId: state.selectedId === action.id ? null : state.selectedId };
    }
    case 'select':
      return { ...state, selectedId: action.id };
    case 'undo': {
      if (state.gestureStart || state.past.length === 0) return state;
      const objects = state.past[state.past.length - 1];
      return {
        ...state,
        objects,
        past: state.past.slice(0, -1),
        future: [state.objects, ...state.future],
        selectedId: keepSelection(objects, state.selectedId),
      };
    }
    case 'redo': {
      if (state.gestureStart || state.future.length === 0) return state;
      const [objects, ...future] = state.future;
      return {
        ...state,
        objects,
        past: pushHistory(state.past, state.objects),
        future,
        selectedId: keepSelection(objects, state.selectedId),
      };
    }
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/editorModel.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/editor/model.ts web/tests/editorModel.test.ts
git commit -m "feat(web): add editor object model with gesture-aware undo/redo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `annotate` engine (flatten editor objects into the PDF)

**Files:**
- Create: `web/src/lib/pdf/annotate.ts`
- Modify: `web/src/lib/pdf/engines.ts`, `web/tests/engines.test.ts`
- Test: `web/tests/annotate.test.ts`

**Interfaces:**
- Consumes:
  - `EditObject`, `STANDARD_FONTS`, `TEXT_BASELINE`, `LINE_HEIGHT`, `HIGHLIGHT_OPACITY` and `penPath` (Task 8)
  - `drawInVisualSpace` and `hexColor` (Task 1)
  - `embedImage` and `drawImageInBox` (Task 3)
- Produces:
  - `type AnnotateOptions = { objects: EditObject[]; images: Record<string, Uint8Array>; suffix: 'edited' | 'signed' }`
  - `annotate: Engine<AnnotateOptions>`, registered as `'annotate'`, producing `<base>-<suffix>.pdf`

- [ ] **Step 1: Write the failing tests**

`web/tests/annotate.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { EditObject, FontName, TextObject } from '@/lib/editor/model';
import { annotate, type AnnotateOptions } from '@/lib/pdf/annotate';
import { imageCounts, input, makePdf, makePng, pageCount, pageText, type TextItem } from './helpers';

const textAt = (x: number, y: number, text = 'Hello', page = 0): TextObject => ({
  id: `t${x}-${y}`, page, type: 'text', x, y, text, font: 'Helvetica', size: 12, color: '#000000',
});
const opts = (objects: EditObject[], images: AnnotateOptions['images'] = {}): AnnotateOptions => ({
  objects, images, suffix: 'edited',
});
const find = (items: TextItem[], str: string) => items.find((t) => t.str === str)!;

test('text lands where it was placed (view space: top-left origin, y down)', async () => {
  const [out] = await annotate([input('doc.pdf', await makePdf(1))], opts([textAt(20, 30)]));
  expect(out.name).toBe('doc-edited.pdf');
  const hello = find((await pageText(out.bytes))[0], 'Hello');
  expect(hello.x).toBeCloseTo(20);
  expect(hello.y).toBeCloseTo(300 - 30 - 12 * 0.8);
});

test('each extra line steps down by 1.2 × the font size', async () => {
  const [out] = await annotate([input('doc.pdf', await makePdf(1))], opts([textAt(20, 30, 'first\nsecond')]));
  const items = (await pageText(out.bytes))[0];
  expect(find(items, 'first').y - find(items, 'second').y).toBeCloseTo(14.4);
});

test('on a /Rotate 90 page the text is where the viewer saw it', async () => {
  const [out] = await annotate([input('r.pdf', await makePdf(1, { rotate: 90 }))], opts([textAt(20, 30)]));
  const hello = find((await pageText(out.bytes))[0], 'Hello');
  // Displayed page is 300×200: view (20, 30) → visual (20, 160.4) → user (200 - 160.4, 20).
  expect(hello.x).toBeCloseTo(39.6);
  expect(hello.y).toBeCloseTo(20);
});

test('images are drawn on their own pages and named by suffix', async () => {
  const img = (id: string, page: number): EditObject => ({ id, page, type: 'image', x: 10, y: 10, w: 40, h: 20, imageId: 'sig' });
  const [out] = await annotate([input('doc.pdf', await makePdf(3))], {
    objects: [img('a', 0), img('b', 2), img('c', 2)],
    images: { sig: makePng(40, 20) },
    suffix: 'signed',
  });
  expect(out.name).toBe('doc-signed.pdf');
  expect(await imageCounts(out.bytes)).toEqual([1, 0, 1]);
});

test('every shape type exports to a loadable PDF that keeps the original content', async () => {
  const s = { page: 0, color: '#3366ff', strokeWidth: 2 };
  const objects: EditObject[] = [
    { ...s, id: '1', type: 'rect', x: 10, y: 10, w: 50, h: 30 },
    { ...s, id: '2', type: 'ellipse', x: 10, y: 50, w: 50, h: 30 },
    { ...s, id: '3', type: 'highlight', x: 10, y: 90, w: 50, h: 10 },
    { ...s, id: '4', type: 'whiteout', x: 10, y: 110, w: 50, h: 10 },
    { ...s, id: '5', type: 'line', x1: 10, y1: 130, x2: 90, y2: 150 },
    { ...s, id: '6', type: 'pen', points: [10, 160, 20, 170, 30, 160] },
    { ...s, id: '7', type: 'pen', points: [40, 160] },
  ];
  const [out] = await annotate([input('doc.pdf', await makePdf(1))], opts(objects));
  expect(await pageCount(out.bytes)).toBe(1);
  expect((await pageText(out.bytes))[0].map((t) => t.str)).toContain('Page 1');
});

test('typed errors', async () => {
  const doc = input('doc.pdf', await makePdf(1));
  await expect(annotate([doc], opts([]))).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(annotate([doc], opts([textAt(1, 1, 'x', 3)]))).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(annotate([doc], opts([textAt(1, 1, '签名')]))).rejects.toMatchObject({
    code: 'BAD_OPTIONS',
    message: expect.stringContaining('Latin'),
  });
  await expect(annotate([doc], opts([{ ...textAt(1, 1), color: 'blue' }]))).rejects.toMatchObject({ code: 'BAD_OPTIONS' });
  await expect(annotate([doc], opts([{ ...textAt(1, 1), font: 'Comic-Sans' as FontName }]))).rejects.toMatchObject({
    code: 'BAD_OPTIONS',
  });
  await expect(
    annotate([doc], opts([{ id: 'i', page: 0, type: 'image', x: 0, y: 0, w: 1, h: 1, imageId: 'missing' }])),
  ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
});
```

In `web/tests/engines.test.ts`, change the registry list to `['annotate', 'imageToPdf', 'merge', 'rotate', 'split', 'validate', 'watermark']`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/annotate.test.ts tests/engines.test.ts`
Expected: FAIL, because `@/lib/pdf/annotate` cannot be resolved.

- [ ] **Step 3: Implement `web/src/lib/pdf/annotate.ts`**

```ts
import { BlendMode, LineCapStyle, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  HIGHLIGHT_OPACITY,
  LINE_HEIGHT,
  STANDARD_FONTS,
  TEXT_BASELINE,
  penPath,
  type EditObject,
  type FontName,
} from '../editor/model';
import { hexColor } from './color';
import { drawImageInBox, embedImage, type EmbeddedImage } from './embedImage';
import { PdfToolError } from './errors';
import { drawInVisualSpace } from './geometry';
import { baseName, loadPdf, single } from './load';
import { PDF_MIME, type Engine } from './types';

export type AnnotateOptions = {
  /** Objects in view space (top-left origin, y down, points). */
  objects: EditObject[];
  /** Image bytes keyed by ImageObject.imageId. */
  images: Record<string, Uint8Array>;
  /** Output name: <base>-edited.pdf or <base>-signed.pdf. */
  suffix: 'edited' | 'signed';
};

function bad(message: string): never {
  throw new PdfToolError('BAD_OPTIONS', message);
}

export const annotate: Engine<AnnotateOptions> = async (inputs, { objects, images, suffix }) => {
  const file = single(inputs);
  const doc = await loadPdf(file);
  if (objects.length === 0) bad('Add something to the page first');
  const pages = doc.getPages();
  if (objects.some((o) => !Number.isInteger(o.page) || o.page < 0 || o.page >= pages.length)) {
    bad('An object is placed on a page that does not exist');
  }

  // Embed fonts and images first (async); drawing below is synchronous inside drawInVisualSpace.
  const fonts = new Map<FontName, PDFFont>();
  const embedded = new Map<string, EmbeddedImage>();
  for (const o of objects) {
    if (o.type === 'text') {
      if (!(STANDARD_FONTS as readonly string[]).includes(o.font)) bad(`Unknown font "${o.font}"`);
      let font = fonts.get(o.font);
      if (!font) {
        font = await doc.embedFont(o.font);
        fonts.set(o.font, font);
      }
      try {
        font.widthOfTextAtSize(o.text.replace(/\n/g, ''), o.size);
      } catch {
        bad('Text can only use Latin characters (A–Z, accents and common symbols)');
      }
    } else if (o.type === 'image' && !embedded.has(o.imageId)) {
      embedded.set(o.imageId, await embedImage(doc, images[o.imageId], 'An inserted image'));
    }
  }

  pages.forEach((page, index) => {
    const mine = objects.filter((o) => o.page === index);
    if (mine.length === 0) return;
    drawInVisualSpace(page, ({ height }) => {
      for (const o of mine) drawObject(page, o, height, fonts, embedded);
    });
  });
  return [{ name: `${baseName(file.name)}-${suffix}.pdf`, bytes: await doc.save(), mime: PDF_MIME }];
};

/** Draws one object; the page is already in visual space (bottom-left origin) of height `pageHeight`. */
function drawObject(
  page: PDFPage,
  o: EditObject,
  pageHeight: number,
  fonts: Map<FontName, PDFFont>,
  images: Map<string, EmbeddedImage>,
): void {
  const flip = (y: number) => pageHeight - y;
  switch (o.type) {
    case 'text': {
      const font = fonts.get(o.font)!;
      const color = hexColor(o.color);
      o.text.split('\n').forEach((line, i) => {
        if (!line) return;
        page.drawText(line, { x: o.x, y: flip(o.y + o.size * (TEXT_BASELINE + LINE_HEIGHT * i)), size: o.size, font, color });
      });
      break;
    }
    case 'rect':
      page.drawRectangle({
        x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h, borderColor: hexColor(o.color), borderWidth: o.strokeWidth,
      });
      break;
    case 'ellipse':
      page.drawEllipse({
        x: o.x + o.w / 2, y: flip(o.y + o.h / 2), xScale: o.w / 2, yScale: o.h / 2,
        borderColor: hexColor(o.color), borderWidth: o.strokeWidth,
      });
      break;
    case 'highlight':
      page.drawRectangle({
        x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h,
        color: hexColor(o.color), opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply,
      });
      break;
    case 'whiteout':
      page.drawRectangle({ x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h, color: rgb(1, 1, 1) });
      break;
    case 'line':
      page.drawLine({
        start: { x: o.x1, y: flip(o.y1) }, end: { x: o.x2, y: flip(o.y2) },
        thickness: o.strokeWidth, color: hexColor(o.color), lineCap: LineCapStyle.Round,
      });
      break;
    case 'pen':
      // drawSvgPath takes SVG (y-down) coordinates relative to its origin, so view-space points
      // work unchanged when the origin is the page's top-left corner.
      page.drawSvgPath(penPath(o.points), {
        x: 0, y: pageHeight, borderColor: hexColor(o.color), borderWidth: o.strokeWidth, borderLineCap: LineCapStyle.Round,
      });
      break;
    case 'image':
      drawImageInBox(page, images.get(o.imageId)!, { x: o.x, y: flip(o.y + o.h), width: o.w, height: o.h });
      break;
  }
}
```

- [ ] **Step 4: Register the engine**

In `web/src/lib/pdf/engines.ts`, add `import { annotate } from './annotate';` and append `annotate` to the `engines` object.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/annotate.test.ts tests/engines.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/pdf/annotate.ts web/src/lib/pdf/engines.ts web/tests/annotate.test.ts web/tests/engines.test.ts
git commit -m "feat(web): add annotate engine that flattens editor objects into the PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Page editor and Sign PDF (tool goes live)

**Files:**
- Create:
  - `web/src/lib/canvas.ts`
  - `web/src/lib/signatureFonts.ts`
  - `web/src/lib/editor/prepareImage.ts`
  - `web/src/lib/pdf/usePdfRenderer.ts`
  - `web/src/components/editor/PageView.tsx`
  - `web/src/components/editor/PageEditor.tsx`
  - `web/src/components/sign/SignatureCreator.tsx`
  - `web/src/components/workspaces/SignWorkspace.tsx`
  - `web/e2e/sign.spec.ts`
- Modify: `web/src/components/workspaces/index.ts`, `web/src/tools.ts`, `web/tests/tools.test.ts`
- Test: `web/tests/canvas.test.ts`, `web/e2e/sign.spec.ts`

**Interfaces:**
- Consumes:
  - the editor model (Task 8)
  - `AnnotateOptions` and engine `'annotate'` (Task 9)
  - `openPdfjsRenderer` and `PageRenderer` (Task 5)
  - `readImageInfo` and `displaySize` (Task 2)
  - `WorkspaceProps.onError` (Task 2)
- Produces:
  - `alphaBounds(data: Uint8ClampedArray, width, height): { x; y; w; h } | null`
  - `trimCanvas(canvas, pad?): HTMLCanvasElement | null`
  - `canvasToPng(canvas): Promise<{ bytes: Uint8Array; width: number; height: number }>`
  - `SIGNATURE_FONTS: { name: string; family: string }[]` (3 entries)
  - `prepareImage(file: File): Promise<{ bytes; width; height }>`, which throws `TOO_LARGE` or `INVALID_IMAGE`
  - `usePdfRenderer(file): { renderer: PageRenderer | null; sizes: Size[] | null; error: PdfToolError | null }`
  - `PageView({ renderer, index, size })`
  - `type DrawTool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'pen' | 'highlight' | 'whiteout'`
  - `PageEditor`, with props:
    - `renderer`, `sizes`, `page`, `onPageChange`
    - `state`, `dispatch`
    - `imageUrls: Record<string, string>`
    - `tool: DrawTool`, `style: DrawStyle`
    - `onPlaced?`, `disabled?`
  - test ids:
    - `editor-canvas` (the SVG)
    - `editor-object` (each object on the current page)
    - `selection`
    - `resize-handle`
  - `SignatureCreator({ onCreate, onError })` with test id `signature-pad`
  - `SignWorkspace`, mapped under `'sign-pdf'`

- [ ] **Step 1: Write the failing unit test for the canvas helpers**

`web/tests/canvas.test.ts`:

```ts
import { expect, test } from 'vitest';
import { alphaBounds } from '@/lib/canvas';

function rgba(width: number, height: number, opaque: [number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

test('alphaBounds is null for a fully transparent image', () => {
  expect(alphaBounds(rgba(8, 5, []), 8, 5)).toBeNull();
});

test('alphaBounds is the box around every non-transparent pixel', () => {
  expect(alphaBounds(rgba(8, 5, [[2, 1], [5, 3]]), 8, 5)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  expect(alphaBounds(rgba(8, 5, [[7, 4]]), 8, 5)).toEqual({ x: 7, y: 4, w: 1, h: 1 });
});
```

Run: `cd web && npx vitest run tests/canvas.test.ts`
Expected: FAIL, because `@/lib/canvas` cannot be resolved.

- [ ] **Step 2: Implement `web/src/lib/canvas.ts`**

```ts
import { PdfToolError } from './pdf/errors';

/** Box around every pixel whose alpha is non-zero in RGBA `data`; null when all are transparent. */
export function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Crops a canvas to its drawn pixels plus `pad`; null when nothing is drawn. Browser only. */
export function trimCanvas(src: HTMLCanvasElement, pad = 8): HTMLCanvasElement | null {
  const ctx = src.getContext('2d');
  if (!ctx) return null;
  const box = alphaBounds(ctx.getImageData(0, 0, src.width, src.height).data, src.width, src.height);
  if (!box) return null;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(src.width, box.x + box.w + pad) - x;
  const h = Math.min(src.height, box.y + box.h + pad) - y;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}

/** Encodes a canvas as PNG. Browser only. */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new PdfToolError('OUT_OF_MEMORY', 'This image is too large to process in your browser');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}
```

Run: `cd web && npx vitest run tests/canvas.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 3: Write the failing e2e test**

`web/e2e/sign.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { imageCounts } from '../tests/helpers';
import { pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('draw a signature, place it on two pages, and sign', async ({ page }) => {
  await page.goto('/sign-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2, [400, 500])]);
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  const pad = page.getByTestId('signature-pad');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 20, { steps: 5 });
  await page.mouse.move(box.x + 160, box.y + box.height - 20, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Use signature' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(1);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(0);
  await page.getByRole('button', { name: 'Place signature 1' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(1);

  await page.getByRole('button', { name: 'SIGN PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-signed.pdf');
  expect(await imageCounts(new Uint8Array(await readDownload(download)))).toEqual([1, 1]);
});

test('a typed signature can be moved, deleted and restored with undo', async ({ page }) => {
  await page.goto('/sign-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1, [400, 500])]);
  await page.getByRole('tab', { name: 'Type' }).click();
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Use signature' }).click();

  const placed = page.getByTestId('editor-object');
  await expect(placed).toHaveCount(1);
  const before = (await placed.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + before.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const after = (await placed.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(30);
  expect(after.y - before.y).toBeGreaterThan(20);

  await page.keyboard.press('Delete');
  await expect(placed).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SIGN PDF' })).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(placed).toHaveCount(1);
});
```

Run: `cd web && npx playwright test e2e/sign.spec.ts --project=chromium`
Expected: FAIL. The page says "This tool is coming soon.", so there is no dropzone.

- [ ] **Step 4: Implement the supporting modules**

`web/src/lib/signatureFonts.ts`:

```ts
import { Caveat, Dancing_Script, Great_Vibes } from 'next/font/google';

// Self-hosted at build time by next/font (no runtime request to Google).
const dancing = Dancing_Script({ subsets: ['latin'], weight: '400' });
const vibes = Great_Vibes({ subsets: ['latin'], weight: '400' });
const caveat = Caveat({ subsets: ['latin'], weight: '400' });

export const SIGNATURE_FONTS = [
  { name: 'Dancing Script', family: dancing.style.fontFamily },
  { name: 'Great Vibes', family: vibes.style.fontFamily },
  { name: 'Caveat', family: caveat.style.fontFamily },
];
```

`web/src/lib/editor/prepareImage.ts`:

```ts
import { canvasToPng } from '../canvas';
import { MAX_BYTES } from '../files';
import { displaySize, readImageInfo } from '../image';
import { PdfToolError } from '../pdf/errors';

/**
 * Reads an image picked inside Sign/Edit. Photos carrying an EXIF rotation are redrawn upright as PNG,
 * so the on-screen preview (SVG <image>) and the exported PDF agree. Browser only.
 */
export async function prepareImage(file: File): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (file.size > MAX_BYTES) throw new PdfToolError('TOO_LARGE', `${file.name} is larger than 50 MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = readImageInfo(bytes);
  if (!info) throw new PdfToolError('INVALID_IMAGE', `${file.name} isn't a valid JPG or PNG image`);
  if (info.orientation === 1) return { bytes, width: info.width, height: info.height };
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart])); // browsers apply EXIF orientation here
  const { width, height } = displaySize(info);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvasToPng(canvas);
}
```

`web/src/lib/pdf/usePdfRenderer.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { toToolError, type PdfToolError } from './errors';
import type { Size } from './geometry';
import { openPdfjsRenderer } from './pdfjsRenderer';
import type { PageRenderer } from './pdfToImages';
import type { InputFile } from './types';

interface RendererState {
  renderer: PageRenderer | null;
  /** Displayed size of every page, in points. */
  sizes: Size[] | null;
  error: PdfToolError | null;
}

const EMPTY: RendererState = { renderer: null, sizes: null, error: null };

/** Opens `file` with pdf.js for on-screen editing; closes it when the file changes or on unmount. */
export function usePdfRenderer(file: InputFile | undefined): RendererState {
  const [state, setState] = useState<RendererState>(EMPTY);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setState(EMPTY);
    const opening = openPdfjsRenderer(file.bytes);
    opening
      .then(async (renderer) => {
        const sizes: Size[] = [];
        for (let i = 0; i < renderer.pageCount; i++) sizes.push(await renderer.pageSize(i));
        if (!cancelled) setState({ renderer, sizes, error: null });
      })
      .catch((e) => {
        if (!cancelled) setState({ ...EMPTY, error: toToolError(e) });
      });
    return () => {
      cancelled = true;
      // Close whatever was opened, even if opening finishes after unmount.
      opening.then((r) => r.destroy()).catch(() => {});
    };
  }, [file]);

  return state;
}
```

- [ ] **Step 5: Implement `web/src/components/editor/PageView.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Size } from '@/lib/pdf/geometry';
import type { PageRenderer } from '@/lib/pdf/pdfToImages';

/** Pixel width pages are rendered at for editing: sharp at ~800 CSS px on 2× screens. */
const RENDER_WIDTH = 1600;

export function PageView({ renderer, index, size }: { renderer: PageRenderer; index: number; size: Size }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    setUrl(null);
    renderer
      .render(index, Math.min(RENDER_WIDTH / size.width, 4), 'image/jpeg')
      .then((bytes) => {
        if (cancelled) return;
        made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
        setUrl(made);
      })
      // A page that fails to render (or a renderer closed mid-render) stays as the grey placeholder;
      // objects can still be placed and exported.
      .catch(() => {});
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [renderer, index, size.width]);

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- object URL of a rendered page
    <img src={url} alt={`Page ${index + 1}`} draggable={false} className="absolute inset-0 h-full w-full select-none" />
  ) : (
    <div className="absolute inset-0 animate-pulse bg-gray-100" />
  );
}
```

- [ ] **Step 6: Implement `web/src/components/editor/PageEditor.tsx`**

```tsx
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import {
  HIGHLIGHT_COLOR,
  HIGHLIGHT_OPACITY,
  LINE_HEIGHT,
  TEXT_BASELINE,
  bounds,
  newId,
  penPath,
  resize,
  translate,
  type DrawStyle,
  type EditObject,
  type EditorAction,
  type EditorState,
  type FontName,
  type Rect,
  type TextObject,
} from '@/lib/editor/model';
import type { Size } from '@/lib/pdf/geometry';
import type { PageRenderer } from '@/lib/pdf/pdfToImages';
import { PageView } from './PageView';

export type DrawTool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'pen' | 'highlight' | 'whiteout';
type ShapeTool = Exclude<DrawTool, 'select' | 'text'>;
type Point = { x: number; y: number };
type Gesture =
  | { kind: 'move'; id: string; start: Point; origin: EditObject }
  | { kind: 'resize'; id: string; start: Point; origin: EditObject; box: Rect }
  | { kind: 'draw'; start: Point };

/** Smallest drawn shape kept, in points; smaller drags are treated as stray clicks. */
const MIN_SIZE = 3;

export function cssFont(font: FontName): { fontFamily: string; fontWeight: number; fontStyle: string } {
  const fontFamily = font.startsWith('Times')
    ? '"Times New Roman", Times, serif'
    : font.startsWith('Courier')
      ? '"Courier New", Courier, monospace'
      : 'Helvetica, Arial, sans-serif';
  return { fontFamily, fontWeight: font.includes('Bold') ? 700 : 400, fontStyle: /Oblique|Italic/.test(font) ? 'italic' : 'normal' };
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a text object's longest line, in points, using the browser's font metrics. */
export function measureText(o: TextObject): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return o.text.length * o.size * 0.5;
  const f = cssFont(o.font);
  measureCtx.font = `${f.fontStyle} ${f.fontWeight} ${o.size}px ${f.fontFamily}`;
  const ctx = measureCtx;
  return Math.max(o.size / 2, ...o.text.split('\n').map((line) => ctx.measureText(line).width));
}

function newShape(tool: ShapeTool, page: number, p: Point, style: DrawStyle): EditObject {
  const common = { id: newId(), page, color: tool === 'highlight' ? HIGHLIGHT_COLOR : style.color, strokeWidth: style.strokeWidth };
  switch (tool) {
    case 'line':
      return { ...common, type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    case 'pen':
      return { ...common, type: 'pen', points: [p.x, p.y] };
    default:
      return { ...common, type: tool, x: p.x, y: p.y, w: 0, h: 0 };
  }
}

function extendShape(d: EditObject, start: Point, p: Point): EditObject {
  switch (d.type) {
    case 'line':
      return { ...d, x2: p.x, y2: p.y };
    case 'pen':
      return { ...d, points: [...d.points, p.x, p.y] };
    case 'rect':
    case 'ellipse':
    case 'highlight':
    case 'whiteout':
      return { ...d, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    default:
      return d;
  }
}

function bigEnough(d: EditObject): boolean {
  if (d.type === 'pen') return d.points.length >= 4;
  const b = bounds(d, measureText);
  return d.type === 'line' ? Math.max(b.w, b.h) >= MIN_SIZE : b.w >= MIN_SIZE && b.h >= MIN_SIZE;
}

function ObjectShape({ o, imageUrls }: { o: EditObject; imageUrls: Record<string, string> }) {
  switch (o.type) {
    case 'text': {
      const style = { ...cssFont(o.font), whiteSpace: 'pre' as const };
      return (
        <>
          {o.text.split('\n').map((line, i) => (
            <text key={i} x={o.x} y={o.y + o.size * (TEXT_BASELINE + LINE_HEIGHT * i)} fontSize={o.size} fill={o.color} style={style}>
              {line}
            </text>
          ))}
        </>
      );
    }
    case 'rect':
      return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke={o.color} strokeWidth={o.strokeWidth} />;
    case 'ellipse':
      return <ellipse cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={o.w / 2} ry={o.h / 2} fill="none" stroke={o.color} strokeWidth={o.strokeWidth} />;
    case 'highlight':
      return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={o.color} fillOpacity={HIGHLIGHT_OPACITY} style={{ mixBlendMode: 'multiply' }} />;
    case 'whiteout':
      return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="#ffffff" />;
    case 'line':
      return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={o.color} strokeWidth={o.strokeWidth} strokeLinecap="round" />;
    case 'pen':
      return <path d={penPath(o.points)} fill="none" stroke={o.color} strokeWidth={o.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
    case 'image':
      return <image href={imageUrls[o.imageId]} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" />;
  }
}

function Selection({ o, pageWidth }: { o: EditObject; pageWidth: number }) {
  const b = bounds(o, measureText);
  const handle = pageWidth / 50;
  return (
    <g data-testid="selection">
      <rect
        x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8}
        fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"
      />
      {o.type !== 'text' && (
        <rect
          data-handle="resize" data-testid="resize-handle"
          x={b.x + b.w + 4 - handle / 2} y={b.y + b.h + 4 - handle / 2} width={handle} height={handle}
          fill="#2563eb" className="cursor-nwse-resize"
        />
      )}
    </g>
  );
}

interface PageEditorProps {
  renderer: PageRenderer;
  sizes: Size[];
  page: number;
  onPageChange: (page: number) => void;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Object URLs for ImageObject.imageId. */
  imageUrls: Record<string, string>;
  tool: DrawTool;
  style: DrawStyle;
  /** Called after a one-shot tool (text) has placed its object. */
  onPlaced?: () => void;
  disabled?: boolean;
}

export function PageEditor({
  renderer, sizes, page, onPageChange, state, dispatch, imageUrls, tool, style, onPlaced, disabled = false,
}: PageEditorProps) {
  const size = sizes[page];
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<EditObject | null>(null);
  const objects = state.objects.filter((o) => o.page === page);
  const selected = objects.find((o) => o.id === state.selectedId) ?? null;

  // Delete/Backspace removes the selection; Ctrl/Cmd+Z undo; Ctrl+Y or Ctrl/Cmd+Shift+Z redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        e.preventDefault();
        dispatch({ type: 'remove', id: state.selectedId });
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.selectedId, disabled]);

  const toPoint = (e: ReactPointerEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * size.width) / r.width, y: ((e.clientY - r.top) * size.height) / r.height };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0) return;
    const p = toPoint(e);
    const target = e.target as Element;
    if (tool === 'select') {
      if (selected && target.closest('[data-handle="resize"]')) {
        gesture.current = { kind: 'resize', id: selected.id, start: p, origin: selected, box: bounds(selected, measureText) };
      } else {
        const id = target.closest('[data-id]')?.getAttribute('data-id') ?? null;
        dispatch({ type: 'select', id });
        const hit = objects.find((o) => o.id === id);
        if (!hit) return;
        gesture.current = { kind: 'move', id: hit.id, start: p, origin: hit };
      }
      dispatch({ type: 'begin' });
    } else if (tool === 'text') {
      dispatch({
        type: 'add',
        object: { id: newId(), page, type: 'text', x: p.x, y: p.y, text: 'Text', font: style.font, size: style.size, color: style.color },
      });
      onPlaced?.();
      return;
    } else {
      gesture.current = { kind: 'draw', start: p };
      setDraft(newShape(tool, page, p, style));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toPoint(e);
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (g.kind === 'move') {
      dispatch({ type: 'change', id: g.id, object: translate(g.origin, dx, dy) });
    } else if (g.kind === 'resize') {
      const w = Math.max(MIN_SIZE, g.box.w + dx);
      // Images keep their aspect ratio; other shapes resize freely.
      const h = g.origin.type === 'image' && g.box.w > 0 ? (w * g.box.h) / g.box.w : Math.max(MIN_SIZE, g.box.h + dy);
      dispatch({ type: 'change', id: g.id, object: resize(g.origin, g.box, { x: g.box.x, y: g.box.y, w, h }) });
    } else {
      setDraft((d) => (d ? extendShape(d, g.start, p) : d));
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'draw') {
      if (draft && bigEnough(draft)) dispatch({ type: 'add', object: draft });
      setDraft(null);
    } else {
      dispatch({ type: 'end' });
    }
  };

  const go = (next: number) => {
    dispatch({ type: 'select', id: null });
    onPageChange(next);
  };

  return (
    <div>
      {sizes.length > 1 && (
        <div className="mb-3 flex items-center justify-center gap-4 text-sm">
          <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span>
            Page {page + 1} of {sizes.length}
          </span>
          <button type="button" aria-label="Next page" disabled={page === sizes.length - 1} onClick={() => go(page + 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="relative mx-auto w-full max-w-3xl border border-gray-200 shadow-sm" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <PageView renderer={renderer} index={page} size={size} />
        <svg
          ref={svgRef}
          data-testid="editor-canvas"
          viewBox={`0 0 ${size.width} ${size.height}`}
          className={`absolute inset-0 h-full w-full touch-none select-none ${tool === 'select' ? '' : 'cursor-crosshair'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {objects.map((o) => {
            const b = bounds(o, measureText);
            return (
              <g key={o.id} data-id={o.id} data-testid="editor-object" className={tool === 'select' ? 'cursor-move' : undefined}>
                {/* Transparent hit area so thin or unfilled shapes are easy to grab. */}
                <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="transparent" />
                <ObjectShape o={o} imageUrls={imageUrls} />
              </g>
            );
          })}
          {draft && <ObjectShape o={draft} imageUrls={imageUrls} />}
          {selected && <Selection o={selected} pageWidth={size.width} />}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Implement `web/src/components/sign/SignatureCreator.tsx`**

```tsx
'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { canvasToPng, trimCanvas } from '@/lib/canvas';
import { MAX_BYTES } from '@/lib/files';
import { readImageInfo } from '@/lib/image';
import { PdfToolError } from '@/lib/pdf/errors';
import { SIGNATURE_FONTS } from '@/lib/signatureFonts';

export interface SignatureImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

type Tab = 'draw' | 'type' | 'upload';
const TABS: [Tab, string][] = [['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']];
const INK = '#1e293b';
const useBtn = 'rounded-sm bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50';

function DrawPad({ onCreate }: { onCreate: (s: SignatureImage) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  const use = async () => {
    const trimmed = trimCanvas(ref.current!);
    if (trimmed) onCreate(await canvasToPng(trimmed));
    clear();
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={200}
        data-testid="signature-pad"
        aria-label="Draw your signature"
        className="w-full touch-none rounded border border-dashed border-gray-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const p = point(e);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
          setEmpty(false);
        }}
        onPointerUp={() => {
          last.current = null;
        }}
        onPointerCancel={() => {
          last.current = null;
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={clear} className="text-sm underline">
          Clear
        </button>
        <button type="button" disabled={empty} onClick={use} className={useBtn}>
          Use signature
        </button>
      </div>
    </div>
  );
}

function TypePad({ onCreate }: { onCreate: (s: SignatureImage) => void }) {
  const [name, setName] = useState('');
  const [font, setFont] = useState(0);

  const use = async () => {
    const css = `72px ${SIGNATURE_FONTS[font].family}`;
    await document.fonts.load(css, name); // the webfont must be loaded before drawing on a canvas
    const canvas = document.createElement('canvas');
    const measure = canvas.getContext('2d')!;
    measure.font = css;
    canvas.width = Math.ceil(measure.measureText(name).width) + 40;
    canvas.height = 140;
    const ctx = canvas.getContext('2d')!; // resizing reset the context state
    ctx.font = css;
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 20, 70);
    const trimmed = trimCanvas(canvas);
    if (trimmed) onCreate(await canvasToPng(trimmed));
  };

  return (
    <div>
      <input
        aria-label="Your name"
        placeholder="Your name"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2"
      />
      <div role="radiogroup" aria-label="Signature style" className="mt-2 space-y-1">
        {SIGNATURE_FONTS.map((f, i) => (
          <label key={f.name} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50">
            <input type="radio" name="signature-font" checked={font === i} onChange={() => setFont(i)} />
            <span className="sr-only">{f.name}</span>
            <span aria-hidden style={{ fontFamily: f.family, fontSize: 28, color: INK }}>
              {name || 'Your name'}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={!name.trim()} onClick={use} className={useBtn}>
          Use signature
        </button>
      </div>
    </div>
  );
}

function UploadPad({ onCreate, onError }: { onCreate: (s: SignatureImage) => void; onError: (e: PdfToolError) => void }) {
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return onError(new PdfToolError('TOO_LARGE', `${f.name} is larger than 50 MB`));
    const bytes = new Uint8Array(await f.arrayBuffer());
    const info = readImageInfo(bytes);
    if (info?.type !== 'png') return onError(new PdfToolError('INVALID_IMAGE', `${f.name} isn't a PNG image`));
    onCreate({ bytes, width: info.width, height: info.height });
  };
  return (
    <label className="block text-sm text-gray-600">
      Upload a PNG (a transparent background works best)
      <input
        type="file"
        accept=".png"
        aria-label="Signature image"
        className="mt-2 block text-sm"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

export function SignatureCreator({ onCreate, onError }: { onCreate: (s: SignatureImage) => void; onError: (e: PdfToolError) => void }) {
  const [tab, setTab] = useState<Tab>('draw');
  return (
    <div className="rounded border border-gray-200 p-4">
      <div role="tablist" className="mb-3 flex gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1 text-sm font-semibold ${tab === id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'draw' && <DrawPad onCreate={onCreate} />}
      {tab === 'type' && <TypePad onCreate={onCreate} />}
      {tab === 'upload' && <UploadPad onCreate={onCreate} onError={onError} />}
    </div>
  );
}
```

- [ ] **Step 8: Implement `web/src/components/workspaces/SignWorkspace.tsx`**

```tsx
'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { DEFAULT_STYLE, editorReducer, initialEditorState, newId } from '@/lib/editor/model';
import type { AnnotateOptions } from '@/lib/pdf/annotate';
import { usePdfRenderer } from '@/lib/pdf/usePdfRenderer';
import { PageEditor } from '../editor/PageEditor';
import { ErrorCard } from '../ErrorCard';
import { SignatureCreator, type SignatureImage } from '../sign/SignatureCreator';
import type { WorkspaceProps } from '.';

interface Signature extends SignatureImage {
  id: string;
  url: string;
}

/** New placements are this fraction of the page width. */
const PLACE_WIDTH = 0.3;

export function SignWorkspace({ inputs, onInputsChange, run, busy, onError }: WorkspaceProps) {
  const file = inputs[0];
  const { renderer, sizes, error } = usePdfRenderer(file);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [page, setPage] = useState(0);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const place = (s: Signature) => {
    if (!sizes) return;
    const size = sizes[page];
    const w = size.width * PLACE_WIDTH;
    const h = (w * s.height) / s.width;
    dispatch({
      type: 'add',
      object: { id: newId(), page, type: 'image', imageId: s.id, x: (size.width - w) / 2, y: (size.height - h) / 2, w, h },
    });
  };

  const addSignature = (img: SignatureImage) => {
    const url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: 'image/png' }));
    urls.current.push(url);
    const sig: Signature = { ...img, id: newId(), url };
    setSignatures((prev) => [...prev, sig]);
    place(sig);
  };

  const sign = () => {
    const opts: AnnotateOptions = {
      objects: state.objects,
      images: Object.fromEntries(signatures.map((s) => [s.id, s.bytes])),
      suffix: 'signed',
    };
    run('annotate', opts);
  };

  const imageUrls = Object.fromEntries(signatures.map((s) => [s.id, s.url]));

  return (
    <div className="grid gap-6 rounded-md bg-white p-6 shadow-sm md:grid-cols-[300px_1fr]">
      <aside>
        <h2 className="mb-3 font-semibold">Your signature</h2>
        <SignatureCreator onCreate={addSignature} onError={onError} />
        {signatures.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold text-gray-600">Click to place again</h3>
            <ul className="space-y-2">
              {signatures.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-label={`Place signature ${i + 1}`}
                    disabled={busy || !sizes}
                    onClick={() => place(s)}
                    className="w-full rounded border border-gray-200 p-2 hover:border-brand disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview */}
                    <img src={s.url} alt="" className="mx-auto max-h-12" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-5 text-xs text-gray-500">
          Signatures stay in this browser tab only. Drag to move, drag the corner to resize, press Delete to remove.
        </p>
      </aside>

      <div>
        {renderer && sizes ? (
          <PageEditor
            renderer={renderer}
            sizes={sizes}
            page={page}
            onPageChange={setPage}
            state={state}
            dispatch={dispatch}
            imageUrls={imageUrls}
            tool="select"
            style={DEFAULT_STYLE}
            disabled={busy}
          />
        ) : (
          <p className="py-10 text-center text-gray-500">Loading pages…</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={busy || !state.selectedId}
            onClick={() => state.selectedId && dispatch({ type: 'remove', id: state.selectedId })}
            className="flex items-center gap-1 text-sm disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Remove selected
          </button>
          <button
            type="button"
            disabled={busy || state.objects.length === 0}
            onClick={sign}
            className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Signing…' : 'SIGN PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Register the workspace and enable the tool**

In `web/src/components/workspaces/index.ts`, import `SignWorkspace` and add `'sign-pdf': SignWorkspace,`. In `web/src/tools.ts`, set `available: true` on `sign-pdf`. In `web/tests/tools.test.ts`, change the list to:

```ts
    'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png', 'rotate-pdf', 'sign-pdf', 'split-pdf', 'watermark-pdf',
```

- [ ] **Step 10: Run unit tests, types, lint and e2e**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/sign.spec.ts e2e/home.spec.ts`
Expected:
- all unit tests pass;
- tsc and lint are clean;
- e2e reports 15 passed (5 tests × 3 browsers).

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/canvas.ts web/src/lib/signatureFonts.ts web/src/lib/editor/prepareImage.ts web/src/lib/pdf/usePdfRenderer.ts web/src/components/editor web/src/components/sign web/src/components/workspaces web/src/tools.ts web/tests/canvas.test.ts web/tests/tools.test.ts web/e2e/sign.spec.ts
git commit -m "feat(web): enable Sign PDF with draw/type/upload signatures on a shared page editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`prepareImage.ts` is created here, next to the other browser image helpers. Its first caller is the Edit workspace in Task 11.

---

### Task 11: Edit PDF (tool goes live) and deployment check

**Files:**
- Create: `web/src/components/workspaces/EditWorkspace.tsx`, `web/e2e/edit.spec.ts`
- Modify: `web/src/components/workspaces/index.ts`, `web/src/tools.ts`, `web/tests/tools.test.ts`
- Test: `web/e2e/edit.spec.ts`

**Interfaces:**
- Consumes:
  - `PageEditor` and `DrawTool` (Task 10)
  - `prepareImage` and `usePdfRenderer` (Task 10)
  - editor model `STANDARD_FONTS`, `DEFAULT_STYLE`, `withStyle`, `editorReducer` and `newId` (Task 8)
  - engine `'annotate'` (Task 9)
  - `toToolError`
- Produces: `EditWorkspace`, mapped under `'edit-pdf'`; `edit-pdf` becomes available, giving 9 of 14 tools in total.

- [ ] **Step 1: Write the failing e2e test**

`web/e2e/edit.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { imageCounts, pageText } from '../tests/helpers';
import { pdfUpload, pngUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

async function openEditor(page: Page) {
  await page.goto('/edit-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1, [400, 500])]);
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  return (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;
}

async function drag(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 5 });
  await page.mouse.up();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'SAVE PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-edited.pdf');
  return new Uint8Array(await readDownload(download));
}

test('draw a rectangle, add text, undo and redo, then save', async ({ page }) => {
  const at = await openEditor(page);
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await drag(page, at(0.1, 0.1), at(0.4, 0.3));
  await expect(page.getByTestId('editor-object')).toHaveCount(1);

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.mouse.click(...at(0.1, 0.6));
  await expect(page.getByTestId('editor-object')).toHaveCount(2);
  await page.getByLabel('Text content').fill('Hello PDF');

  await page.getByRole('button', { name: 'Undo' }).click(); // reverts the typing
  await page.getByRole('button', { name: 'Undo' }).click(); // removes the text box
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(2);

  const pdf = await save(page);
  expect((await pageText(pdf))[0].map((t) => t.str)).toContain('Hello PDF');
});

test('select and drag moves a shape', async ({ page }) => {
  const at = await openEditor(page);
  await page.getByRole('button', { name: 'Whiteout' }).click();
  await drag(page, at(0.2, 0.2), at(0.4, 0.3));
  await page.getByRole('button', { name: 'Select' }).click();
  const shape = page.getByTestId('editor-object');
  const before = (await shape.boundingBox())!;
  await drag(page, at(0.3, 0.25), at(0.5, 0.45));
  const after = (await shape.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(10);
  expect(after.y - before.y).toBeGreaterThan(10);
});

test('an inserted image is embedded on save', async ({ page }) => {
  await openEditor(page);
  await page.getByTestId('insert-image-input').setInputFiles(pngUpload('logo.png', 80, 40));
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
  expect(await imageCounts(await save(page))).toEqual([1]);
});
```

Run: `cd web && npx playwright test e2e/edit.spec.ts --project=chromium`
Expected: FAIL. The page says "This tool is coming soon.", so there is no dropzone.

- [ ] **Step 2: Implement `web/src/components/workspaces/EditWorkspace.tsx`**

```tsx
'use client';

import {
  Circle, Eraser, Highlighter, ImagePlus, Minus, MousePointer2, PenLine, Redo2, Square, Trash2, Type, Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  DEFAULT_STYLE,
  STANDARD_FONTS,
  editorReducer,
  initialEditorState,
  newId,
  withStyle,
  type DrawStyle,
  type FontName,
} from '@/lib/editor/model';
import { prepareImage } from '@/lib/editor/prepareImage';
import type { AnnotateOptions } from '@/lib/pdf/annotate';
import { toToolError } from '@/lib/pdf/errors';
import { usePdfRenderer } from '@/lib/pdf/usePdfRenderer';
import { PageEditor, type DrawTool } from '../editor/PageEditor';
import { ErrorCard } from '../ErrorCard';
import type { WorkspaceProps } from '.';

const TOOLS: { id: DrawTool; label: string; Icon: LucideIcon }[] = [
  { id: 'select', label: 'Select', Icon: MousePointer2 },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'pen', label: 'Pen', Icon: PenLine },
  { id: 'highlight', label: 'Highlight', Icon: Highlighter },
  { id: 'whiteout', label: 'Whiteout', Icon: Eraser },
];
const STROKES = [1, 2, 4, 8];
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 24, 32, 48, 72];
/** New images are at most this fraction of the page width. */
const PLACE_WIDTH = 0.4;

interface InsertedImage {
  bytes: Uint8Array;
  url: string;
}

const iconBtn = 'rounded p-2 hover:bg-gray-100 disabled:opacity-30';
const fieldCls = 'rounded border border-gray-300 px-2 py-1';

export function EditWorkspace({ inputs, onInputsChange, run, busy, onError }: WorkspaceProps) {
  const file = inputs[0];
  const { renderer, sizes, error } = usePdfRenderer(file);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<DrawTool>('select');
  const [style, setStyle] = useState<DrawStyle>(DEFAULT_STYLE);
  const [images, setImages] = useState<Record<string, InsertedImage>>({});
  const imageInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const selected = state.objects.find((o) => o.id === state.selectedId) ?? null;

  // Style controls set the style for new objects and also restyle the selected object.
  const applyStyle = (patch: Partial<DrawStyle>) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (selected) {
      const next = withStyle(selected, patch);
      if (next !== selected) dispatch({ type: 'change', id: selected.id, object: next });
    }
  };

  const insertImage = async (f: File | undefined) => {
    if (!f || !sizes) return;
    try {
      const img = await prepareImage(f);
      const imageId = newId();
      const url = URL.createObjectURL(new Blob([img.bytes as BlobPart]));
      urls.current.push(url);
      setImages((prev) => ({ ...prev, [imageId]: { bytes: img.bytes, url } }));
      const size = sizes[page];
      const w = Math.min(size.width * PLACE_WIDTH, img.width * 0.75);
      const h = (w * img.height) / img.width;
      dispatch({
        type: 'add',
        object: { id: newId(), page, type: 'image', imageId, x: (size.width - w) / 2, y: (size.height - h) / 2, w, h },
      });
      setTool('select');
    } catch (e) {
      onError(toToolError(e));
    }
  };

  const save = () => {
    const opts: AnnotateOptions = {
      objects: state.objects,
      images: Object.fromEntries(Object.entries(images).map(([id, img]) => [id, img.bytes])),
      suffix: 'edited',
    };
    run('annotate', opts);
  };

  const imageUrls = Object.fromEntries(Object.entries(images).map(([id, img]) => [id, img.url]));
  const shownColor = selected && 'color' in selected ? selected.color : style.color;

  return (
    <div className="rounded-md bg-white p-4 shadow-sm md:p-6">
      <div role="toolbar" aria-label="Editing tools" className="mb-3 flex flex-wrap items-center gap-1 border-b border-gray-200 pb-3">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={tool === id}
            disabled={busy}
            onClick={() => setTool(id)}
            className={`rounded p-2 ${tool === id ? 'bg-brand text-white' : 'hover:bg-gray-100'}`}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
        <button type="button" aria-label="Insert image" title="Insert image" disabled={busy || !sizes} onClick={() => imageInput.current?.click()} className={iconBtn}>
          <ImagePlus className="h-5 w-5" />
        </button>
        <input
          ref={imageInput}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png"
          data-testid="insert-image-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void insertImage(f);
          }}
        />
        <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden />
        <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={busy || state.past.length === 0} onClick={() => dispatch({ type: 'undo' })} className={iconBtn}>
          <Undo2 className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={busy || state.future.length === 0} onClick={() => dispatch({ type: 'redo' })} className={iconBtn}>
          <Redo2 className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Delete selected" title="Delete (Del)" disabled={busy || !selected} onClick={() => selected && dispatch({ type: 'remove', id: selected.id })} className={iconBtn}>
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Color
          <input type="color" value={shownColor} onChange={(e) => applyStyle({ color: e.target.value })} className="h-8 w-10" />
        </label>
        <label className="flex items-center gap-2">
          Stroke width
          <select value={style.strokeWidth} onChange={(e) => applyStyle({ strokeWidth: Number(e.target.value) })} className={fieldCls}>
            {STROKES.map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Font
          <select value={style.font} onChange={(e) => applyStyle({ font: e.target.value as FontName })} className={fieldCls}>
            {STANDARD_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Font size
          <select value={style.size} onChange={(e) => applyStyle({ size: Number(e.target.value) })} className={fieldCls}>
            {FONT_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected?.type === 'text' && (
        <label className="mb-3 block text-sm font-semibold text-gray-600">
          Text content
          <textarea
            key={selected.id}
            autoFocus
            rows={2}
            value={selected.text}
            onFocus={(e) => {
              e.currentTarget.select();
              dispatch({ type: 'begin' });
            }}
            onChange={(e) => dispatch({ type: 'change', id: selected.id, object: { ...selected, text: e.target.value } })}
            onBlur={() => {
              dispatch({ type: 'end' });
              if (!selected.text.trim()) dispatch({ type: 'remove', id: selected.id });
            }}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 font-normal text-gray-900"
          />
        </label>
      )}

      {renderer && sizes ? (
        <PageEditor
          renderer={renderer}
          sizes={sizes}
          page={page}
          onPageChange={setPage}
          state={state}
          dispatch={dispatch}
          imageUrls={imageUrls}
          tool={tool}
          style={style}
          onPlaced={() => setTool('select')}
          disabled={busy}
        />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Existing text in the PDF can&apos;t be changed — cover it with Whiteout and write over it with Text.
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || state.objects.length === 0}
          onClick={save}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'SAVE PDF'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the workspace and enable the tool**

In `web/src/components/workspaces/index.ts`, import `EditWorkspace` and add `'edit-pdf': EditWorkspace,`. In `web/src/tools.ts`, set `available: true` on `edit-pdf`. In `web/tests/tools.test.ts`, change the list to:

```ts
    'edit-pdf', 'image-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'pdf-to-png', 'rotate-pdf', 'sign-pdf', 'split-pdf', 'watermark-pdf',
```

- [ ] **Step 4: Run the whole suite**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npx playwright test`
Expected:
- every unit test passes;
- tsc and lint are clean;
- Playwright reports **105 passed**: Plan 1's 21 tests plus this plan's 14 (3 image-to-pdf, 3 pdf-to-image, 3 watermark, 2 sign, 3 edit), each run in 3 browsers.

`tool-shell.spec.ts` still uses `/compress-pdf` as its "coming soon" page, which stays unavailable until Plan 3.

- [ ] **Step 5: Deployment check in Docker**

Docker Desktop must be running. Run from the repo root:

```bash
docker compose up -d --build
for s in image-to-pdf pdf-to-jpg pdf-to-png watermark-pdf sign-pdf edit-pdf; do curl -s -o /dev/null -w "%{http_code} $s\n" http://localhost:3000/$s; done
docker compose down
```

Expected: the build succeeds (including the next/font download of the three signature fonts), and each of the six lines starts with `200`.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/workspaces web/src/tools.ts web/tests/tools.test.ts web/e2e/edit.spec.ts
git commit -m "feat(web): enable Edit PDF with text, shapes, pen, highlight, whiteout and images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
