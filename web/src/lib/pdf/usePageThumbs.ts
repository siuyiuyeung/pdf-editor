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
