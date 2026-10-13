import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { alertWith, encryptedUpload, junkUpload, pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('merge two PDFs after reordering', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('a.pdf', 2, [200, 300]), await pdfUpload('b.pdf', 3, [400, 500])]);
  await expect(page.getByTestId('merge-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Move b.pdf up' }).click();
  await expect(page.getByTestId('merge-item').first()).toContainText('b.pdf');

  await page.getByRole('button', { name: 'MERGE PDF' }).click();
  await expect(page.getByTestId('result')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('merged.pdf');

  const doc = await PDFDocument.load(await readDownload(download));
  expect(doc.getPageCount()).toBe(5);
  expect(doc.getPage(0).getWidth()).toBe(400);
});

test('same file added twice is listed twice and removable independently', async ({ page }) => {
  await page.goto('/merge-pdf');
  const a = await pdfUpload('a.pdf', 1);
  await fileInput(page).setInputFiles([a, a]);
  await expect(page.getByTestId('merge-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove a.pdf' }).first().click();
  await expect(page.getByTestId('merge-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'MERGE PDF' })).toBeDisabled();
});

test('encrypted PDF is rejected at selection', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await encryptedUpload('locked.pdf')]);
  await expect(alertWith(page, 'Protected PDF — remove the password first')).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
});

test('non-PDF bytes named .pdf are rejected at selection', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([junkUpload('fake.pdf')]);
  await expect(alertWith(page, "This file isn't a valid PDF")).toBeVisible();
});

test('wrong extension is rejected', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await expect(alertWith(page, "This file type isn't supported")).toBeVisible();
});
