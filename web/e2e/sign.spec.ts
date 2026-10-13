import { expect, test, type Page } from '@playwright/test';
import { imageCounts } from '../tests/helpers';
import { pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('draw a signature, place it on two pages, and sign', async ({ page }) => {
  await page.goto('/sign-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 2, [400, 500])]);
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  const pad = page.getByTestId('signature-pad');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 20, { steps: 5 });
  await page.mouse.move(box.x + 160, box.y + box.height - 20, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Use signature' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(1);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(0);
  await page.getByRole('button', { name: 'Place signature 1' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(1);

  await page.getByRole('button', { name: 'SIGN PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-signed.pdf');
  expect(await imageCounts(new Uint8Array(await readDownload(download)))).toEqual([1, 1]);
});

test('a typed signature can be moved, deleted and restored with undo', async ({ page }) => {
  await page.goto('/sign-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1, [400, 500])]);
  await page.getByRole('tab', { name: 'Type' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Use signature' }).click();

  const placed = page.getByTestId('editor-object');
  await expect(placed).toHaveCount(1);
  const before = (await placed.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + before.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  // Pointer moves render at React's continuous priority, so poll rather than read once.
  await expect.poll(async () => (await placed.boundingBox())!.x - before.x).toBeGreaterThan(30);
  await expect.poll(async () => (await placed.boundingBox())!.y - before.y).toBeGreaterThan(20);

  await page.keyboard.press('Delete');
  await expect(placed).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SIGN PDF' })).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(placed).toHaveCount(1);
});
