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

interface RenderOptions {
  maxWidth?: number;
  signal?: AbortSignal;
  /** Called once, as soon as the page count is known (before any page renders). */
  onCount: (pageCount: number) => void;
  /** Called for each page as its JPEG data URL becomes available (0-based index). */
  onPage: (index: number, url: string) => void;
}

/** Streams page thumbnails so the UI can show and act on pages before all have rendered. Browser only. */
export async function renderThumbnails(bytes: Uint8Array, opts: RenderOptions): Promise<void> {
  const { maxWidth = 160, signal, onCount, onPage } = opts;
  const pdfjs = await getPdfjs();
  // pdf.js transfers (detaches) the buffer it receives; always hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    if (signal?.aborted) return;
    onCount(doc.numPages);
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.aborted) return;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxWidth / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      page.cleanup();
      if (signal?.aborted) return;
      onPage(i - 1, canvas.toDataURL('image/jpeg', 0.7));
    }
  } finally {
    await doc.destroy();
  }
}
