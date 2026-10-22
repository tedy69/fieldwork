import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.PLAYWRIGHT_CHROME ? 'chrome' : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'tsx tests/e2e-server.ts',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
