'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { downloadBytes } from '@/lib/download';
import { formatSize } from '@/lib/files';
import { setHandoff } from '@/lib/handoff';
import { PDF_MIME, type OutputFile } from '@/lib/pdf/types';
import { zipFiles } from '@/lib/zip';

export function ResultPanel({ outputs, onReset }: { outputs: OutputFile[]; onReset: () => void }) {
  const router = useRouter();
  const [zipping, setZipping] = useState(false);
  const single = outputs.length === 1 ? outputs[0] : null;

  const download = async () => {
    if (single) return downloadBytes(single.bytes, single.name, single.mime);
    setZipping(true);
    try {
      downloadBytes(await zipFiles(outputs), 'files.zip', 'application/zip');
    } finally {
      setZipping(false);
    }
  };

  const reuse = () => {
    if (!single) return;
    setHandoff([{ name: single.name, bytes: single.bytes }]);
    router.push('/#tools');
  };

  return (
    <div data-testid="result" className="rounded-md bg-white p-8 text-center shadow-sm">
      <h2 className="font-display text-2xl text-gray-800">
        {single ? 'Your file is ready' : `Your ${outputs.length} files are ready`}
      </h2>
      {outputs.some((f) => f.note) && (
        <p data-testid="result-note" className="mt-2 text-sm text-gray-600">
          {outputs.find((f) => f.note)?.note}
        </p>
      )}
      <ul className="my-4 text-sm text-gray-600">
        {outputs.map((f, i) => (
          <li key={i}>
            {f.name} · {formatSize(f.bytes.length)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={download}
        disabled={zipping}
        className="rounded-sm bg-brand px-10 py-4 text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {single ? 'DOWNLOAD' : 'DOWNLOAD ZIP'}
      </button>
      <div className="mt-4 flex justify-center gap-6 text-sm">
        <button type="button" onClick={onReset} className="underline">
          Start over
        </button>
        {single?.mime === PDF_MIME && (
          <button type="button" onClick={reuse} className="underline">
            Use in another tool
          </button>
        )}
      </div>
    </div>
  );
}
