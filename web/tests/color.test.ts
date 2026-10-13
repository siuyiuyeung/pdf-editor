import { expect, test } from 'vitest';
import { hexColor } from '@/lib/pdf/color';
import type { PdfToolError } from '@/lib/pdf/errors';

test('hexColor parses #rrggbb in either case', () => {
  expect(hexColor('#FF8000')).toMatchObject({ red: 1, green: 128 / 255, blue: 0 });
  expect(hexColor('#e5322d')).toMatchObject({ red: 229 / 255, green: 50 / 255, blue: 45 / 255 });
});

test('hexColor rejects anything else as BAD_OPTIONS', () => {
  for (const bad of ['red', '#fff', '#12345g', '']) {
    let code: string | undefined;
    try {
      hexColor(bad);
    } catch (e) {
      code = (e as PdfToolError).code;
    }
    expect(code).toBe('BAD_OPTIONS');
  }
});
