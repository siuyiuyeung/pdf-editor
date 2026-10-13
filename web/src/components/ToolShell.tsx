'use client';

import { useCallback, useEffect, useState } from 'react';
import { extensionOf, readInputs } from '@/lib/files';
import { takeHandoff } from '@/lib/handoff';
import { runEngine } from '@/lib/pdf/client';
import { runTool, type ToolEngine } from '@/lib/pdf/run';
import { toToolError, type PdfToolError } from '@/lib/pdf/errors';
import type { InputFile, OutputFile } from '@/lib/pdf/types';
import { usePreventWindowDrop } from '@/lib/usePreventWindowDrop';
import { acceptLabel, getTool } from '@/tools';
import { Dropzone } from './Dropzone';
import { ErrorCard } from './ErrorCard';
import { ResultPanel } from './ResultPanel';
import { WORKSPACES } from './workspaces';

export function ToolShell({ slug }: { slug: string }) {
  const tool = getTool(slug)!;
  const Workspace = WORKSPACES[slug];
  const [inputs, setInputs] = useState<InputFile[]>([]);
  const [outputs, setOutputs] = useState<OutputFile[] | null>(null);
  const [error, setError] = useState<PdfToolError | null>(null);
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  usePreventWindowDrop();

  // Accepts already-read files (dropzone or handoff); PDFs are parsed in the worker first
  // so encrypted/corrupt files are rejected before any workspace renders.
  const accept = useCallback(
    async (read: InputFile[], append: boolean) => {
      if (read.length === 0) return;
      await runEngine('validate', read, {});
      setInputs((prev) => (append && tool.multiple ? [...prev, ...read] : read));
    },
    [tool.multiple],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setValidating(true);
      try {
        await accept(await readInputs(files, tool.accept, tool.multiple), true);
      } catch (e) {
        setError(toToolError(e));
      } finally {
        setValidating(false);
      }
    },
    [accept, tool],
  );

  useEffect(() => {
    const handed = takeHandoff();
    if (!handed) return;
    const usable = handed.filter((f) => tool.accept.includes(extensionOf(f.name)));
    setValidating(true);
    accept(tool.multiple ? usable : usable.slice(0, 1), false)
      .catch((e) => setError(toToolError(e)))
      .finally(() => setValidating(false));
  }, [tool, accept]);

  const run = useCallback(
    async (engine: ToolEngine, opts: unknown) => {
      setBusy(true);
      setError(null);
      try {
        setOutputs(await runTool(engine, inputs, opts));
      } catch (e) {
        setError(toToolError(e));
      } finally {
        setBusy(false);
      }
    },
    [inputs],
  );

  const reset = () => {
    setInputs([]);
    setOutputs(null);
    setError(null);
  };

  if (!tool.available || !Workspace) {
    return (
      <section className="mx-auto max-w-5xl px-4">
        <div className="rounded-md bg-white p-10 text-center text-lg text-gray-600 shadow-sm">
          This tool is coming soon.
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4">
      {error && <ErrorCard error={error} onDismiss={() => setError(null)} />}
      {outputs ? (
        <ResultPanel outputs={outputs} onReset={reset} />
      ) : inputs.length === 0 && validating ? (
        <div role="status" className="rounded-md bg-white p-10 text-center text-lg text-gray-600 shadow-sm">
          Checking file…
        </div>
      ) : inputs.length === 0 ? (
        <Dropzone accept={tool.accept} multiple={tool.multiple} label={acceptLabel(tool)} onFiles={addFiles} />
      ) : (
        <Workspace
          inputs={inputs}
          onInputsChange={setInputs}
          onAddFiles={addFiles}
          onError={setError}
          run={run}
          busy={busy || validating}
        />
      )}
    </section>
  );
}
