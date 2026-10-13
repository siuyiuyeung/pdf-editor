'use client';

import { useEffect, useState } from 'react';
import { PdfToolError } from './errors';
import { renderThumbnails } from './render';
import type { InputFile } from './types';

interface ThumbState {
  /** Known as soon as the document opens; null while loading. */
  pageCount: number | null;
  /** One slot per page; undefined until that page has rendered. */
  thumbs: (string | undefined)[];
  error: PdfToolError | null;
}

const EMPTY: ThumbState = { pageCount: null, thumbs: [], error: null };

export function usePageThumbs(file: InputFile | undefined): ThumbState {
  const [state, setState] = useState<ThumbState>(EMPTY);

  useEffect(() => {
    if (!file) return;
    const ctrl = new AbortController();
    setState(EMPTY);
    renderThumbnails(file.bytes, {
      signal: ctrl.signal,
      onCount: (n) => setState({ pageCount: n, thumbs: new Array(n).fill(undefined), error: null }),
      onPage: (i, url) =>
        setState((s) => {
          const thumbs = s.thumbs.slice();
          thumbs[i] = url;
          return { ...s, thumbs };
        }),
    }).catch(() => {
      // The file already passed pdf-lib validation; this is a display-only failure.
      if (!ctrl.signal.aborted) {
        setState({ ...EMPTY, error: new PdfToolError('INVALID_FILE', `${file.name} couldn't be displayed`) });
      }
    });
    return () => ctrl.abort();
  }, [file]);

  return state;
}
