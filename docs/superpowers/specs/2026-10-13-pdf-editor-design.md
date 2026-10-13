# PDF Editor Web App — Design Spec

Date: 2026-10-13
Status: Approved in conversation, pending written-spec review
Reference: `reference.png` (OpenPDF layout)

## 1. Goal

A public PDF-tools website modeled on the OpenPDF reference. Anonymous users upload a file, apply one tool, and download the result. No accounts, no payments.

**Success criteria**
- All 14 tools work end-to-end (select file → configure → download) in current desktop and mobile Chrome, Firefox, Safari, and Edge.
- A typical file (≤10 MB, ≤50 pages) finishes in under ~10 seconds.
- Files for client-side tools never leave the user's device.
- Server-side uploads are deleted no later than 1 hour after upload.

**Assumptions**
- English UI only, responsive (desktop and mobile).
- Max input size is 50 MB per file.
- Deployed with `docker compose` on a single host. The owner exposes it publicly through their own Cloudflare Tunnel (`cloudflared`).

**Out of scope**
- Accounts, payments, history
- Editing existing PDF text
- Unlocking or encrypting PDFs
- TIFF→PDF
- i18n
- CI pipeline
- Horizontal scaling

## 2. Tools (14)

| Group | Tool | Slug | Engine |
|---|---|---|---|
| Organize | Merge PDF | `merge-pdf` | client |
| Organize | Split PDF | `split-pdf` | client |
| Organize | Rotate PDF | `rotate-pdf` | client |
| Organize | Compress PDF | `compress-pdf` | server |
| Edit | Edit PDF | `edit-pdf` | client |
| Edit | Watermark PDF | `watermark-pdf` | client |
| Edit | Sign PDF | `sign-pdf` | client |
| Image | PDF to JPG | `pdf-to-jpg` | client |
| Image | PDF to PNG | `pdf-to-png` | client |
| Image | JPG/PNG to PDF | `image-to-pdf` | client |
| Office | Word to PDF | `word-to-pdf` | server |
| Office | Excel to PDF | `excel-to-pdf` | server |
| Office | PowerPoint to PDF | `powerpoint-to-pdf` | server |
| Office | PDF to Word | `pdf-to-word` | server |

## 3. Architecture

Hybrid approach: the browser handles 10 tools locally, and the server handles only the 4 Office conversions and Compress.

```
Browser (Next.js 15, TypeScript, Tailwind)
  /            Home: hero dropzone, "How to use", tools grid
  /[tool]      One route per tool slug
  ToolShell:   Dropzone -> Workspace (tool-specific) -> ResultPanel
  lib/pdf/     Client engines (pdf-lib + pdf.js), run in a Web Worker
  lib/api/     Client for server jobs (upload -> poll -> download)
        |
        | same origin: Next.js rewrites /api/* -> http://api:8000
        v
API (FastAPI)       POST /jobs, GET /jobs/{id}, GET /jobs/{id}/file, DELETE /jobs/{id}
Queue (Redis + RQ)
Worker (Python)     office->pdf (LibreOffice headless), pdf->docx (pdf2docx),
                    compress (Ghostscript)
Storage             Docker volume /data/jobs/{id}/{in,out}
Sweeper             Deletes job dirs older than 1 hour, runs every 10 minutes
```

### Deployment

- `docker compose` services: `web`, `api`, `worker`, `redis`, `sweeper`.
- Only `web:3000` is published to the host. The owner points `cloudflared` at `http://<host>:3000`.
- `api`, `redis`, and `worker` live on internal Docker networks only. `worker` has no outbound network access.
- TLS and public DNS are handled by Cloudflare. The compose file has no reverse proxy.
- Cloudflare constraints that the design respects:
  - Request bodies are capped at 100 MB, and we cap uploads at 50 MB.
  - Requests time out at about 100 s, so all server jobs are async and polled.

### Unit boundaries

- **Tool registry (`web/src/tools.ts`)** is the single source of truth for each tool. Each entry holds `slug`, `title`, `subtitle`, `group`, `icon`, `accept` (MIME/extensions), `multiple`, `engine: "client" | "server"`, and its Workspace component. The home grid, routes, and metadata are all generated from it.
- **Client engines (`web/src/lib/pdf/*`)** are pure async functions with signature `(inputs: Uint8Array[], opts) => Promise<Uint8Array | NamedBlob[]>`. They have no DOM dependency except where they render through pdf.js `OffscreenCanvas`. They run inside a Web Worker via a thin RPC wrapper, and throw `PdfToolError(code, message)`.
- **Worker handlers (`server/worker/handlers/*`)** each have signature `handle(input_path: Path, out_dir: Path, opts: dict) -> Path`. They have no knowledge of HTTP or Redis.
- **API** owns validation, rate limiting, job lifecycle, and file serving. It never runs conversions itself.

## 4. Data flow

### Client tool

1. The Dropzone reads files into memory as `Uint8Array`. Nothing is uploaded.
2. The Workspace renders thumbnails with pdf.js and collects options.
3. The engine runs in a Web Worker and returns the output bytes.
4. The ResultPanel offers:
   - Download (Blob URL)
   - Start over
   - Use in another tool (passes the output bytes in memory to another tool's page)

### Server tool

1. `POST /api/jobs` sends multipart `file`, `tool`, and `opts` (JSON). The API then:
   1. validates the tool, extension, magic bytes, and size, and checks the rate limit;
   2. stores the upload at `/data/jobs/{uuid4}/in/<sanitized-name>`;
   3. enqueues the job and returns `202 {"id": ...}`.
2. The client polls `GET /api/jobs/{id}` every 1 s and receives `{"status": "queued" | "running" | "done" | "failed", "error"?: {code, message}, "output"?: {name, size}}`.
3. The worker runs the handler with a per-tool timeout and writes the result to `/out`.
4. When the status is `done`, the client calls `GET /api/jobs/{id}/file`. The response is a `Content-Disposition: attachment` download.
5. `DELETE /api/jobs/{id}` removes the job immediately (the "Delete now" button). Otherwise the sweeper removes it after 1 hour.

The job ID (UUID4) is the only access credential.

## 5. Tool behavior

- **Merge**: accepts multiple PDFs. Files can be reordered by drag and removed individually. Output is one PDF.
- **Split**: three modes.
  - Page ranges (e.g. `1-3,5`): each range becomes its own file.
  - Every N pages.
  - Selected thumbnails: extracted into one PDF.
  
  A multi-file result downloads as a ZIP.
- **Rotate**: rotates per page (clicking a thumbnail) or all pages, by 90, 180, or 270 degrees.
- **Compress**: three levels.

  | Level | Ghostscript preset |
  |---|---|
  | low | `/printer` |
  | medium | `/ebook` |
  | high | `/screen` |

  The result shows the size before and after. If the output is not smaller, the original is returned with a notice.
- **Edit**: pages are rendered with pdf.js, and edits are made on an overlay canvas. Available tools:
  - text box (font from the standard 14, size, color)
  - rectangle, ellipse, line
  - freehand pen
  - highlight (translucent rectangle)
  - image insert
  - whiteout (opaque white rectangle)

  Objects can be selected, moved, resized, and deleted, with undo and redo. On export, objects are drawn into the PDF with pdf-lib (flattened). Existing text cannot be edited.
- **Watermark**: text or image watermark. Options are font size, color, opacity, rotation, position (center, tiled, or 9-grid), and page range.
- **Sign**: three ways to create a signature:
  - draw on a canvas
  - type in one of 3 bundled script fonts
  - upload a PNG

  Signatures live only in session memory. A signature can be placed, moved, and resized on any page, multiple times. It is embedded as an image on export.
- **PDF→JPG / PDF→PNG**: DPI 72, 150, or 300, for all pages or selected pages. A single page downloads as an image; multiple pages download as a ZIP.
- **JPG/PNG→PDF**: accepts multiple images, which can be reordered. Options:
  - page size: fit to image, A4, or Letter
  - orientation: auto, portrait, or landscape
  - margin: none, small, or large
- **Word/Excel/PowerPoint→PDF**: `soffice --headless --convert-to pdf`, with no options.
  - Word accepts `.doc` and `.docx`.
  - Excel accepts `.xls` and `.xlsx`.
  - PowerPoint accepts `.ppt` and `.pptx`.
- **PDF→Word**: converted with pdf2docx. The UI warns that complex layouts may not convert accurately.

## 6. UI

The UI follows the reference.

- **Top bar**: white, with the logo/wordmark on the left.
- **Page**: light gray background.
- **Tool page header**: a large bold title with a subtitle below it.
- **Dropzone**: red dashed border, a red "SELECT PDF FILE" button (the label adapts to the accepted type), and the text "Or drag and drop here".
- **Below the work area**:
  - "How to use" in 3 steps: Choose → Edit → Download
  - the tools grid in 4 columns on desktop, 2 on mobile; the tile for the current tool is outlined in red
- **Tile icon colors by group**:

  | Group | Color |
  |---|---|
  | Word | blue |
  | Image | yellow |
  | PowerPoint | salmon |
  | Excel | green |
  | Organize | orange |
  | Compress | olive |
  | Edit | purple |
  | Sign | dark blue |

- A footer notes the privacy behavior: "Most tools run in your browser. Uploaded files are deleted within 1 hour."

## 7. Errors

### Client

| Code | Shown to user |
|---|---|
| `INVALID_FILE` | "This file isn't a valid PDF" |
| `ENCRYPTED` | "Protected PDF — remove the password first" |
| `UNSUPPORTED_TYPE` | (wrong file type for this tool) |
| `TOO_LARGE` | (file exceeds the limit) |
| `OUT_OF_MEMORY` | (file too large to process in the browser) |
| `UNKNOWN` | (generic failure) |

Errors appear as an inline card with a retry option, and the loaded input is kept.

### Server

| HTTP status | `error.code` |
|---|---|
| `400` | `UNSUPPORTED_TYPE`, `INVALID_FILE`, `BAD_OPTIONS` |
| `413` | `TOO_LARGE` |
| `429` | `RATE_LIMITED` |
| `503` | `BUSY` |
| `404` | unknown or expired job |

When a job fails, the job status carries `TIMEOUT`, `CONVERSION_FAILED`, or `ENCRYPTED`.

## 8. Security and abuse controls

- **Upload validation**: extension whitelist per tool plus a magic-byte check, 50 MB maximum, one file per server job.
- **Rate limit**: keyed on `CF-Connecting-IP`, with a fallback to the socket peer address. The limit is 20 jobs per 10 minutes, stored in Redis. The header is trusted only because the API is reachable solely through `web`.
- **Queue cap**: when more than 50 jobs are queued, the API returns `503 BUSY`.
- **Worker container**:
  - runs as a non-root user with no outbound network
  - compose sets CPU and memory limits (2 CPU, 2 GB default)
- **Per-job timeouts**:

  | Converter | Timeout |
  |---|---|
  | LibreOffice | 90 s |
  | Ghostscript | 60 s |
  | pdf2docx | 120 s |

  On timeout the whole process group is killed.
- **LibreOffice**: each job gets a fresh `-env:UserInstallation` profile directory, which is deleted afterward. Macros are disabled by default.
- **Ghostscript**: runs with `-dSAFER`.
- **File names**: names are sanitized, and paths are never built from user input except the sanitized basename.
- **Logging**: logs record job ID, tool, input size, duration, and status only. File contents and file names are never logged.
- **Sweeper**: runs every 10 minutes and deletes job dirs whose `mtime` is older than 1 hour, regardless of job state.

## 9. Testing

- **Client engines**: Vitest tests against fixture PDFs and images. They assert:
  - page counts after merge and split
  - `/Rotate` values
  - watermark text presence via pdf.js text extraction
  - image dimensions at a given DPI
  - typed errors for encrypted and corrupt input
- **API**: pytest with httpx `TestClient`. Covers:
  - validation paths
  - 413 and 429 responses
  - the job lifecycle with a stubbed queue
  - 404 after the sweeper runs
- **Worker**: pytest integration tests run inside the worker image. Real LibreOffice, Ghostscript, and pdf2docx process small fixtures, and the tests assert that each output is a valid PDF or DOCX with the expected page count. They also cover the timeout path.
- **E2E**: Playwright against `docker compose up`, with one happy path per tool (14 in total).
- **Entry point**: `make test` runs all suites locally. CI is out of scope.

## 10. Repository layout

```
pdf-editor/
  docker-compose.yml
  Makefile
  web/                 Next.js app
    src/app/           routes (/, /[tool])
    src/tools.ts       tool registry
    src/components/    ToolShell, Dropzone, ResultPanel, ToolsGrid, HowToUse, workspaces/*
    src/lib/pdf/       client engines + worker RPC
    src/lib/api/       server job client
    tests/             vitest
    e2e/               playwright
  server/
    api/               FastAPI app
    worker/            RQ worker + handlers/
    sweeper/           cleanup loop
    tests/
    Dockerfile.api
    Dockerfile.worker  (LibreOffice, Ghostscript, pdf2docx, fonts)
  docs/superpowers/specs/
```
