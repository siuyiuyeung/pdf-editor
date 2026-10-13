'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { DEFAULT_STYLE, editorReducer, initialEditorState, newId } from '@/lib/editor/model';
import type { AnnotateOptions } from '@/lib/pdf/annotate';
import { usePdfRenderer } from '@/lib/pdf/usePdfRenderer';
import { PageEditor } from '../editor/PageEditor';
import { ErrorCard } from '../ErrorCard';
import { SignatureCreator, type SignatureImage } from '../sign/SignatureCreator';
import type { WorkspaceProps } from '.';

interface Signature extends SignatureImage {
  id: string;
  url: string;
}

/** New placements are this fraction of the page width. */
const PLACE_WIDTH = 0.3;

export function SignWorkspace({ inputs, onInputsChange, run, busy, onError }: WorkspaceProps) {
  const file = inputs[0];
  const { renderer, sizes, error } = usePdfRenderer(file);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [page, setPage] = useState(0);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const place = (s: Signature) => {
    if (!sizes) return;
    const size = sizes[page];
    const w = size.width * PLACE_WIDTH;
    const h = (w * s.height) / s.width;
    dispatch({
      type: 'add',
      object: { id: newId(), page, type: 'image', imageId: s.id, x: (size.width - w) / 2, y: (size.height - h) / 2, w, h },
    });
  };

  const addSignature = (img: SignatureImage) => {
    const url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: 'image/png' }));
    urls.current.push(url);
    const sig: Signature = { ...img, id: newId(), url };
    setSignatures((prev) => [...prev, sig]);
    place(sig);
  };

  const sign = () => {
    const opts: AnnotateOptions = {
      objects: state.objects,
      images: Object.fromEntries(signatures.map((s) => [s.id, s.bytes])),
      suffix: 'signed',
    };
    run('annotate', opts);
  };

  const imageUrls = Object.fromEntries(signatures.map((s) => [s.id, s.url]));

  return (
    <div className="grid gap-6 rounded-md bg-white p-6 shadow-sm md:grid-cols-[300px_1fr]">
      <aside>
        <h2 className="mb-3 font-semibold">Your signature</h2>
        {/* Placing needs page sizes; until they load, a new signature would have nowhere to go. */}
        {sizes ? (
          <SignatureCreator onCreate={addSignature} onError={onError} />
        ) : (
          <p className="py-6 text-center text-sm text-gray-500">Loading pages…</p>
        )}
        {signatures.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold text-gray-600">Click to place again</h3>
            <ul className="space-y-2">
              {signatures.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-label={`Place signature ${i + 1}`}
                    disabled={busy || !sizes}
                    onClick={() => place(s)}
                    className="w-full rounded border border-gray-200 p-2 hover:border-brand disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview */}
                    <img src={s.url} alt="" className="mx-auto max-h-12" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-5 text-xs text-gray-500">
          Signatures stay in this browser tab only. Drag to move, drag the corner to resize, press Delete to remove.
        </p>
      </aside>

      <div>
        {renderer && sizes ? (
          <PageEditor
            renderer={renderer}
            sizes={sizes}
            page={page}
            onPageChange={setPage}
            state={state}
            dispatch={dispatch}
            imageUrls={imageUrls}
            tool="select"
            style={DEFAULT_STYLE}
            disabled={busy}
          />
        ) : (
          <p className="py-10 text-center text-gray-500">Loading pages…</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={busy || !state.selectedId}
            onClick={() => state.selectedId && dispatch({ type: 'remove', id: state.selectedId })}
            className="flex items-center gap-1 text-sm disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Remove selected
          </button>
          <button
            type="button"
            disabled={busy || state.objects.length === 0}
            onClick={sign}
            className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Signing…' : 'SIGN PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
