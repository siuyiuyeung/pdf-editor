'use client';

import {
  Circle, Eraser, Highlighter, ImagePlus, Minus, MousePointer2, PenLine, Redo2, Square, Trash2, Type, Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  DEFAULT_STYLE,
  STANDARD_FONTS,
  editorReducer,
  initialEditorState,
  newId,
  withStyle,
  type DrawStyle,
  type FontName,
} from '@/lib/editor/model';
import { prepareImage } from '@/lib/editor/prepareImage';
import type { AnnotateOptions } from '@/lib/pdf/annotate';
import { toToolError } from '@/lib/pdf/errors';
import { usePdfRenderer } from '@/lib/pdf/usePdfRenderer';
import { PageEditor, type DrawTool } from '../editor/PageEditor';
import { ErrorCard } from '../ErrorCard';
import type { WorkspaceProps } from '.';

const TOOLS: { id: DrawTool; label: string; Icon: LucideIcon }[] = [
  { id: 'select', label: 'Select', Icon: MousePointer2 },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'pen', label: 'Pen', Icon: PenLine },
  { id: 'highlight', label: 'Highlight', Icon: Highlighter },
  { id: 'whiteout', label: 'Whiteout', Icon: Eraser },
];
const STROKES = [1, 2, 4, 8];
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 24, 32, 48, 72];
/** New images are at most this fraction of the page width. */
const PLACE_WIDTH = 0.4;

interface InsertedImage {
  bytes: Uint8Array;
  url: string;
}

const iconBtn = 'rounded p-2 hover:bg-gray-100 disabled:opacity-30';
const fieldCls = 'rounded border border-gray-300 px-2 py-1';

export function EditWorkspace({ inputs, onInputsChange, run, busy, onError }: WorkspaceProps) {
  const file = inputs[0];
  const { renderer, sizes, error } = usePdfRenderer(file);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<DrawTool>('select');
  const [style, setStyle] = useState<DrawStyle>(DEFAULT_STYLE);
  const [images, setImages] = useState<Record<string, InsertedImage>>({});
  const imageInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (error) return <ErrorCard error={error} onDismiss={() => onInputsChange([])} />;

  const selected = state.objects.find((o) => o.id === state.selectedId) ?? null;

  // Style controls set the style for new objects and also restyle the selected object.
  const applyStyle = (patch: Partial<DrawStyle>) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (selected) {
      const next = withStyle(selected, patch);
      if (next !== selected) dispatch({ type: 'change', id: selected.id, object: next });
    }
  };

  const insertImage = async (f: File | undefined) => {
    if (!f || !sizes) return;
    try {
      const img = await prepareImage(f);
      const imageId = newId();
      const url = URL.createObjectURL(new Blob([img.bytes as BlobPart]));
      urls.current.push(url);
      setImages((prev) => ({ ...prev, [imageId]: { bytes: img.bytes, url } }));
      const size = sizes[page];
      const w = Math.min(size.width * PLACE_WIDTH, img.width * 0.75);
      const h = (w * img.height) / img.width;
      dispatch({
        type: 'add',
        object: { id: newId(), page, type: 'image', imageId, x: (size.width - w) / 2, y: (size.height - h) / 2, w, h },
      });
      setTool('select');
    } catch (e) {
      onError(toToolError(e));
    }
  };

  const save = () => {
    const opts: AnnotateOptions = {
      objects: state.objects,
      images: Object.fromEntries(Object.entries(images).map(([id, img]) => [id, img.bytes])),
      suffix: 'edited',
    };
    run('annotate', opts);
  };

  const imageUrls = Object.fromEntries(Object.entries(images).map(([id, img]) => [id, img.url]));
  const shownColor = selected && 'color' in selected ? selected.color : style.color;

  return (
    <div className="rounded-md bg-white p-4 shadow-sm md:p-6">
      <div role="toolbar" aria-label="Editing tools" className="mb-3 flex flex-wrap items-center gap-1 border-b border-gray-200 pb-3">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={tool === id}
            disabled={busy}
            onClick={() => setTool(id)}
            className={`rounded p-2 ${tool === id ? 'bg-brand text-white' : 'hover:bg-gray-100'}`}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
        <button type="button" aria-label="Insert image" title="Insert image" disabled={busy || !sizes} onClick={() => imageInput.current?.click()} className={iconBtn}>
          <ImagePlus className="h-5 w-5" />
        </button>
        <input
          ref={imageInput}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png"
          data-testid="insert-image-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void insertImage(f);
          }}
        />
        <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden />
        <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={busy || state.past.length === 0} onClick={() => dispatch({ type: 'undo' })} className={iconBtn}>
          <Undo2 className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={busy || state.future.length === 0} onClick={() => dispatch({ type: 'redo' })} className={iconBtn}>
          <Redo2 className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Delete selected" title="Delete (Del)" disabled={busy || !selected} onClick={() => selected && dispatch({ type: 'remove', id: selected.id })} className={iconBtn}>
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Color
          <input type="color" value={shownColor} onChange={(e) => applyStyle({ color: e.target.value })} className="h-8 w-10" />
        </label>
        <label className="flex items-center gap-2">
          Stroke width
          <select value={style.strokeWidth} onChange={(e) => applyStyle({ strokeWidth: Number(e.target.value) })} className={fieldCls}>
            {STROKES.map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Font
          <select value={style.font} onChange={(e) => applyStyle({ font: e.target.value as FontName })} className={fieldCls}>
            {STANDARD_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Font size
          <select value={style.size} onChange={(e) => applyStyle({ size: Number(e.target.value) })} className={fieldCls}>
            {FONT_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected?.type === 'text' && (
        <label className="mb-3 block text-sm font-semibold text-gray-600">
          Text content
          <textarea
            key={selected.id}
            autoFocus
            rows={2}
            value={selected.text}
            onFocus={(e) => {
              e.currentTarget.select();
              dispatch({ type: 'begin' });
            }}
            onChange={(e) => dispatch({ type: 'change', id: selected.id, object: { ...selected, text: e.target.value } })}
            onBlur={() => {
              dispatch({ type: 'end' });
              if (!selected.text.trim()) dispatch({ type: 'remove', id: selected.id });
            }}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 font-normal text-gray-900"
          />
        </label>
      )}

      {renderer && sizes ? (
        <PageEditor
          renderer={renderer}
          sizes={sizes}
          page={page}
          onPageChange={setPage}
          state={state}
          dispatch={dispatch}
          imageUrls={imageUrls}
          tool={tool}
          style={style}
          onPlaced={() => setTool('select')}
          disabled={busy}
        />
      ) : (
        <p className="py-10 text-center text-gray-500">Loading pages…</p>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Existing text in the PDF can&apos;t be changed — cover it with Whiteout and write over it with Text.
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={busy || state.objects.length === 0}
          onClick={save}
          className="rounded-sm bg-brand px-8 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'SAVE PDF'}
        </button>
      </div>
    </div>
  );
}
