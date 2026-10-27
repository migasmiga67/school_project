import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.NEON_BASE_URL || 'http://127.0.0.1:5185/school_project/';
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server', '--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.NEON_BASE_URL ? undefined : {
    command: 'node scripts/serve-dist.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
