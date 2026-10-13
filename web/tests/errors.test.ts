import { expect, test } from 'vitest';
import { ERROR_MESSAGES, PdfToolError, toToolError } from '@/lib/pdf/errors';

test('toToolError passes PdfToolError through', () => {
  const e = new PdfToolError('BAD_OPTIONS', 'nope');
  expect(toToolError(e)).toBe(e);
});

test('toToolError maps RangeError (allocation failure) to OUT_OF_MEMORY', () => {
  expect(toToolError(new RangeError('Array buffer allocation failed')).code).toBe('OUT_OF_MEMORY');
});

test('toToolError maps anything else to UNKNOWN', () => {
  expect(toToolError(new Error('boom')).code).toBe('UNKNOWN');
  expect(toToolError('weird').code).toBe('UNKNOWN');
});

test('spec-mandated copy', () => {
  expect(ERROR_MESSAGES.INVALID_FILE).toBe("This file isn't a valid PDF");
  expect(ERROR_MESSAGES.ENCRYPTED).toBe('Protected PDF — remove the password first');
});

test('INVALID_IMAGE copy', () => {
  expect(ERROR_MESSAGES.INVALID_IMAGE).toBe("This file isn't a valid JPG or PNG image");
});
