import { expect, test } from 'vitest';
import { moveItem } from '@/lib/reorder';

test('moves an item and returns a new array', () => {
  const list = ['a', 'b', 'c'];
  expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b']);
  expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
  expect(list).toEqual(['a', 'b', 'c']);
});

test('no-op moves return the same array', () => {
  const list = ['a', 'b'];
  expect(moveItem(list, 1, 1)).toBe(list);
  expect(moveItem(list, 0, -1)).toBe(list);
  expect(moveItem(list, 1, 2)).toBe(list);
});
