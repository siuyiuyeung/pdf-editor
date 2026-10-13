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
