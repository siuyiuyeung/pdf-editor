'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ImageToPdfOptions } from '@/lib/pdf/imageToPdf';
import type { InputFile } from '@/lib/pdf/types';
import { moveItem } from '@/lib/reorder';
import type { WorkspaceProps } from '.';

function useObjectUrls(files: InputFile[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(new Blob([f.bytes as BlobPart])));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

const selectCls = 'rounded border border-gray-300 px-3 py-2 font-normal text-gray-900 disabled:opacity-50';
const labelCls = 'flex flex-col gap-1 text-sm font-semibold text-gray-600';

export function ImageToPdfWorkspace({ inputs, onInputsChange, onAddFiles, run, busy }: WorkspaceProps) {
  const [pageSize, setPageSize] = useState<ImageToPdfOptions['pageSize']>('a4');
  const [orientation, setOrientation] = useState<ImageToPdfOptions['orientation']>('auto');
  const [margin, setMargin] = useState<ImageToPdfOptions['margin']>('small');
  const urls = useObjectUrls(inputs);
  const addRef = useRef<HTMLInputElement>(null);

  const move = (from: number, to: number) => {
    const next = moveItem(inputs, from, to);
    if (next !== inputs) onInputsChange(next);
  };
  const remove = (index: number) => onInputsChange(inputs.filter((_, i) => i !== index));

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {inputs.map((f, i) => (
          <li key={`${i}-${f.name}`} data-testid="image-item" className="rounded border border-gray-200 p-2">
            <div className="flex h-32 items-center justify-center overflow-hidden bg-gray-50">
              {urls[i] && (
                // eslint-disable-next-line @next/next/no-img-element -- object URL preview
                <img src={urls[i]} alt={f.name} className="max-h-32 max-w-full" />
              )}
            </div>
            <p className="mt-1 truncate text-xs text-gray-600">
              {i + 1}. {f.name}
            </p>
            <div className="mt-1 flex justify-center gap-1">
              <button type="button" aria-label={`Move ${f.name} left`} disabled={busy || i === 0} onClick={() => move(i, i - 1)} className="p-1 disabled:opacity-30">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button type="button" aria-label={`Move ${f.name} right`} disabled={busy || i === inputs.length - 1} onClick={() => move(i, i + 1)} className="p-1 disabled:opacity-30">
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => remove(i)} className="p-1 disabled:opacity-30">
                <X className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className={labelCls}>
          Page size
          <select value={pageSize} disabled={busy} onChange={(e) => setPageSize(e.target.value as ImageToPdfOptions['pageSize'])} className={selectCls}>
            <option value="fit">Fit to image</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>
        <label className={labelCls}>
          Orientation
          <select value={orientation} disabled={busy || pageSize === 'fit'} onChange={(e) => setOrientation(e.target.value as ImageToPdfOptions['orientation'])} className={selectCls}>
            <option value="auto">Auto</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label className={labelCls}>
          Margin
          <select value={margin} disabled={busy} onChange={(e) => setMargin(e.target.value as ImageToPdfOptions['margin'])} className={selectCls}>
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={busy} onClick={() => addRef.current?.click()} className="font-semibold text-brand disabled:opacity-50">
          + Add more images
        </button>
        <input
          ref={addRef}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png"
          multiple
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || inputs.length === 0}
          onClick={() => run('imageToPdf', { pageSize, orientation, margin } satisfies ImageToPdfOptions)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Converting…' : 'CONVERT TO PDF'}
        </button>
      </div>
    </div>
  );
}
