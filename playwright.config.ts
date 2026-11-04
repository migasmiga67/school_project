import { existsSync } from 'node:fs';
import { defineConfig, type ReporterDescription } from '@playwright/test';

const baseURL = process.env.NEON_BASE_URL || 'http://127.0.0.1:5185/school_project/';
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const reporters: ReporterDescription[] = [['list'], ['html', { open: 'never' }]];
if (process.env.GITHUB_ACTIONS) reporters.push(['github']);

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser.spec.ts', 'casino.browser.spec.ts', 'multiplayer.browser.spec.ts', 'expansion.browser.spec.ts','career.browser.spec.ts','tournament.browser.spec.ts','stories.browser.spec.ts','mobility.browser.spec.ts','expanded-world.browser.spec.ts','city-design.browser.spec.ts','graphics.browser.spec.ts'],
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
    // Continuous screencast capture stalls software WebGL during frequent polls.
    // Keep DOM/API/network diagnostics and explicit/failure screenshots.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
  },
  webServer: process.env.NEON_BASE_URL ? undefined : [{
    command: 'node scripts/serve-dist.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  }, {
    command: 'node scripts/serve-peers.mjs',
    url: 'http://127.0.0.1:9000/peerjs',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  }, {
    command: 'node scripts/serve-turn.mjs',
    url: 'http://127.0.0.1:9002/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  }],
  reporter: reporters,
});
