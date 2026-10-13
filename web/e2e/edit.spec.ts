import { expect, test, type Page } from '@playwright/test';
import { imageCounts, pageText } from '../tests/helpers';
import { pdfUpload, pngUpload, readDownload } from './fixtures';

const fileInput = (page: Page) => page.getByTestId('dropzone').locator('input[type=file]');

// The editor page renders ~960 px tall; keep every click point inside the viewport.
test.use({ viewport: { width: 1280, height: 1600 } });

async function openEditor(page: Page) {
  await page.goto('/edit-pdf');
  await fileInput(page).setInputFiles([await pdfUpload('doc.pdf', 1, [400, 500])]);
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  return (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;
}

async function drag(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 5 });
  await page.mouse.up();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'SAVE PDF' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doc-edited.pdf');
  return new Uint8Array(await readDownload(download));
}

test('draw a rectangle, add text, undo and redo, then save', async ({ page }) => {
  const at = await openEditor(page);
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await drag(page, at(0.1, 0.1), at(0.4, 0.3));
  await expect(page.getByTestId('editor-object')).toHaveCount(1);

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.mouse.click(...at(0.1, 0.6));
  await expect(page.getByTestId('editor-object')).toHaveCount(2);
  await page.getByLabel('Text content').fill('Hello PDF');

  await page.getByRole('button', { name: 'Undo' }).click(); // reverts the typing
  await page.getByRole('button', { name: 'Undo' }).click(); // removes the text box
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByTestId('editor-object')).toHaveCount(2);

  const pdf = await save(page);
  expect((await pageText(pdf))[0].map((t) => t.str)).toContain('Hello PDF');
});

test('select and drag moves a shape', async ({ page }) => {
  const at = await openEditor(page);
  await page.getByRole('button', { name: 'Whiteout' }).click();
  await drag(page, at(0.2, 0.2), at(0.4, 0.3));
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const shape = page.getByTestId('editor-object');
  const before = (await shape.boundingBox())!;
  await drag(page, at(0.3, 0.25), at(0.5, 0.45));
  // Pointer moves render at React's continuous priority, so poll rather than read once.
  await expect.poll(async () => (await shape.boundingBox())!.x - before.x).toBeGreaterThan(10);
  await expect.poll(async () => (await shape.boundingBox())!.y - before.y).toBeGreaterThan(10);
});

test('an inserted image is embedded on save', async ({ page }) => {
  await openEditor(page);
  await page.getByTestId('insert-image-input').setInputFiles(pngUpload('logo.png', 80, 40));
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
  expect(await imageCounts(await save(page))).toEqual([1]);
});
