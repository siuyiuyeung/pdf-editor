'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import {
  HIGHLIGHT_COLOR,
  HIGHLIGHT_OPACITY,
  LINE_HEIGHT,
  TEXT_BASELINE,
  bounds,
  newId,
  penPath,
  resize,
  translate,
  type DrawStyle,
  type EditObject,
  type EditorAction,
  type EditorState,
  type FontName,
  type Rect,
  type TextObject,
} from '@/lib/editor/model';
import type { Size } from '@/lib/pdf/geometry';
import type { PageRenderer } from '@/lib/pdf/pdfToImages';
import { PageView } from './PageView';

export type DrawTool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'pen' | 'highlight' | 'whiteout';
type ShapeTool = Exclude<DrawTool, 'select' | 'text'>;
type Point = { x: number; y: number };
type Gesture =
  | { kind: 'move'; id: string; start: Point; origin: EditObject }
  | { kind: 'resize'; id: string; start: Point; origin: EditObject; box: Rect }
  | { kind: 'draw'; start: Point };

/** Smallest drawn shape kept, in points; smaller drags are treated as stray clicks. */
const MIN_SIZE = 3;

export function cssFont(font: FontName): { fontFamily: string; fontWeight: number; fontStyle: string } {
  const fontFamily = font.startsWith('Times')
    ? '"Times New Roman", Times, serif'
    : font.startsWith('Courier')
      ? '"Courier New", Courier, monospace'
      : 'Helvetica, Arial, sans-serif';
  return { fontFamily, fontWeight: font.includes('Bold') ? 700 : 400, fontStyle: /Oblique|Italic/.test(font) ? 'italic' : 'normal' };
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a text object's longest line, in points, using the browser's font metrics. */
export function measureText(o: TextObject): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return o.text.length * o.size * 0.5;
  const f = cssFont(o.font);
  measureCtx.font = `${f.fontStyle} ${f.fontWeight} ${o.size}px ${f.fontFamily}`;
  const ctx = measureCtx;
  return Math.max(o.size / 2, ...o.text.split('\n').map((line) => ctx.measureText(line).width));
}

function newShape(tool: ShapeTool, page: number, p: Point, style: DrawStyle): EditObject {
  const common = { id: newId(), page, color: tool === 'highlight' ? HIGHLIGHT_COLOR : style.color, strokeWidth: style.strokeWidth };
  switch (tool) {
    case 'line':
      return { ...common, type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    case 'pen':
      return { ...common, type: 'pen', points: [p.x, p.y] };
    default:
      return { ...common, type: tool, x: p.x, y: p.y, w: 0, h: 0 };
  }
}

function extendShape(d: EditObject, start: Point, p: Point): EditObject {
  switch (d.type) {
    case 'line':
      return { ...d, x2: p.x, y2: p.y };
    case 'pen':
      return { ...d, points: [...d.points, p.x, p.y] };
    case 'rect':
    case 'ellipse':
    case 'highlight':
    case 'whiteout':
      return { ...d, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    default:
      return d;
  }
}

function bigEnough(d: EditObject): boolean {
  if (d.type === 'pen') return d.points.length >= 4;
  const b = bounds(d, measureText);
  return d.type === 'line' ? Math.max(b.w, b.h) >= MIN_SIZE : b.w >= MIN_SIZE && b.h >= MIN_SIZE;
}

function ObjectShape({ o, imageUrls }: { o: EditObject; imageUrls: Record<string, string> }) {
  switch (o.type) {
    case 'text': {
      const style = { ...cssFont(o.font), whiteSpace: 'pre' as const };
      return (
        <>
          {o.text.split('\n').map((line, i) => (
            <text key={i} x={o.x} y={o.y + o.size * (TEXT_BASELINE + LINE_HEIGHT * i)} fontSize={o.size} fill={o.color} style={style}>
              {line}
            </text>
          ))}
        </>
      );
    }
    case 'rect':
      return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke={o.color} strokeWidth={o.strokeWidth} />;
    case 'ellipse':
      return <ellipse cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={o.w / 2} ry={o.h / 2} fill="none" stroke={o.color} strokeWidth={o.strokeWidth} />;
    case 'highlight':
      return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={o.color} fillOpacity={HIGHLIGHT_OPACITY} style={{ mixBlendMode: 'multiply' }} />;
    case 'whiteout':
      return <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="#ffffff" />;
    case 'line':
      return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={o.color} strokeWidth={o.strokeWidth} strokeLinecap="round" />;
    case 'pen':
      return <path d={penPath(o.points)} fill="none" stroke={o.color} strokeWidth={o.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
    case 'image':
      return <image href={imageUrls[o.imageId]} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" />;
  }
}

function Selection({ o, pageWidth }: { o: EditObject; pageWidth: number }) {
  const b = bounds(o, measureText);
  const handle = pageWidth / 50;
  return (
    <g data-testid="selection">
      <rect
        x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8}
        fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"
      />
      {o.type !== 'text' && (
        <rect
          data-handle="resize" data-testid="resize-handle"
          x={b.x + b.w + 4 - handle / 2} y={b.y + b.h + 4 - handle / 2} width={handle} height={handle}
          fill="#2563eb" className="cursor-nwse-resize"
        />
      )}
    </g>
  );
}

interface PageEditorProps {
  renderer: PageRenderer;
  sizes: Size[];
  page: number;
  onPageChange: (page: number) => void;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Object URLs for ImageObject.imageId. */
  imageUrls: Record<string, string>;
  tool: DrawTool;
  style: DrawStyle;
  /** Called after a one-shot tool (text) has placed its object. */
  onPlaced?: () => void;
  disabled?: boolean;
}

export function PageEditor({
  renderer, sizes, page, onPageChange, state, dispatch, imageUrls, tool, style, onPlaced, disabled = false,
}: PageEditorProps) {
  const size = sizes[page];
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<EditObject | null>(null);
  const objects = state.objects.filter((o) => o.page === page);
  const selected = objects.find((o) => o.id === state.selectedId) ?? null;

  // Delete/Backspace removes the selection; Ctrl/Cmd+Z undo; Ctrl+Y or Ctrl/Cmd+Shift+Z redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        e.preventDefault();
        dispatch({ type: 'remove', id: state.selectedId });
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.selectedId, disabled]);

  const toPoint = (e: ReactPointerEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * size.width) / r.width, y: ((e.clientY - r.top) * size.height) / r.height };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0) return;
    const p = toPoint(e);
    const target = e.target as Element;
    if (tool === 'select') {
      if (selected && target.closest('[data-handle="resize"]')) {
        gesture.current = { kind: 'resize', id: selected.id, start: p, origin: selected, box: bounds(selected, measureText) };
      } else {
        const id = target.closest('[data-id]')?.getAttribute('data-id') ?? null;
        dispatch({ type: 'select', id });
        const hit = objects.find((o) => o.id === id);
        if (!hit) return;
        gesture.current = { kind: 'move', id: hit.id, start: p, origin: hit };
      }
      dispatch({ type: 'begin' });
    } else if (tool === 'text') {
      dispatch({
        type: 'add',
        object: { id: newId(), page, type: 'text', x: p.x, y: p.y, text: 'Text', font: style.font, size: style.size, color: style.color },
      });
      onPlaced?.();
      return;
    } else {
      gesture.current = { kind: 'draw', start: p };
      setDraft(newShape(tool, page, p, style));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toPoint(e);
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (g.kind === 'move') {
      dispatch({ type: 'change', id: g.id, object: translate(g.origin, dx, dy) });
    } else if (g.kind === 'resize') {
      const w = Math.max(MIN_SIZE, g.box.w + dx);
      // Images keep their aspect ratio; other shapes resize freely.
      const h = g.origin.type === 'image' && g.box.w > 0 ? (w * g.box.h) / g.box.w : Math.max(MIN_SIZE, g.box.h + dy);
      dispatch({ type: 'change', id: g.id, object: resize(g.origin, g.box, { x: g.box.x, y: g.box.y, w, h }) });
    } else {
      setDraft((d) => (d ? extendShape(d, g.start, p) : d));
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'draw') {
      if (draft && bigEnough(draft)) dispatch({ type: 'add', object: draft });
      setDraft(null);
    } else {
      dispatch({ type: 'end' });
    }
  };

  const go = (next: number) => {
    dispatch({ type: 'select', id: null });
    onPageChange(next);
  };

  return (
    <div>
      {sizes.length > 1 && (
        <div className="mb-3 flex items-center justify-center gap-4 text-sm">
          <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span>
            Page {page + 1} of {sizes.length}
          </span>
          <button type="button" aria-label="Next page" disabled={page === sizes.length - 1} onClick={() => go(page + 1)} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="relative mx-auto w-full max-w-3xl border border-gray-200 shadow-sm" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <PageView renderer={renderer} index={page} size={size} />
        <svg
          ref={svgRef}
          data-testid="editor-canvas"
          viewBox={`0 0 ${size.width} ${size.height}`}
          className={`absolute inset-0 h-full w-full touch-none select-none ${tool === 'select' ? '' : 'cursor-crosshair'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {objects.map((o) => {
            const b = bounds(o, measureText);
            return (
              <g key={o.id} data-id={o.id} data-testid="editor-object" className={tool === 'select' ? 'cursor-move' : undefined}>
                {/* Transparent hit area so thin or unfilled shapes are easy to grab. */}
                <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="transparent" />
                <ObjectShape o={o} imageUrls={imageUrls} />
              </g>
            );
          })}
          {draft && <ObjectShape o={draft} imageUrls={imageUrls} />}
          {selected && <Selection o={selected} pageWidth={size.width} />}
        </svg>
      </div>
    </div>
  );
}
