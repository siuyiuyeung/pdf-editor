import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { alertWith, bigPdfUpload, pdfUpload, readDownload } from '../fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');
const fixture = async (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: await readFile(path.join(__dirname, 'fixtures', name)),
});

async function download(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  return downloadPromise;
}

test('compress a 12 MB PDF through the /api proxy', async ({ page }) => {
  await page.goto('/compress-pdf');
  await fileInput(page).setInputFiles([await bigPdfUpload('big.pdf', 12)]);
  await page.getByLabel('High compression').check();
  await page.getByRole('button', { name: 'COMPRESS PDF' }).click();
  const note = page.getByTestId('result-note');
  await expect(note).toContainText(/Reduced from 12\.0 MB|already well compressed/, { timeout: 120_000 });
  await expect(note).toContainText('deleted from our server');
  const d = await download(page);
  expect(d.suggestedFilename()).toBe('big-compressed.pdf');
  expect((await PDFDocument.load(await readDownload(d))).getPageCount()).toBe(1);
});

const OFFICE = [
  ['word-to-pdf', 'sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1],
  ['excel-to-pdf', 'sample.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1],
  ['powerpoint-to-pdf', 'sample.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 2],
] as const;

for (const [slug, file, mime, pages] of OFFICE) {
  test(`${slug} converts ${file}`, async ({ page }) => {
    await page.goto(`/${slug}`);
    await fileInput(page).setInputFiles([await fixture(file, mime)]);
    await page.getByRole('button', { name: 'CONVERT TO PDF' }).click();
    const d = await download(page);
    expect(d.suggestedFilename()).toBe('sample.pdf');
    expect((await PDFDocument.load(await readDownload(d))).getPageCount()).toBe(pages);
  });
}

test('PDF to Word produces an editable DOCX', async ({ page }) => {
  await page.goto('/pdf-to-word');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1)]);
  await expect(page.getByText('Complex layouts')).toBeVisible();
  await page.getByRole('button', { name: 'CONVERT TO WORD' }).click();
  const d = await download(page);
  expect(d.suggestedFilename()).toBe('doc.docx');
  const zip = await JSZip.loadAsync(await readDownload(d));
  expect(await zip.file('word/document.xml')!.async('string')).toContain('Page 1');
});

test('a text file renamed to .docx is rejected before upload', async ({ page }) => {
  await page.goto('/word-to-pdf');
  await fileInput(page).setInputFiles([{ name: 'fake.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a document') }]);
  await expect(alertWith(page, "This file isn't a valid Word, Excel or PowerPoint file")).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
});
