const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Intentionally no webServer: E2E must use the project already running on port 3001.
});
