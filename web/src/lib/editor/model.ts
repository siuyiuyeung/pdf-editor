/** The 12 standard-14 PDF fonts that render Latin text (Symbol and ZapfDingbats are left out). */
export const STANDARD_FONTS = [
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
] as const;
export type FontName = (typeof STANDARD_FONTS)[number];

/**
 * The first text baseline sits TEXT_BASELINE font sizes below the text box top, and lines are
 * LINE_HEIGHT font sizes apart. Shared by the SVG view and the PDF export so text lands where it was placed.
 */
export const TEXT_BASELINE = 0.8;
export const LINE_HEIGHT = 1.2;
export const HIGHLIGHT_OPACITY = 0.4;
export const HIGHLIGHT_COLOR = '#ffe600';

export interface DrawStyle {
  color: string;
  strokeWidth: number;
  font: FontName;
  size: number;
}

export const DEFAULT_STYLE: DrawStyle = { color: '#e5322d', strokeWidth: 2, font: 'Helvetica', size: 16 };

// All coordinates are view space: points, origin at the top-left of the page as displayed, y down.
interface Base {
  id: string;
  /** 0-based page index. */
  page: number;
}
export interface TextObject extends Base {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font: FontName;
  size: number;
  color: string;
}
export interface BoxObject extends Base {
  type: 'rect' | 'ellipse' | 'highlight' | 'whiteout';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
}
export interface LineObject extends Base {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}
export interface PenObject extends Base {
  type: 'pen';
  /** Flat [x0, y0, x1, y1, …]. */
  points: number[];
  color: string;
  strokeWidth: number;
}
export interface ImageObject extends Base {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  imageId: string;
}
export type EditObject = TextObject | BoxObject | LineObject | PenObject | ImageObject;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let counter = 0;
/** Unique within the tab. Avoids crypto.randomUUID, which needs a secure context (plain-HTTP LAN access). */
export function newId(): string {
  counter += 1;
  return `o${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Bounding box in view space. Text needs a measurer because its width depends on the font. */
export function bounds(o: EditObject, textWidth: (t: TextObject) => number): Rect {
  switch (o.type) {
    case 'text':
      return { x: o.x, y: o.y, w: textWidth(o), h: o.size * LINE_HEIGHT * o.text.split('\n').length };
    case 'line':
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    case 'pen': {
      const xs = o.points.filter((_, i) => i % 2 === 0);
      const ys = o.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    default:
      return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
}

export function translate(o: EditObject, dx: number, dy: number): EditObject {
  switch (o.type) {
    case 'line':
      return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
    case 'pen':
      return { ...o, points: o.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    default:
      return { ...o, x: o.x + dx, y: o.y + dy };
  }
}

/** Scales an object from its old bounding box `from` into `to`. Text is sized by font size instead. */
export function resize(o: EditObject, from: Rect, to: Rect): EditObject {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const mapX = (x: number) => to.x + (x - from.x) * sx;
  const mapY = (y: number) => to.y + (y - from.y) * sy;
  switch (o.type) {
    case 'text':
      return o;
    case 'line':
      return { ...o, x1: mapX(o.x1), y1: mapY(o.y1), x2: mapX(o.x2), y2: mapY(o.y2) };
    case 'pen':
      return { ...o, points: o.points.map((v, i) => (i % 2 === 0 ? mapX(v) : mapY(v))) };
    default:
      return { ...o, x: to.x, y: to.y, w: to.w, h: to.h };
  }
}

/** Applies the style fields that make sense for this object; returns `o` itself when none do. */
export function withStyle(o: EditObject, p: Partial<DrawStyle>): EditObject {
  if (o.type === 'image' || o.type === 'whiteout') return o;
  if (o.type === 'text') {
    if (p.color === undefined && p.font === undefined && p.size === undefined) return o;
    return { ...o, color: p.color ?? o.color, font: p.font ?? o.font, size: p.size ?? o.size };
  }
  if (p.color === undefined && p.strokeWidth === undefined) return o;
  return { ...o, color: p.color ?? o.color, strokeWidth: p.strokeWidth ?? o.strokeWidth };
}

/** SVG path for a pen stroke; a single point becomes a zero-length segment so round caps draw a dot. */
export function penPath(points: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) parts.push(`${i === 0 ? 'M' : 'L'} ${points[i]} ${points[i + 1]}`);
  if (parts.length === 1) parts.push(`L ${points[0]} ${points[1]}`);
  return parts.join(' ');
}

export interface EditorState {
  objects: EditObject[];
  selectedId: string | null;
  past: EditObject[][];
  future: EditObject[][];
  /** Objects as they were when the current gesture began; becomes one history step on 'end'. */
  gestureStart: EditObject[] | null;
  /** Object whose coalesced changes (text typing) are folding into the latest history step. */
  coalesceId: string | null;
}

export const initialEditorState: EditorState = {
  objects: [], selectedId: null, past: [], future: [], gestureStart: null, coalesceId: null,
};

export type EditorAction =
  | { type: 'add'; object: EditObject }
  | { type: 'begin' }
  /**
   * Replaces an object. Inside a gesture: no history step. Otherwise one step — unless `coalesce`
   * is set and the previous action was a coalesced change of the same object (one step per typing session).
   */
  | { type: 'change'; id: string; object: EditObject; coalesce?: boolean }
  | { type: 'end' }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

function pushHistory(past: EditObject[][], snapshot: EditObject[]): EditObject[][] {
  return [...past, snapshot].slice(-HISTORY_LIMIT);
}

function commit(state: EditorState, objects: EditObject[]): EditorState {
  return { ...state, objects, past: pushHistory(state.past, state.objects), future: [] };
}

function keepSelection(objects: EditObject[], id: string | null): string | null {
  return id !== null && objects.some((o) => o.id === id) ? id : null;
}

/** Drops the selected text box when it is empty; called when the selection moves away from it. */
function pruneEmptyText(state: EditorState, keepId: string | null): EditorState {
  const sel = state.objects.find((o) => o.id === state.selectedId);
  if (!sel || sel.id === keepId || sel.type !== 'text' || sel.text.trim()) return state;
  return { ...state, objects: state.objects.filter((o) => o.id !== sel.id), selectedId: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const next = reduce(state, action);
  const coalescing = action.type === 'change' && action.coalesce === true && !state.gestureStart;
  if (coalescing) return { ...next, coalesceId: action.id };
  return next.coalesceId === null ? next : { ...next, coalesceId: null };
}

function reduce(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'add': {
      const base = pruneEmptyText(state, null);
      return { ...commit(base, [...base.objects, action.object]), selectedId: action.object.id };
    }
    case 'begin':
      return state.gestureStart ? state : { ...state, gestureStart: state.objects };
    case 'change': {
      const objects = state.objects.map((o) => (o.id === action.id ? action.object : o));
      if (state.gestureStart) return { ...state, objects };
      if (action.coalesce && state.coalesceId === action.id) return { ...state, objects };
      return commit(state, objects);
    }
    case 'end': {
      if (!state.gestureStart) return state;
      if (state.gestureStart === state.objects) return { ...state, gestureStart: null };
      return { ...state, gestureStart: null, past: pushHistory(state.past, state.gestureStart), future: [] };
    }
    case 'remove': {
      if (!state.objects.some((o) => o.id === action.id)) return state;
      const next = commit(state, state.objects.filter((o) => o.id !== action.id));
      return { ...next, selectedId: state.selectedId === action.id ? null : state.selectedId };
    }
    case 'select':
      return { ...pruneEmptyText(state, action.id), selectedId: action.id };
    case 'undo': {
      if (state.gestureStart || state.past.length === 0) return state;
      const objects = state.past[state.past.length - 1];
      return {
        ...state,
        objects,
        past: state.past.slice(0, -1),
        future: [state.objects, ...state.future],
        selectedId: keepSelection(objects, state.selectedId),
      };
    }
    case 'redo': {
      if (state.gestureStart || state.future.length === 0) return state;
      const [objects, ...future] = state.future;
      return {
        ...state,
        objects,
        past: pushHistory(state.past, state.objects),
        future,
        selectedId: keepSelection(objects, state.selectedId),
      };
    }
  }
}
