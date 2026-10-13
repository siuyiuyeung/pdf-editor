import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readImageInfo } from '../src/lib/image';
import { pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('PDF to JPG: all pages at 150 DPI in a zip', async ({ page }) => {
  await page.goto('/pdf-to-jpg');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2, [200, 300])]);
  await expect(page.getByTestId('page-thumb')).toHaveCount(2);
  await expect(page.getByLabel('150 DPI (standard)')).toBeChecked();

  await page.getByRole('button', { name: 'CONVERT TO JPG' }).click();
  await expect(page.getByTestId('result')).toContainText('doc-page-2.jpg');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD ZIP' }).click();
  const zip = await JSZip.loadAsync(await readDownload(await downloadPromise));
  expect(Object.keys(zip.files).sort()).toEqual(['doc-page-1.jpg', 'doc-page-2.jpg']);
  const info = readImageInfo(await zip.file('doc-page-1.jpg')!.async('uint8array'));
  expect(info).toMatchObject({ type: 'jpg', width: 417, height: 625 });
});

test('PDF to PNG: one selected page at 72 DPI downloads a single image', async ({ page }) => {
  await page.goto('/pdf-to-png');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 3, [200, 300])]);
  await page.getByLabel('72 DPI (screen)').check();
  await page.getByLabel('Select pages').check();
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page.getByRole('button', { name: 'CONVERT TO PNG' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-page-2.png');
  expect(readImageInfo(new Uint8Array(await readDownload(download)))).toMatchObject({ type: 'png', width: 200, height: 300 });
});

test('convert is disabled while "Select pages" has nothing selected', async ({ page }) => {
  await page.goto('/pdf-to-jpg');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2)]);
  await page.getByLabel('Select pages').check();
  await expect(page.getByRole('button', { name: 'CONVERT TO JPG' })).toBeDisabled();
});
