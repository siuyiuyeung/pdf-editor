'use client';

import { useEffect, useState } from 'react';
import { readInputs } from '@/lib/files';
import { clearHandoff, peekHandoff, setHandoff } from '@/lib/handoff';
import { toToolError, type PdfToolError } from '@/lib/pdf/errors';
import { Dropzone } from './Dropzone';
import { ErrorCard } from './ErrorCard';
import { HowToUse } from './HowToUse';
import { ToolsGrid } from './ToolsGrid';

export function HomeClient() {
  const [ready, setReady] = useState(0);
  const [error, setError] = useState<PdfToolError | null>(null);

  useEffect(() => {
    const pending = peekHandoff();
    if (pending) setReady(pending.length);
  }, []);

  const onFiles = async (files: File[]) => {
    setError(null);
    try {
      const read = await readInputs(files, ['.pdf'], true);
      if (read.length === 0) return;
      setHandoff(read);
      setReady(read.length);
      document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      setError(toToolError(e));
    }
  };

  return (
    <>
      <header className="pb-8 pt-12 text-center">
        <h1 className="font-display text-4xl text-gray-800">EDIT PDF</h1>
        <p className="mt-2 font-semibold text-gray-700">Free PDF tools, right in your browser</p>
      </header>
      <div className="mx-auto max-w-5xl px-4">
        {error && <ErrorCard error={error} onDismiss={() => setError(null)} />}
        {ready > 0 ? (
          <div data-testid="home-ready" className="rounded-md bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold">
              {ready} PDF{ready > 1 ? 's' : ''} ready — choose a tool below
            </p>
            <button
              type="button"
              className="mt-3 text-sm text-gray-500 underline"
              onClick={() => {
                clearHandoff();
                setReady(0);
              }}
            >
              Choose different files
            </button>
          </div>
        ) : (
          <Dropzone accept={['.pdf']} multiple label="PDF FILE" onFiles={onFiles} />
        )}
      </div>
      <HowToUse />
      <ToolsGrid acceptingExt={ready > 0 ? '.pdf' : undefined} />
    </>
  );
}
