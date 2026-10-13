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
