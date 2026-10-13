'use client';

import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { WorkspaceProps } from '.';

export function MergeWorkspace({ inputs, onInputsChange, onAddFiles, run, busy }: WorkspaceProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= inputs.length || from === to) return;
    const next = [...inputs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onInputsChange(next);
  };

  const remove = (index: number) => onInputsChange(inputs.filter((_, i) => i !== index));

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <ol className="space-y-2">
        {inputs.map((f, i) => (
          <li
            key={`${i}-${f.name}`}
            data-testid="merge-item"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
            }}
            className="flex cursor-move items-center gap-3 rounded border border-gray-200 p-3"
          >
            <GripVertical className="h-4 w-4 text-gray-400" aria-hidden />
            <span className="w-6 text-sm text-gray-400">{i + 1}.</span>
            <span className="flex-1 truncate">{f.name}</span>
            <button type="button" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1 disabled:opacity-30">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" aria-label={`Move ${f.name} down`} disabled={i === inputs.length - 1} onClick={() => move(i, i + 1)} className="p-1 disabled:opacity-30">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => remove(i)} className="p-1">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>

      {inputs.length < 2 && <p className="mt-4 text-sm text-gray-500">Add at least 2 PDFs to merge.</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => addRef.current?.click()} className="font-semibold text-brand">
          + Add more PDFs
        </button>
        <input
          ref={addRef}
          type="file"
          hidden
          accept=".pdf"
          multiple
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy || inputs.length < 2}
          onClick={() => run('merge', {})}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Merging…' : 'MERGE PDF'}
        </button>
      </div>
    </div>
  );
}
