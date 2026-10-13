import { expect, test, type Page } from '@playwright/test';
import { imageCounts, pageText } from '../tests/helpers';
import { pdfUpload, pngUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

async function downloadResult(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  return downloadPromise;
}

test('text watermark on every page', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2)]);
  await page.getByLabel('Watermark text').fill('TOP SECRET');
  await page.getByLabel('Font size').fill('24');
  await page.getByLabel('Rotation').selectOption('0');
  await page.getByRole('button', { name: 'ADD WATERMARK' }).click();

  const download = await downloadResult(page);
  expect(download.suggestedFilename()).toBe('doc-watermarked.pdf');
  const pages = await pageText(new Uint8Array(await readDownload(download)));
  expect(pages.map((items) => items.some((t) => t.str === 'TOP SECRET'))).toEqual([true, true]);
});

test('image watermark on selected pages only', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2)]);
  await page.getByLabel('Image', { exact: true }).check();
  await page.getByLabel('Watermark image').setInputFiles(pngUpload('logo.png', 60, 30));
  await expect(page.getByText('logo.png')).toBeVisible();
  await page.getByLabel('Pages', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'ADD WATERMARK' }).click();

  const download = await downloadResult(page);
  expect(await imageCounts(new Uint8Array(await readDownload(download)))).toEqual([0, 1]);
});

test('a non-image picked as the watermark image shows an error', async ({ page }) => {
  await page.goto('/watermark-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1)]);
  await page.getByLabel('Image', { exact: true }).check();
  await page.getByLabel('Watermark image').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
  await expect(page.getByRole('alert').filter({ hasText: "This file isn't a valid JPG or PNG image" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ADD WATERMARK' })).toBeDisabled();
});
