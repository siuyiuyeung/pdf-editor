'use client';

import { useState } from 'react';
import { MAX_BYTES } from '@/lib/files';
import { readImageInfo } from '@/lib/image';
import { PdfToolError } from '@/lib/pdf/errors';
import type { WatermarkOptions, WatermarkPosition } from '@/lib/pdf/watermark';
import type { WorkspaceProps } from '.';

const POSITION_LABELS: [WatermarkPosition, string][] = [
  ['center', 'Center'],
  ['tiled', 'Tiled (repeat across the page)'],
  ['top-left', 'Top left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['middle-left', 'Middle left'],
  ['middle-right', 'Middle right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right'],
];
const ROTATIONS = [0, 45, -45, 90];

const fieldCls = 'rounded border border-gray-300 px-3 py-2 font-normal text-gray-900';
const labelCls = 'flex flex-col gap-1 text-sm font-semibold text-gray-600';

export function WatermarkWorkspace({ inputs, run, busy, onError }: WorkspaceProps) {
  const file = inputs[0];
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState('#e5322d');
  const [image, setImage] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [scale, setScale] = useState(50);
  const [opacity, setOpacity] = useState(40);
  const [rotation, setRotation] = useState(45);
  const [position, setPosition] = useState<WatermarkPosition>('center');
  const [pages, setPages] = useState('');

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return onError(new PdfToolError('TOO_LARGE', `${f.name} is larger than 50 MB`));
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!readImageInfo(bytes)) {
      setImage(null);
      return onError(new PdfToolError('INVALID_IMAGE', `${f.name} isn't a valid JPG or PNG image`));
    }
    setImage({ name: f.name, bytes });
  };

  const ready = mode === 'text' ? text.trim() !== '' : image !== null;
  const submit = () => {
    const common = { opacity: opacity / 100, rotation, position, pages };
    const opts: WatermarkOptions =
      mode === 'text' ? { mode, text, fontSize, color, ...common } : { mode, image: image!.bytes, scale: scale / 100, ...common };
    run('watermark', opts);
  };

  return (
    <div className="rounded-md bg-white p-6 shadow-sm">
      <p className="mb-4 truncate font-semibold">{file.name}</p>

      <fieldset className="mb-5 flex gap-6">
        <legend className="mb-2 text-sm font-semibold text-gray-600">Watermark type</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="wm-mode" checked={mode === 'text'} onChange={() => setMode('text')} />
          Text
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="wm-mode" checked={mode === 'image'} onChange={() => setMode('image')} />
          Image
        </label>
      </fieldset>

      {mode === 'text' ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <label className={labelCls}>
            Watermark text
            <input value={text} maxLength={100} onChange={(e) => setText(e.target.value)} className={fieldCls} />
          </label>
          <label className={labelCls}>
            Font size
            <input type="number" min={6} max={200} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className={`${fieldCls} w-24`} />
          </label>
          <label className={labelCls}>
            Color
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded border border-gray-300" />
          </label>
        </div>
      ) : (
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>
            Watermark image
            <input type="file" accept=".png,.jpg,.jpeg" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} className="text-sm font-normal" />
            {image && <span className="text-xs font-normal text-gray-500">{image.name}</span>}
          </label>
          <label className={labelCls}>
            Image size: {scale}% of page width
            <input type="range" min={10} max={100} step={5} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <label className={labelCls}>
          Opacity: {opacity}%
          <input type="range" min={5} max={100} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
        <label className={labelCls}>
          Rotation
          <select value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className={fieldCls}>
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>
                {r}°
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value as WatermarkPosition)} className={fieldCls}>
            {POSITION_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Pages
          <input value={pages} placeholder="All pages, or e.g. 1-3, 5" onChange={(e) => setPages(e.target.value)} className={fieldCls} />
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={submit}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Adding watermark…' : 'ADD WATERMARK'}
        </button>
      </div>
    </div>
  );
}
