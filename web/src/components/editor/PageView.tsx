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
