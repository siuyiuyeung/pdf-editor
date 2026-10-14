'use client';

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { moveCrop, type CropHandle } from '@/lib/cropRect';
import type { CropRect } from '@/lib/pdf/crop';

const CORNERS: { id: Exclude<CropHandle, 'move'>; cls: string; cursor: string; label: string }[] = [
  { id: 'nw', cls: '-left-2 -top-2', cursor: 'cursor-nwse-resize', label: 'Resize crop from top-left corner' },
  { id: 'ne', cls: '-right-2 -top-2', cursor: 'cursor-nesw-resize', label: 'Resize crop from top-right corner' },
  { id: 'sw', cls: '-bottom-2 -left-2', cursor: 'cursor-nesw-resize', label: 'Resize crop from bottom-left corner' },
  { id: 'se', cls: '-bottom-2 -right-2', cursor: 'cursor-nwse-resize', label: 'Resize crop from bottom-right corner' },
];

/** Arrow keys nudge by 1% of the page; with Shift, by 5%. */
const KEY_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

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
  const key = (handle: CropHandle) => (e: ReactKeyboardEvent) => {
    const step = KEY_STEPS[e.key];
    if (disabled || !step) return;
    e.preventDefault();
    e.stopPropagation();
    const size = e.shiftKey ? 0.05 : 0.01;
    onChange(moveCrop(rect, handle, step[0] * size, step[1] * size));
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div ref={layer} className="absolute inset-0 touch-none" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div
        data-testid="crop-box"
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label="Crop area. Use the arrow keys to move it; hold Shift for bigger steps."
        onPointerDown={down('move')}
        onKeyDown={key('move')}
        className={`absolute border-2 border-dashed border-white focus-visible:border-solid focus-visible:border-yellow-300 ${disabled ? '' : 'cursor-move'}`}
        style={{
          left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h),
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)', outline: '1px solid rgba(0, 0, 0, 0.6)',
        }}
      >
        {CORNERS.map((c) => (
          <div
            key={c.id}
            data-testid={`crop-handle-${c.id}`}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${c.label} (arrow keys)`}
            onPointerDown={down(c.id)}
            onKeyDown={key(c.id)}
            className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-brand focus-visible:ring-2 focus-visible:ring-yellow-300 ${c.cls} ${c.cursor}`}
          />
        ))}
      </div>
    </div>
  );
}
