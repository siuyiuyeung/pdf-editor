import { expect, test } from '@playwright/test';

test('tool page renders header and current tile', async ({ page }) => {
  await page.goto('/compress-pdf');
  await expect(page.getByRole('heading', { name: 'Compress PDF', level: 1 })).toBeVisible();
  await expect(page.getByText('This tool is coming soon.')).toBeVisible();
  await expect(page.getByTestId('tool-tile')).toHaveCount(14);
});

test('unknown tool slug is a 404', async ({ page }) => {
  const res = await page.goto('/not-a-tool');
  expect(res?.status()).toBe(404);
});
