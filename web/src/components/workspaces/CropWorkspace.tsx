'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_CROP } from '@/lib/cropRect';
import type { CropOptions, CropRect } from '@/lib/pdf/crop';
import { usePdfRenderer } from '@/lib/pdf/usePdfRenderer';
import { CropOverlay } from '../crop/CropOverlay';
import { PageView } from '../editor/PageView';
import { ErrorCard } from '../ErrorCard';
import type { WorkspaceProps } from '.';

export function CropWorkspace({ inputs, onInputsChange, run, busy }: WorkspaceProps) {
  const file = inputs[0];
  const { renderer, sizes, error } = usePdfRenderer(file);
  const [page, setPage] = useState(0);
  const [rect, setRect] = useState<CropRect>(DEFAULT_CROP);
  const [scope, setScope] = useState<'all' | 'page'>('all');

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const crop = () => {
    const opts: CropOptions = { rect, pages: scope === 'all' ? 'all' : [page] };
    run('crop', opts);
  };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>
      {renderer && sizes ? (
        <>
          {sizes.length > 1 && (
            <div className="mb-3 flex items-center justify-center gap-4 text-sm">
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span>
                Page {page + 1} of {sizes.length}
              </span>
              <button type="button" aria-label="Next page" disabled={page === sizes.length - 1} onClick={() => setPage(page + 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
          <div
            className="relative mx-auto w-full max-w-3xl overflow-hidden border border-gray-200 shadow-sm"
            style={{ aspectRatio: `${sizes[page].width} / ${sizes[page].height}` }}
          >
            <PageView renderer={renderer} index={page} size={sizes[page]} />
            <CropOverlay rect={rect} onChange={setRect} disabled={busy} />
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <fieldset className="mt-5 flex flex-wrap gap-6">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Apply to</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="crop-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
          Crop all pages
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="crop-scope" checked={scope === 'page'} onChange={() => setScope('page')} />
          Crop this page only
        </label>
      </fieldset>
      <p className="mt-3 text-xs text-gray-500">
        Cropping hides everything outside the box in every PDF viewer, but the hidden content stays in the file — it is not
        redaction.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={busy} onClick={() => setRect(DEFAULT_CROP)} className="text-sm underline disabled:opacity-50">
          Reset box
        </button>
        <button
          type="button"
          disabled={busy || !sizes}
          onClick={crop}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Cropping…' : 'CROP PDF'}
        </button>
      </div>
    </div>
  );
}
