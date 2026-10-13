import { expect, test } from 'vitest';
import { clearHandoff, peekHandoff, setHandoff, takeHandoff } from '@/lib/handoff';

test('peek keeps, take consumes, clear empties', () => {
  const files = [{ name: 'a.pdf', bytes: new Uint8Array([1]) }];
  setHandoff(files);
  expect(peekHandoff()).toBe(files);
  expect(takeHandoff()).toBe(files);
  expect(takeHandoff()).toBeNull();
  setHandoff(files);
  clearHandoff();
  expect(peekHandoff()).toBeNull();
});
