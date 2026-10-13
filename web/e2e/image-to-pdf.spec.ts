import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { alertWith, jpgUpload, pngUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('images become one PDF in the chosen order', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await expect(page.getByRole('button', { name: 'SELECT IMAGES' })).toBeVisible();
  await fileInput(page).setInputFiles([pngUpload('tall.png', 200, 300), jpgUpload('wide.jpg')]);
  await expect(page.getByTestId('image-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Move wide.jpg left' }).click();
  await expect(page.getByTestId('image-item').first()).toContainText('wide.jpg');

  await page.getByRole('button', { name: 'CONVERT TO PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('images.pdf');

  const doc = await PDFDocument.load(await readDownload(download));
  // Defaults are A4 / auto / small margin: the wide image gives a landscape page, the tall one a portrait page.
  expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([842, 595]);
});

test('fit to image without margin makes the page the image size', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await fileInput(page).setInputFiles([pngUpload('logo.png', 400, 200)]);
  await page.getByLabel('Page size').selectOption('fit');
  await page.getByLabel('Margin').selectOption('none');
  await page.getByRole('button', { name: 'CONVERT TO PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('logo.pdf');
  const p = (await PDFDocument.load(await readDownload(download))).getPage(0);
  expect([p.getWidth(), p.getHeight()]).toEqual([300, 150]);
});

test('a text file renamed to .png is rejected at selection', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await fileInput(page).setInputFiles([{ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }]);
  await expect(alertWith(page, "This file isn't a valid JPG or PNG image")).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
});
