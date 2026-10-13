'use client';

import { useState } from 'react';
import type { ImageFormat, PdfToImagesOptions } from '@/lib/pdf/pdfToImages';
import { usePageThumbs } from '@/lib/pdf/usePageThumbs';
import { ErrorCard } from '../ErrorCard';
import { PageGrid } from '../PageGrid';
import type { WorkspaceProps } from '.';

const DPIS: { value: PdfToImagesOptions['dpi']; label: string }[] = [
  { value: 72, label: '72 DPI (screen)' },
  { value: 150, label: '150 DPI (standard)' },
  { value: 300, label: '300 DPI (print)' },
];

function PdfToImageWorkspace({ format, inputs, onInputsChange, run, busy }: WorkspaceProps & { format: ImageFormat }) {
  const file = inputs[0];
  const { pageCount, thumbs, error } = usePageThumbs(file);
  const [dpi, setDpi] = useState<PdfToImagesOptions['dpi']>(150);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const opts: PdfToImagesOptions = { format, dpi, pages: all ? 'all' : [...selected] };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>

      <fieldset className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Image quality</legend>
        {DPIS.map((d) => (
          <label key={d.value} className="flex items-center gap-2">
            <input type="radio" name="dpi" checked={dpi === d.value} onChange={() => setDpi(d.value)} />
            {d.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mb-4 flex flex-wrap gap-6">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Pages</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="pages" checked={all} onChange={() => setAll(true)} />
          All pages
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pages" checked={!all} onChange={() => setAll(false)} />
          Select pages
        </label>
      </fieldset>
      {!all && <p className="mb-4 text-sm text-gray-500">Click pages to convert only those.</p>}

      {pageCount !== null ? (
        <PageGrid thumbs={thumbs} isSelected={all ? undefined : (i) => selected.has(i)} onPageClick={all ? undefined : toggle} />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || (!all && selected.size === 0)}
          onClick={() => run('pdfToImages', opts)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Converting…' : `CONVERT TO ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}

export function PdfToJpgWorkspace(props: WorkspaceProps) {
  return <PdfToImageWorkspace {...props} format="jpg" />;
}

export function PdfToPngWorkspace(props: WorkspaceProps) {
  return <PdfToImageWorkspace {...props} format="png" />;
}
