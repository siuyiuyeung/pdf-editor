import { describe, expect, test } from 'vitest';
import { parseRanges } from '@/lib/pdf/ranges';

describe('parseRanges', () => {
  test('parses single pages and ranges into 0-based groups', () => {
    expect(parseRanges('1-3,5', 5)).toEqual([[0, 1, 2], [4]]);
  });

  test('tolerates whitespace and trailing commas', () => {
    expect(parseRanges(' 2 - 3 , 1 ,', 4)).toEqual([[1, 2], [0]]);
  });

  test.each([
    ['', /at least one/],
    ['   ', /at least one/],
    ['0', /"0" is outside 1-5/],
    ['6', /"6" is outside 1-5/],
    ['2-9', /"2-9" is outside 1-5/],
    ['5-3', /"5-3" ends before it starts/],
    ['a-b', /"a-b" isn't a valid range/],
    ['1-2-3', /"1-2-3" isn't a valid range/],
  ])('rejects %j', (spec, message) => {
    expect(() => parseRanges(spec, 5)).toThrow(message);
    try {
      parseRanges(spec, 5);
    } catch (e) {
      expect((e as { code: string }).code).toBe('BAD_OPTIONS');
    }
  });
});
