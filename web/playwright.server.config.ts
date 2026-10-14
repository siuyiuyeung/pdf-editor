import { defineConfig, devices } from '@playwright/test';

// Server tools need the full Compose stack: run `make test-e2e-server` (or `docker compose up -d --build` first).
export default defineConfig({
  testDir: './e2e/server',
  timeout: 180_000,
  use: { baseURL: process.env.SERVER_BASE_URL ?? 'http://localhost:3000', acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
