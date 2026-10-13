import { expect, test, type Page } from '@playwright/test';
import { pdfUpload } from './fixtures';

// The editor page renders ~960 px tall; keep every click point inside the viewport.
test.use({ viewport: { width: 1280, height: 1600 } });

async function openEditor(page: Page) {
  await page.goto('/edit-pdf');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles([await pdfUpload('doc.pdf', 1, [400, 500])]);
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  return (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;
}

async function placeText(page: Page, at: (fx: number, fy: number) => readonly [number, number]) {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.mouse.click(...at(0.1, 0.1));
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
}

test('typing then clicking away keeps undo working', async ({ page }) => {
  const at = await openEditor(page);
  await placeText(page, at);
  await page.getByLabel('Text content').fill('Hello');
  await page.mouse.click(...at(0.6, 0.8));
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('editor-object')).toContainText('Text');
});

test('dragging an unselected text box is a single undo step', async ({ page }) => {
  const at = await openEditor(page);
  await placeText(page, at);
  await page.mouse.click(...at(0.6, 0.8));
  const obj = page.getByTestId('editor-object');
  const before = (await obj.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 60, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => (await obj.boundingBox())!.x - before.x).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => Math.abs((await obj.boundingBox())!.x - before.x)).toBeLessThan(2);
});

test('an emptied text box disappears when you click away', async ({ page }) => {
  const at = await openEditor(page);
  await placeText(page, at);
  await page.getByLabel('Text content').fill('');
  await page.mouse.click(...at(0.6, 0.8));
  await expect(page.getByTestId('editor-object')).toHaveCount(0);
});

test('typing right after placing text goes into the new text box', async ({ page }) => {
  const at = await openEditor(page);
  await placeText(page, at);
  await expect(page.getByLabel('Text content')).toBeFocused();
  await page.keyboard.type('Hi');
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
  await expect(page.getByTestId('editor-object')).toContainText('Hi');
});

test('a fast drag still adds the shape', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Rectangle' }).click();
  // Down, one move and up inside a single task: React has no chance to re-render in between.
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid=editor-canvas]')!;
    const r = svg.getBoundingClientRect();
    const fire = (type: string, fx: number, fy: number) =>
      svg.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1,
          clientX: r.left + r.width * fx, clientY: r.top + r.height * fy,
        }),
      );
    fire('pointerdown', 0.1, 0.1);
    fire('pointermove', 0.3, 0.2);
    fire('pointerup', 0.4, 0.3);
  });
  await expect(page.getByTestId('editor-object')).toHaveCount(1);
});

test('whiteout is explained as covering, not redaction', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByText('Whiteout only hides content visually')).toBeVisible();
});
