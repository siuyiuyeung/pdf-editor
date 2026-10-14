'use client';

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { moveCrop, type CropHandle } from '@/lib/cropRect';
import type { CropRect } from '@/lib/pdf/crop';

const CORNERS: { id: Exclude<CropHandle, 'move'>; cls: string; cursor: string }[] = [
  { id: 'nw', cls: '-left-2 -top-2', cursor: 'cursor-nwse-resize' },
  { id: 'ne', cls: '-right-2 -top-2', cursor: 'cursor-nesw-resize' },
  { id: 'sw', cls: '-bottom-2 -left-2', cursor: 'cursor-nesw-resize' },
  { id: 'se', cls: '-bottom-2 -right-2', cursor: 'cursor-nwse-resize' },
];

interface Drag {
  handle: CropHandle;
  start: CropRect;
  x: number;
  y: number;
}

/** A movable, resizable crop box over a page preview. The parent must be `relative overflow-hidden`. */
export function CropOverlay({ rect, onChange, disabled = false }: { rect: CropRect; onChange: (r: CropRect) => void; disabled?: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  // Each move is computed from the box at pointerdown, so no update depends on a stale render.
  const drag = useRef<Drag | null>(null);

  const down = (handle: CropHandle) => (e: ReactPointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    drag.current = { handle, start: rect, x: e.clientX, y: e.clientY };
    try {
      layer.current?.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone; the drag still ends on pointerup.
    }
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const box = layer.current?.getBoundingClientRect();
    if (!d || !box) return;
    onChange(moveCrop(d.start, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height));
  };
  const up = () => {
    drag.current = null;
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div ref={layer} className="absolute inset-0 touch-none" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div
        data-testid="crop-box"
        onPointerDown={down('move')}
        className={`absolute border-2 border-dashed border-white ${disabled ? '' : 'cursor-move'}`}
        style={{
          left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h),
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)', outline: '1px solid rgba(0, 0, 0, 0.6)',
        }}
      >
        {CORNERS.map((c) => (
          <div
            key={c.id}
            data-testid={`crop-handle-${c.id}`}
            onPointerDown={down(c.id)}
            className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-brand ${c.cls} ${c.cursor}`}
          />
        ))}
      </div>
    </div>
  );
}
