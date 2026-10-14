import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { pdfUpload, readDownload } from './fixtures';

// The page preview renders ~960 px tall; keep the crop handles inside the viewport.
test.use({ viewport: { width: 1280, height: 1600 } });

async function open(page: Page, pages: number) {
  await page.goto('/crop-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('doc.pdf', pages, [400, 500])]);
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

async function cropBoxes(page: Page) {
  await page.getByRole('button', { name: 'CROP PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-cropped.pdf');
  const doc = await PDFDocument.load(await readDownload(download));
  return doc.getPages().map((p) => Math.round(p.getCropBox().width));
}

test('default box crops every page', async ({ page }) => {
  await open(page, 2);
  expect(await cropBoxes(page)).toEqual([320, 320]);
});

test('dragging a corner and cropping only the current page', async ({ page }) => {
  await open(page, 2);
  await page.getByRole('button', { name: 'Next page' }).click();
  const handle = page.getByTestId('crop-handle-nw');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 100, h.y + h.height / 2 + 50, { steps: 5 });
  await page.mouse.up();
  await page.getByLabel('Crop this page only').check();
  const [first, second] = await cropBoxes(page);
  expect(first).toBe(400);
  expect(second).toBeLessThan(300);
});
