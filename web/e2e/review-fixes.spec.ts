import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { alertWith, pdfUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

test('rotate-all works before every thumbnail has rendered', async ({ page }) => {
  await page.goto('/rotate-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('big.pdf', 120)]);
  // No waiting for thumbnails: the click must not be lost or reset when rendering finishes.
  await page.getByRole('button', { name: 'Rotate all right' }).click();
  await page.getByRole('button', { name: 'ROTATE PDF' }).click({ timeout: 5_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const doc = await PDFDocument.load(await readDownload(await downloadPromise));
  expect(doc.getPages().every((p) => p.getRotation().angle === 90)).toBe(true);
});

test('merge controls are locked while merging', async ({ page }) => {
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('a.pdf', 600), await pdfUpload('b.pdf', 600)]);
  await expect(page.getByTestId('merge-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'MERGE PDF' }).click();
  await expect(page.getByRole('button', { name: '+ Add more PDFs' })).toBeDisabled({ timeout: 1_000 });
});

test('shows a checking state while a selected file is validated', async ({ page }) => {
  await page.goto('/split-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('big.pdf', 1500)]);
  await expect(page.getByRole('status').filter({ hasText: 'Checking file…' })).toBeVisible({ timeout: 1_000 });
});

test('worker that fails to load asks for a reload, not "too large"', async ({ page }) => {
  // Simulates a stale tab after a redeploy: the hashed worker chunk 404s.
  await page.addInitScript(() => {
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(_url: string | URL, opts?: WorkerOptions) {
        super('/__missing_worker__.js', opts);
      }
    };
  });
  await page.goto('/merge-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('a.pdf', 1)]);
  await expect(alertWith(page, 'Reload the page')).toBeVisible();
});

test('dropping a file outside the drop zone does not navigate away', async ({ page }) => {
  await page.goto('/merge-pdf');
  // Listeners attach after hydration, so retry until they are in place.
  await expect.poll(() => page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.pdf', { type: 'application/pdf' }));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    document.body.dispatchEvent(over);
    document.body.dispatchEvent(drop);
    return over.defaultPrevented && drop.defaultPrevented;
  })).toBe(true);
});
