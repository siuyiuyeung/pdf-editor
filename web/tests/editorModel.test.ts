import { expect, test } from 'vitest';
import {
  bounds,
  editorReducer,
  initialEditorState,
  newId,
  penPath,
  resize,
  translate,
  withStyle,
  type EditObject,
  type EditorAction,
  type EditorState,
} from '@/lib/editor/model';

const rect: EditObject = { id: 'r', page: 0, type: 'rect', x: 10, y: 20, w: 30, h: 40, color: '#000000', strokeWidth: 2 };
const line: EditObject = { id: 'l', page: 0, type: 'line', x1: 50, y1: 10, x2: 10, y2: 30, color: '#000000', strokeWidth: 1 };
const pen: EditObject = { id: 'p', page: 0, type: 'pen', points: [0, 0, 10, 20, 4, 8], color: '#000000', strokeWidth: 1 };
const text: EditObject = { id: 't', page: 0, type: 'text', x: 5, y: 6, text: 'a\nbb', font: 'Helvetica', size: 10, color: '#000000' };
const image: EditObject = { id: 'i', page: 0, type: 'image', x: 0, y: 0, w: 1, h: 1, imageId: 'img' };
const textWidth = () => 25;

const run = (actions: EditorAction[], from: EditorState = initialEditorState) => actions.reduce(editorReducer, from);

test('bounds per object type', () => {
  expect(bounds(rect, textWidth)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  expect(bounds(line, textWidth)).toEqual({ x: 10, y: 10, w: 40, h: 20 });
  expect(bounds(pen, textWidth)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  expect(bounds(text, textWidth)).toEqual({ x: 5, y: 6, w: 25, h: 24 }); // 2 lines × 10 pt × 1.2
});

test('translate moves every point', () => {
  expect(translate(line, 1, 2)).toMatchObject({ x1: 51, y1: 12, x2: 11, y2: 32 });
  expect(translate(pen, 1, 2)).toMatchObject({ points: [1, 2, 11, 22, 5, 10] });
  expect(translate(rect, -10, 5)).toMatchObject({ x: 0, y: 25, w: 30, h: 40 });
  expect(translate(text, 1, 1)).toMatchObject({ x: 6, y: 7 });
});

test('resize maps an object from one box into another; text is not resizable', () => {
  expect(resize(rect, bounds(rect, textWidth), { x: 0, y: 0, w: 60, h: 20 })).toMatchObject({ x: 0, y: 0, w: 60, h: 20 });
  expect(resize(line, { x: 10, y: 10, w: 40, h: 20 }, { x: 10, y: 10, w: 80, h: 40 })).toMatchObject({
    x1: 90, y1: 10, x2: 10, y2: 50,
  });
  expect(resize(pen, { x: 0, y: 0, w: 10, h: 20 }, { x: 0, y: 0, w: 20, h: 20 })).toMatchObject({ points: [0, 0, 20, 20, 8, 8] });
  expect(resize(text, bounds(text, textWidth), { x: 0, y: 0, w: 99, h: 99 })).toBe(text);
});

test('withStyle only touches applicable fields and keeps identity when nothing applies', () => {
  expect(withStyle(rect, { color: '#ff0000', strokeWidth: 4, size: 30 })).toMatchObject({ color: '#ff0000', strokeWidth: 4 });
  expect(withStyle(text, { font: 'Courier', size: 20, strokeWidth: 8 })).toMatchObject({ font: 'Courier', size: 20, color: '#000000' });
  expect(withStyle(text, { strokeWidth: 8 })).toBe(text);
  expect(withStyle(image, { color: '#ff0000' })).toBe(image);
});

test('penPath', () => {
  expect(penPath([1, 2, 3, 4])).toBe('M 1 2 L 3 4');
  expect(penPath([5, 6])).toBe('M 5 6 L 5 6');
});

test('newId is unique', () => {
  expect(new Set(Array.from({ length: 1000 }, newId)).size).toBe(1000);
});

test('add selects the object and is one undo step', () => {
  const s = run([{ type: 'add', object: rect }]);
  expect(s.objects).toEqual([rect]);
  expect(s.selectedId).toBe('r');
  const undone = editorReducer(s, { type: 'undo' });
  expect(undone.objects).toEqual([]);
  expect(undone.selectedId).toBeNull();
  expect(editorReducer(undone, { type: 'redo' }).objects).toEqual([rect]);
});

test('a drag (begin, many changes, end) is a single undo step', () => {
  const s = run([
    { type: 'add', object: rect },
    { type: 'begin' },
    { type: 'change', id: 'r', object: translate(rect, 1, 0) },
    { type: 'change', id: 'r', object: translate(rect, 2, 0) },
    { type: 'change', id: 'r', object: translate(rect, 3, 0) },
    { type: 'end' },
  ]);
  expect(s.objects[0]).toMatchObject({ x: 13 });
  expect(s.past).toHaveLength(2);
  expect(editorReducer(s, { type: 'undo' }).objects[0]).toMatchObject({ x: 10 });
});

test('begin and end without a change add no history', () => {
  const s = run([{ type: 'add', object: rect }, { type: 'begin' }, { type: 'end' }]);
  expect(s.past).toHaveLength(1);
  expect(s.gestureStart).toBeNull();
});

test('a change outside a gesture is its own step and clears redo', () => {
  const s = run([{ type: 'add', object: rect }, { type: 'add', object: line }, { type: 'undo' }]);
  expect(s.future).toHaveLength(1);
  const changed = editorReducer(s, { type: 'change', id: 'r', object: { ...rect, color: '#ff0000' } });
  expect(changed.past).toHaveLength(2);
  expect(changed.future).toEqual([]);
});

test('remove clears the selection; undo brings the object back', () => {
  const s = run([{ type: 'add', object: rect }, { type: 'remove', id: 'r' }]);
  expect(s.objects).toEqual([]);
  expect(s.selectedId).toBeNull();
  expect(editorReducer(s, { type: 'undo' }).objects).toEqual([rect]);
  expect(editorReducer(s, { type: 'remove', id: 'nope' })).toBe(s);
});

test('undo is ignored mid-gesture and when there is nothing to undo', () => {
  expect(editorReducer(initialEditorState, { type: 'undo' })).toBe(initialEditorState);
  expect(editorReducer(initialEditorState, { type: 'redo' })).toBe(initialEditorState);
  const mid = run([{ type: 'add', object: rect }, { type: 'begin' }]);
  expect(editorReducer(mid, { type: 'undo' })).toBe(mid);
});

test('history keeps the last 100 steps', () => {
  let s = initialEditorState;
  for (let i = 0; i < 105; i++) s = editorReducer(s, { type: 'add', object: { ...rect, id: `r${i}` } });
  expect(s.past).toHaveLength(100);
});

test('coalesced text changes are one undo step until another action happens', () => {
  const s = run([
    { type: 'add', object: text },
    { type: 'change', id: 't', object: { ...text, text: 'H' }, coalesce: true },
    { type: 'change', id: 't', object: { ...text, text: 'He' }, coalesce: true },
    { type: 'change', id: 't', object: { ...text, text: 'Hey' }, coalesce: true },
  ]);
  expect(s.past).toHaveLength(2);
  expect(editorReducer(s, { type: 'undo' }).objects[0]).toMatchObject({ text: 'a' + String.fromCharCode(10) + 'bb' });
  const after = run([{ type: 'select', id: null }, { type: 'change', id: 't', object: { ...text, text: 'Hey!' }, coalesce: true }], s);
  expect(after.past).toHaveLength(3);
});

test('a drag after a typing session is still one undo step', () => {
  const s = run([
    { type: 'add', object: text },
    { type: 'change', id: 't', object: { ...text, text: 'Hi' }, coalesce: true },
    { type: 'begin' },
    { type: 'change', id: 't', object: translate({ ...text, text: 'Hi' }, 5, 0) },
    { type: 'change', id: 't', object: translate({ ...text, text: 'Hi' }, 9, 0) },
    { type: 'end' },
  ]);
  expect(s.past).toHaveLength(3);
  expect(editorReducer(s, { type: 'undo' }).objects[0]).toMatchObject({ x: 5, text: 'Hi' });
});

test('moving the selection away from an empty text box removes it', () => {
  const empty = run([{ type: 'add', object: rect }, { type: 'add', object: { ...text, text: '  ' } }]);
  expect(editorReducer(empty, { type: 'select', id: null }).objects).toEqual([rect]);
  expect(editorReducer(empty, { type: 'select', id: 'r' }).objects).toEqual([rect]);
  expect(editorReducer(empty, { type: 'add', object: line }).objects).toEqual([rect, line]);
  const kept = run([{ type: 'add', object: text }, { type: 'select', id: null }]);
  expect(kept.objects).toEqual([text]);
});
