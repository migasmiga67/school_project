import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';
import { CITY_JUNCTIONS, nearestStreet } from '../src/city-map';

interface Snapshot {
  state: GameState;
  cameraMode: number;
  camera: { yaw: number };
  rendering: {
    frames: number;
    firstPerson: { visible: boolean; mode: 'foot' | 'drive'; speed: number; steering: number; phase: number; hands: number };
  };
}
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() =>
  (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

async function start(page: Page) {
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
}

test('pierwsza osoba pokazuje kokpit i ręce, reaguje na ruch oraz znika po zmianie kamery', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram|framebuffer/i.test(message.text())) errors.push(message.text());
  });
  await start(page);
  await page.keyboard.press('c');
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).rendering.firstPerson).toMatchObject({ visible: true, mode: 'drive', hands: 2 });
  await page.screenshot({ path: info.outputPath('driver-cockpit.png') });
  const beforeLook = await snapshot(page);
  const bounds = await page.locator('#world canvas').boundingBox();
  if (!bounds) throw new Error('Missing game view');
  await page.mouse.move(bounds.width * .45, bounds.height * .5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(bounds.width * .45 + 180, bounds.height * .5 - 30, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => Math.abs((await snapshot(page)).camera.yaw - beforeLook.camera.yaw)).toBeGreaterThan(.3);
  await page.screenshot({ path: info.outputPath('driver-look-around.png') });
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await expect.poll(async () => (await snapshot(page)).rendering.firstPerson).toMatchObject({ visible: true, mode: 'foot', hands: 2 });
  const foot = await snapshot(page);
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => {
      const value = await snapshot(page);
      return value.rendering.firstPerson.speed > 1 && Math.hypot(value.state.player.x - foot.state.player.x, value.state.player.z - foot.state.player.z) > .35;
    }, { intervals: [50, 100] }).toBe(true);
  } finally { await page.keyboard.up('d'); }
  const walked = await snapshot(page);
  expect(walked.rendering.firstPerson.phase).not.toBe(foot.rendering.firstPerson.phase);
  expect(walked.state.money).toBe(foot.state.money);
  await page.screenshot({ path: info.outputPath('first-person-hands.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await snapshot(page)).rendering.frames).toBeGreaterThan(walked.rendering.frames);
  await page.screenshot({ path: info.outputPath('first-person-mobile.png') });
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).rendering.firstPerson.visible).toBe(false);
  await page.screenshot({ path: info.outputPath('third-person-character.png') });
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).rendering.firstPerson.visible).toBe(false);
  expect(errors).toEqual([]);
});

test('poruszające się auta NPC zajmują prawy pas zamiast osi ulicy', async ({ page }) => {
  await start(page);
  await expect.poll(async () => (await snapshot(page)).state.time).toBeGreaterThan(.5);
  const before = await snapshot(page);
  await expect.poll(async () => (await snapshot(page)).state.time).toBeGreaterThan(before.state.time + 1);
  const after = await snapshot(page);
  const traffic = after.state.vehicles.filter(car => car.id.startsWith('traffic-'));
  expect(traffic).toHaveLength(16);
  const straight = traffic.filter(car => CITY_JUNCTIONS.every(junction => Math.hypot(car.x - junction.x, car.z - junction.z) > junction.radius + 10));
  expect(straight.length).toBeGreaterThanOrEqual(4);
  for (const car of straight) {
    const street = nearestStreet(car)!;
    const right = (car.x - street.point.x) * Math.cos(car.heading) + (car.z - street.point.z) * Math.sin(car.heading);
    expect(right, `${car.id} on ${street.street.name}`).toBeGreaterThan(1.1);
    expect(street.distance + 1.1).toBeLessThan(street.street.width / 2 + .15);
  }
  expect(traffic.some(car => {
    const old = before.state.vehicles.find(value => value.id === car.id)!;
    return Math.hypot(car.x - old.x, car.z - old.z) > .5;
  })).toBe(true);
});
