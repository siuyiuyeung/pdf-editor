'use client';

import { FileText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatSize } from '@/lib/files';
import type { ServerEngine } from '@/lib/pdf/run';
import type { WorkspaceProps } from '.';

const PRIVACY =
  'This tool uploads your file to our server for conversion. It is deleted as soon as you have the result, and always within 1 hour.';

interface ServerToolProps extends WorkspaceProps {
  engine: ServerEngine;
  action: string;
  busyAction: string;
  opts?: object;
  children?: ReactNode;
}

function ServerTool({ inputs, run, busy, status, engine, action, busyAction, opts = {}, children }: ServerToolProps) {
  const file = inputs[0];
  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <FileText className="h-6 w-6 shrink-0 text-gray-400" aria-hidden />
        <p className="truncate font-semibold">{file.name}</p>
        <span className="ml-auto shrink-0 text-sm text-gray-500">{formatSize(file.bytes.length)}</span>
      </div>
      {children}
      <p className="mt-4 text-xs text-gray-500">{PRIVACY}</p>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-4">
        {busy && status && (
          <span role="status" className="text-sm text-gray-600">
            {status}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(engine, opts)}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? busyAction : action}
        </button>
      </div>
    </div>
  );
}

const LEVELS = [
  { value: 'low', label: 'Low compression', hint: 'Best quality, smaller savings' },
  { value: 'medium', label: 'Recommended compression', hint: 'Good quality, good savings' },
  { value: 'high', label: 'High compression', hint: 'Smallest file, lower image quality' },
] as const;
type Level = (typeof LEVELS)[number]['value'];

export function CompressWorkspace(props: WorkspaceProps) {
  const [level, setLevel] = useState<Level>('medium');
  return (
    <ServerTool {...props} engine="compress" action="COMPRESS PDF" busyAction="Compressing…" opts={{ level }}>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Compression level</legend>
        {LEVELS.map((l) => (
          <label key={l.value} className="flex items-start gap-2">
            <input type="radio" name="level" className="mt-1" checked={level === l.value} onChange={() => setLevel(l.value)} />
            <span>
              <span className="font-semibold">{l.label}</span>
              <span className="block text-sm text-gray-500">{l.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </ServerTool>
  );
}

export function WordToPdfWorkspace(props: WorkspaceProps) {
  return <ServerTool {...props} engine="wordToPdf" action="CONVERT TO PDF" busyAction="Converting…" />;
}

export function ExcelToPdfWorkspace(props: WorkspaceProps) {
  return <ServerTool {...props} engine="excelToPdf" action="CONVERT TO PDF" busyAction="Converting…" />;
}

export function PowerpointToPdfWorkspace(props: WorkspaceProps) {
  return <ServerTool {...props} engine="powerpointToPdf" action="CONVERT TO PDF" busyAction="Converting…" />;
}

export function PdfToWordWorkspace(props: WorkspaceProps) {
  return (
    <ServerTool {...props} engine="pdfToWord" action="CONVERT TO WORD" busyAction="Converting…">
      <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
        Complex layouts — multiple columns, tables, unusual fonts — may not convert perfectly. Check the Word file before
        relying on it.
      </p>
    </ServerTool>
  );
}
