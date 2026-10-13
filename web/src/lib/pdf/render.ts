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
