import { expect, test, type Page } from '@playwright/test';
import { WORLD_BOUNDS, type GameState, type Point } from '../src/model';
import { MAP_AREA_RATIO, WORLD_LANDMARKS } from '../src/world-layout';

interface Snapshot {
  state: GameState;
  started: boolean;
  paused: boolean;
  navigation: { route: Point[]; remotePlayers: number };
  rendering: { frames: number; calls: number; triangles: number; view: string; software: boolean };
}
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() =>
  (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

async function stop(page: Page) {
  await page.keyboard.down(' ');
  try {
    await expect.poll(async () => {
      const state = (await snapshot(page)).state;
      return Math.abs(state.vehicles.find(vehicle => vehicle.id === state.player.vehicleId)?.speed ?? 0);
    }, { timeout: 15000, intervals: [50, 100] }).toBeLessThan(.5);
  } finally { await page.keyboard.up(' '); }
}

test('nowa dzielnica jest osiągalna samochodem poza starą granicą i widoczna na mapie telefonu', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [], missing: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400 && /\/school_project\/(?:assets\/|favicon)/.test(response.url())) missing.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await expect.poll(async () => (await snapshot(page)).started).toBe(true);
  expect(MAP_AREA_RATIO).toBeGreaterThan(3.5);
  const landmark = WORLD_LANDMARKS.find(place => place.id === 'north-financial')!;
  expect(landmark).toBeDefined();
  await page.keyboard.press('t');
  await page.locator('#phone-tab-map').click();
  for (const place of WORLD_LANDMARKS) await expect(page.locator(`#phone-route-${place.id}`)).toBeEnabled();
  await expect(page.locator('.phone-map svg')).toBeVisible();
  await page.screenshot({ path: info.outputPath('expanded-city-phone-map.png'), fullPage: true });
  await page.locator(`#phone-route-${landmark.id}`).click();
  await expect(page.locator('#phone-root')).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).navigation.route.at(-1)).toEqual(landmark.point);
  const before = await snapshot(page);
  const driveStartedAt = Date.now();

  // Follow the northbound avenue with actual driving input. The old map ended
  // at z=-98; crossing -132 proves the new area is reachable by the simulation.
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await snapshot(page)).state.player.z, {
      timeout: 45000, intervals: [50, 100],
    }).toBeLessThan(-132);
  } finally { await page.keyboard.up('w'); }
  await stop(page);
  const arrived = await snapshot(page);
  expect(arrived.state.player.mode).toBe('drive');
  expect(arrived.state.player.x).toBeCloseTo(0, 1);
  expect(arrived.state.player.z).toBeGreaterThan(WORLD_BOUNDS.minZ);
  expect(arrived.state.player.z).toBeLessThan(-98);
  expect(arrived.rendering.frames).toBeGreaterThan(before.rendering.frames + 5);
  expect(arrived.rendering.calls).toBeGreaterThan(0);
  expect(arrived.rendering.triangles).toBeGreaterThan(0);
  expect(arrived.rendering.view).toBe('city');
  await expect(page.locator('#district')).toContainText('NORTH FINANCIAL');
  await expect.poll(async () => (await snapshot(page)).navigation.route.at(-1)).toEqual(landmark.point);
  await page.screenshot({ path: info.outputPath('north-financial-desktop.png'), fullPage: true });
  await info.attach('expanded-world-state', { body: JSON.stringify(arrived, null, 2), contentType: 'application/json' });
  await info.attach('expanded-world-rendering', {
    body: JSON.stringify({
      start: before.rendering, northFinancial: arrived.rendering,
      driveWallSeconds: (Date.now() - driveStartedAt) / 1000,
      startPoint: before.state.player, endPoint: arrived.state.player,
    }, null, 2), contentType: 'application/json',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#world canvas')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).rendering.frames).toBeGreaterThan(arrived.rendering.frames);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('north-financial-mobile.png'), fullPage: true });
  await page.keyboard.press('t');
  await page.locator('#phone-tab-map').click();
  await expect(page.locator('.phone-map svg')).toBeVisible();
  await expect(page.locator(`#phone-route-${landmark.id}`)).toBeEnabled();
  await page.screenshot({ path: info.outputPath('expanded-phone-map-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});
