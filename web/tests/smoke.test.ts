import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';

test('pdf-lib works under vitest', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
