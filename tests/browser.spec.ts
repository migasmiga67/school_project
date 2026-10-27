import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';

type Snapshot = {
  state: GameState;
  started: boolean;
  paused: boolean;
  cameraMode?: number;
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);
}

async function start(page: Page) {
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await expect.poll(async () => (await snapshot(page)).started).toBe(true);
}

const moved = (a: GameState['player'], b: GameState['player']) => Math.hypot(a.x - b.x, a.z - b.z);

test('produkcyjna gra renderuje miasto i HUD bez brakujących zasobów', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await start(page);
  await expect(page.locator('#speed')).toBeVisible();
  await expect(page.locator('#money')).toBeVisible();
  await expect(page.locator('#mission-title')).toHaveText(/\S/);
  await expect(page.locator('#mission-instruction')).toHaveText(/\S/);
  await expect(page.locator('#wanted')).toBeVisible();
  await page.waitForTimeout(400);
  const state = (await snapshot(page)).state;
  expect(state.player.mode).toBe('drive');
  expect(state.vehicles.length).toBeGreaterThan(4);
  expect(state.mission.active).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('neon-coast-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('neon-coast-1280.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('samochód przyspiesza przez klawiaturę i zmienia pozycję', async ({ page }) => {
  await start(page);
  const before = (await snapshot(page)).state;
  await page.keyboard.down('w');
  await expect.poll(async () => moved(before.player, (await snapshot(page)).state.player)).toBeGreaterThan(2);
  await page.keyboard.up('w');
  const after = (await snapshot(page)).state;
  expect(moved(before.player, after.player)).toBeGreaterThan(1.5);
  const vehicle = after.vehicles.find(item => item.id === after.player.vehicleId);
  expect(vehicle?.speed).toBeGreaterThan(2);
  await expect.poll(async () => Number((await page.locator('#speed').innerText()).replace(/[^0-9.]/g, ''))).toBeGreaterThan(0);
});

test('można wysiąść, przejść pieszo i ponownie wejść do pobliskiego auta', async ({ page }) => {
  await start(page);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  const before = (await snapshot(page)).state.player;
  await page.keyboard.down('w');
  await expect.poll(async () => moved(before, (await snapshot(page)).state.player), { intervals: [50, 100] }).toBeGreaterThan(0.3);
  await page.keyboard.up('w');
  const after = (await snapshot(page)).state.player;
  expect(moved(before, after)).toBeGreaterThan(0.2);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('drive');
});

test('pauza zatrzymuje symulację i pozwala wznowić jazdę', async ({ page }) => {
  await start(page);
  await page.keyboard.press('p');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  const before = (await snapshot(page)).state;
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  const during = (await snapshot(page)).state;
  expect(moved(before.player, during.player)).toBeLessThan(0.001);
  expect(during.time).toBe(before.time);
  await page.keyboard.press('p');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await page.keyboard.down('w');
  await expect.poll(async () => moved(during.player, (await snapshot(page)).state.player)).toBeGreaterThan(0.6);
  await page.keyboard.up('w');
  expect(moved(during.player, (await snapshot(page)).state.player)).toBeGreaterThan(0.5);
});

test('kamera reaguje na sterowanie, a ustawienie dźwięku pozostaje po reloadzie', async ({ page }) => {
  await start(page);
  const previous = (await snapshot(page)).cameraMode;
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).cameraMode).not.toBe(previous);
  const sound = page.locator('#sound');
  const oldValue = await sound.getAttribute('aria-pressed');
  expect(oldValue).toMatch(/^(true|false)$/);
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', oldValue === 'true' ? 'false' : 'true');
  const selected = await sound.getAttribute('aria-pressed');
  await page.reload();
  await expect(page.locator('#world canvas')).toBeVisible();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', selected!);
});
