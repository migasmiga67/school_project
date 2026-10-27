import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';

type Snapshot = {
  state: GameState;
  started: boolean;
  paused: boolean;
  cameraMode?: number;
  camera: { yaw: number; pitch: number; zoom: number; locked: boolean };
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


const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

async function dragView(page: Page, dx: number, dy = 0) {
  const bounds = await page.locator('#world canvas').boundingBox();
  if (!bounds) throw new Error('Widok 3D nie ma rozmiaru');
  const x = bounds.x + bounds.width * 0.43;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up({ button: 'right' });
}

test('mysz obraca widok i zmienia kierunek chodzenia WASD względem kamery', async ({ page }) => {
  await start(page);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  const beforeLook = (await snapshot(page)).camera;
  await dragView(page, 290, -65);
  await expect.poll(async () => Math.abs(angleDifference((await snapshot(page)).camera.yaw, beforeLook.yaw))).toBeGreaterThan(0.4);
  await expect.poll(async () => Math.abs((await snapshot(page)).camera.pitch - beforeLook.pitch)).toBeGreaterThan(0.04);
  const look = (await snapshot(page)).camera;

  const beforeForward = (await snapshot(page)).state.player;
  await page.keyboard.down('w');
  await expect.poll(async () => moved(beforeForward, (await snapshot(page)).state.player), { intervals: [50, 100] }).toBeGreaterThan(0.7);
  await page.keyboard.up('w');
  const afterForward = (await snapshot(page)).state.player;
  const forwardDistance = moved(beforeForward, afterForward);
  const alongView = ((afterForward.x - beforeForward.x) * Math.sin(look.yaw) - (afterForward.z - beforeForward.z) * Math.cos(look.yaw)) / forwardDistance;
  expect(alongView).toBeGreaterThan(0.95);

  const beforeStrafe = (await snapshot(page)).state.player;
  await page.keyboard.down('d');
  await expect.poll(async () => moved(beforeStrafe, (await snapshot(page)).state.player), { intervals: [50, 100] }).toBeGreaterThan(0.4);
  await page.keyboard.up('d');
  const afterStrafe = (await snapshot(page)).state.player;
  const strafeDistance = moved(beforeStrafe, afterStrafe);
  const alongRight = ((afterStrafe.x - beforeStrafe.x) * Math.cos(look.yaw) + (afterStrafe.z - beforeStrafe.z) * Math.sin(look.yaw)) / strafeDistance;
  expect(alongRight).toBeGreaterThan(0.95);
  expect(Math.abs(angleDifference((await snapshot(page)).camera.yaw, look.yaw))).toBeLessThan(0.01);

  const zoomBefore = (await snapshot(page)).camera.zoom;
  const canvas = await page.locator('#world canvas').boundingBox();
  if (!canvas) throw new Error('Widok 3D nie ma rozmiaru');
  await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5);
  await page.mouse.wheel(0, 350);
  await expect.poll(async () => (await snapshot(page)).camera.zoom).toBeGreaterThan(zoomBefore);
});

test('kliknięcie przechwytuje mysz, Escape oddaje kursor i pauza blokuje obrót', async ({ page }) => {
  await start(page);
  await page.locator('#world canvas').click({ position: { x: 650, y: 430 } });
  await expect.poll(async () => (await snapshot(page)).camera.locked).toBe(true);
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  const before = (await snapshot(page)).camera.yaw;
  await page.mouse.move(790, 430, { steps: 8 });
  await expect.poll(async () => Math.abs(angleDifference((await snapshot(page)).camera.yaw, before))).toBeGreaterThan(0.1);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).camera.locked).toBe(false);
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator('#resume')).toBeVisible();

  const pausedLook = (await snapshot(page)).camera;
  await page.mouse.move(60, 400);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(160, 435, { steps: 6 });
  await page.mouse.up({ button: 'left' });
  expect((await snapshot(page)).camera.yaw).toBe(pausedLook.yaw);
  expect((await snapshot(page)).camera.pitch).toBe(pausedLook.pitch);
  await page.locator('#resume').click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  expect((await snapshot(page)).camera.locked).toBe(false);
});
