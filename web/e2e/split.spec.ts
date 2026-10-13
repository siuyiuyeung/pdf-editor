import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { alertWith, pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('split by ranges into a zip', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 5)]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(5);

  await page.getByLabel('Ranges', { exact: true }).fill('1-2, 4');
  await page.getByRole('button', { name: 'SPLIT PDF' }).click();
  await expect(page.getByTestId('result')).toContainText('doc-part-2.pdf');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD ZIP' }).click();
  const zip = await JSZip.loadAsync(await readDownload(await downloadPromise));
  expect(Object.keys(zip.files).sort()).toEqual(['doc-part-1.pdf', 'doc-part-2.pdf']);
  const part1 = await PDFDocument.load(await zip.file('doc-part-1.pdf')!.async('uint8array'));
  expect(part1.getPageCount()).toBe(2);
});

test('bad ranges show an error and keep the input', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 5)]);
  await page.getByLabel('Ranges', { exact: true }).fill('5-3');
  await page.getByRole('button', { name: 'SPLIT PDF' }).click();
  await expect(alertWith(page, '"5-3" ends before it starts')).toBeVisible();
  await expect(page.getByLabel('Ranges', { exact: true })).toHaveValue('5-3');
  await expect(page.getByTestId('page-thumb')).toHaveCount(5);
});

test('select pages extracts a single PDF', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 4)]);
  await page.getByLabel('Select pages').check();
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await page.getByRole('button', { name: 'SPLIT PDF' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-extracted.pdf');
  expect((await PDFDocument.load(await readDownload(download))).getPageCount()).toBe(2);
});

test('merge output handed to split via "Use in another tool"', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('a.pdf', 2), await pdfUpload('b.pdf', 3)]);
  await page.getByRole('button', { name: 'MERGE PDF' }).click();
  await page.getByRole('button', { name: 'Use in another tool' }).click();
  await expect(page.getByTestId('home-ready')).toContainText('1 PDF ready');
  await page.getByRole('link', { name: 'Split PDF' }).click();
  await expect(page.getByTestId('page-thumb')).toHaveCount(5);
});
