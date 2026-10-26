import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.GRID_BASE_URL || 'http://127.0.0.1:5174';
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1100 },
    headless: true,
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.GRID_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: 'list',
});
