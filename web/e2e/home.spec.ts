import { expect, test } from '@playwright/test';

test('home shows hero dropzone and all 14 tools', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'EDIT PDF' })).toBeVisible();
  await expect(page.getByTestId('dropzone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'SELECT PDF FILE' })).toBeVisible();
  await expect(page.getByTestId('tool-tile')).toHaveCount(14);
  await expect(page.getByText('Coming soon')).toHaveCount(11);
});

test('available tiles link to their tool page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Merge PDF' }).click();
  await expect(page).toHaveURL(/\/merge-pdf$/);
});

test('home rejects non-PDF files with an error card', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hi'),
  });
  await expect(page.getByRole('alert').filter({ hasText: "This file type isn't supported" })).toBeVisible();
});
