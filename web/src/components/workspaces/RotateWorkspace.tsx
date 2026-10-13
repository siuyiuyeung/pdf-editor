'use client';

import { RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePageThumbs } from '@/lib/pdf/usePageThumbs';
import { ErrorCard } from '../ErrorCard';
import { PageGrid } from '../PageGrid';
import type { WorkspaceProps } from '.';

const norm = (deg: number) => ((deg % 360) + 360) % 360;

export function RotateWorkspace({ inputs, onInputsChange, run, busy }: WorkspaceProps) {
  const file = inputs[0];
  const { pageCount, thumbs, error } = usePageThumbs(file);
  const [rot, setRot] = useState<number[]>([]);

  // Sized from the page count (known before thumbnails render) so early clicks aren't lost.
  useEffect(() => {
    if (pageCount !== null) setRot(new Array(pageCount).fill(0));
  }, [pageCount]);

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const rotateAll = (delta: number) => setRot((r) => r.map((x) => norm(x + delta)));
  const rotateOne = (i: number) => setRot((r) => r.map((x, j) => (j === i ? norm(x + 90) : x)));
  const unchanged = rot.every((r) => r === 0);

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>
      <div className="mb-4 flex flex-wrap gap-3">
        <button type="button" disabled={rot.length === 0} onClick={() => rotateAll(-90)} className="disabled:opacity-50 flex items-center gap-2 rounded border border-gray-300 px-4 py-2">
          <RotateCcw className="h-4 w-4" aria-hidden /> Rotate all left
        </button>
        <button type="button" disabled={rot.length === 0} onClick={() => rotateAll(90)} className="disabled:opacity-50 flex items-center gap-2 rounded border border-gray-300 px-4 py-2">
          <RotateCw className="h-4 w-4" aria-hidden /> Rotate all right
        </button>
        <span className="self-center text-sm text-gray-500">Click a page to rotate it 90°.</span>
      </div>

      {pageCount !== null ? (
        <PageGrid thumbs={thumbs} rotationOf={(i) => rot[i] ?? 0} onPageClick={rotateOne} />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || rot.length === 0 || unchanged}
          onClick={() => run('rotate', { rotations: rot })}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Rotating…' : 'ROTATE PDF'}
        </button>
      </div>
    </div>
  );
}
