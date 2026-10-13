import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { pdfUpload, readDownload } from './fixtures';

test('rotate one page and then all pages', async ({ page }) => {
  await page.goto('/rotate-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('scan.pdf', 3)]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(3);

  await expect(page.getByRole('button', { name: 'ROTATE PDF' })).toBeDisabled();
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate all right' }).click();
  await page.getByRole('button', { name: 'ROTATE PDF' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scan-rotated.pdf');

  const doc = await PDFDocument.load(await readDownload(download));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 180, 90]);
});

test('rotate all left yields 270', async ({ page }) => {
  await page.goto('/rotate-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('s.pdf', 2)]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(2);
  await page.getByRole('button', { name: 'Rotate all left' }).click();
  await page.getByRole('button', { name: 'ROTATE PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const doc = await PDFDocument.load(await readDownload(await downloadPromise));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([270, 270]);
});
