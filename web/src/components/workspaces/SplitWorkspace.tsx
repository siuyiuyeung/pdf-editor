'use client';

import { useState } from 'react';
import type { SplitOptions } from '@/lib/pdf/split';
import { usePageThumbs } from '@/lib/pdf/usePageThumbs';
import { ErrorCard } from '../ErrorCard';
import { PageGrid } from '../PageGrid';
import type { WorkspaceProps } from '.';

type Mode = SplitOptions['mode'];

const MODES: { value: Mode; label: string }[] = [
  { value: 'ranges', label: 'By page ranges' },
  { value: 'every', label: 'Every N pages' },
  { value: 'select', label: 'Select pages' },
];

export function SplitWorkspace({ inputs, onInputsChange, run, busy }: WorkspaceProps) {
  const file = inputs[0];
  const { pageCount, thumbs, error } = usePageThumbs(file);
  const [mode, setMode] = useState<Mode>('ranges');
  const [ranges, setRanges] = useState('');
  const [n, setN] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const opts: SplitOptions =
    mode === 'ranges' ? { mode, ranges } : mode === 'every' ? { mode, n } : { mode, pages: [...selected] };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>

      <fieldset className="mb-4 flex flex-wrap gap-6">
        <legend className="sr-only">Split mode</legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex items-center gap-2">
            <input type="radio" name="split-mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      {mode === 'ranges' && (
        <input
          aria-label="Ranges"
          placeholder="e.g. 1-3, 5"
          value={ranges}
          onChange={(e) => setRanges(e.target.value)}
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
        />
      )}
      {mode === 'every' && (
        <label className="mb-4 flex items-center gap-2">
          <input
            aria-label="Pages per file"
            type="number"
            min={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="w-24 rounded border border-gray-300 px-3 py-2"
          />
          pages per file
        </label>
      )}
      {mode === 'select' && <p className="mb-4 text-sm text-gray-500">Click pages to include them in one new PDF.</p>}

      {pageCount !== null ? (
        <PageGrid
          thumbs={thumbs}
          isSelected={mode === 'select' ? (i) => selected.has(i) : undefined}
          onPageClick={mode === 'select' ? toggle : undefined}
        />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={() => run('split', opts)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Splitting…' : 'SPLIT PDF'}
        </button>
      </div>
    </div>
  );
}
