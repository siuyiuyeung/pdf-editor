'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { canvasToPng, trimCanvas } from '@/lib/canvas';
import { MAX_BYTES } from '@/lib/files';
import { readImageInfo } from '@/lib/image';
import { PdfToolError } from '@/lib/pdf/errors';
import { SIGNATURE_FONTS } from '@/lib/signatureFonts';

export interface SignatureImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

type Tab = 'draw' | 'type' | 'upload';
const TABS: [Tab, string][] = [['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']];
const INK = '#1e293b';
const useBtn = 'rounded-sm bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50';

function DrawPad({ onCreate }: { onCreate: (s: SignatureImage) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  const use = async () => {
    const trimmed = trimCanvas(ref.current!);
    if (trimmed) onCreate(await canvasToPng(trimmed));
    clear();
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={200}
        data-testid="signature-pad"
        aria-label="Draw your signature"
        className="w-full touch-none rounded border border-dashed border-gray-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const p = point(e);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
          setEmpty(false);
        }}
        onPointerUp={() => {
          last.current = null;
        }}
        onPointerCancel={() => {
          last.current = null;
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={clear} className="text-sm underline">
          Clear
        </button>
        <button type="button" disabled={empty} onClick={use} className={useBtn}>
          Use signature
        </button>
      </div>
    </div>
  );
}

function TypePad({ onCreate }: { onCreate: (s: SignatureImage) => void }) {
  const [name, setName] = useState('');
  const [font, setFont] = useState(0);

  const use = async () => {
    const css = `72px ${SIGNATURE_FONTS[font].family}`;
    await document.fonts.load(css, name); // the webfont must be loaded before drawing on a canvas
    const canvas = document.createElement('canvas');
    const measure = canvas.getContext('2d')!;
    measure.font = css;
    canvas.width = Math.ceil(measure.measureText(name).width) + 40;
    canvas.height = 140;
    const ctx = canvas.getContext('2d')!; // resizing reset the context state
    ctx.font = css;
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 20, 70);
    const trimmed = trimCanvas(canvas);
    if (trimmed) onCreate(await canvasToPng(trimmed));
  };

  return (
    <div>
      <input
        aria-label="Your name"
        placeholder="Your name"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2"
      />
      <div role="radiogroup" aria-label="Signature style" className="mt-2 space-y-1">
        {SIGNATURE_FONTS.map((f, i) => (
          <label key={f.name} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50">
            <input type="radio" name="signature-font" checked={font === i} onChange={() => setFont(i)} />
            <span className="sr-only">{f.name}</span>
            <span aria-hidden style={{ fontFamily: f.family, fontSize: 28, color: INK }}>
              {name || 'Your name'}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={!name.trim()} onClick={use} className={useBtn}>
          Use signature
        </button>
      </div>
    </div>
  );
}

function UploadPad({ onCreate, onError }: { onCreate: (s: SignatureImage) => void; onError: (e: PdfToolError) => void }) {
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return onError(new PdfToolError('TOO_LARGE', `${f.name} is larger than 50 MB`));
    const bytes = new Uint8Array(await f.arrayBuffer());
    const info = readImageInfo(bytes);
    if (info?.type !== 'png') return onError(new PdfToolError('INVALID_IMAGE', `${f.name} isn't a PNG image`));
    onCreate({ bytes, width: info.width, height: info.height });
  };
  return (
    <label className="block text-sm text-gray-600">
      Upload a PNG (a transparent background works best)
      <input
        type="file"
        accept=".png"
        aria-label="Signature image"
        className="mt-2 block text-sm"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

export function SignatureCreator({ onCreate, onError }: { onCreate: (s: SignatureImage) => void; onError: (e: PdfToolError) => void }) {
  const [tab, setTab] = useState<Tab>('draw');
  return (
    <div className="rounded border border-gray-200 p-4">
      <div role="tablist" className="mb-3 flex gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1 text-sm font-semibold ${tab === id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'draw' && <DrawPad onCreate={onCreate} />}
      {tab === 'type' && <TypePad onCreate={onCreate} />}
      {tab === 'upload' && <UploadPad onCreate={onCreate} onError={onError} />}
    </div>
  );
}
