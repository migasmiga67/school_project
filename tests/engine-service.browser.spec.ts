import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';
import type { EngineCare, OilService } from '../src/engine';

interface Snapshot {
  state: GameState;
  paused: boolean;
  cameraMode: number;
  camera: { yaw: number; pitch: number };
  engine: { care: EngineCare; run: { running: boolean; rpm: number }; service: OilService | null; part: string | null; crouch: number };
}
interface Goal { x: number; z: number; reverse?: boolean }
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

/** Same keyboard-only driving helper as the garage test: RAF-paced and deterministic. */
async function drive(page: Page, goals: Goal[], wallTimeoutMs: number) {
  await page.evaluate(async ({ goals, wallTimeoutMs }) => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot };
    const keys = new Set<string>();
    const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const setKeys = (next: string[]) => {
      for (const key of keys) if (!next.includes(key)) { window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); keys.delete(key); }
      for (const key of next) if (!keys.has(key)) { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); keys.add(key); }
    };
    const deadline = performance.now() + wallTimeoutMs;
    try {
      for (const goal of goals) {
        let braking = false;
        while (true) {
          const current = scope.__NEON_TEST__, player = current.state.player, car = current.state.vehicles.find(vehicle => vehicle.id === player.vehicleId)!;
          if (performance.now() > deadline) throw new Error(`timed out at ${JSON.stringify({ goal, player })}`);
          const distance = Math.hypot(player.x - goal.x, player.z - goal.z);
          if (distance < 1.4) braking = true;
          if (braking && Math.abs(car.speed) < .25) { setKeys([]); break; }
          const heading = Math.atan2(goal.x - player.x, -(goal.z - player.z)) + (goal.reverse ? Math.PI : 0);
          const error = wrap(heading - car.heading) * (goal.reverse ? -1 : 1), held: string[] = [];
          const targetSpeed = Math.min(4, Math.max(2.3, distance));
          if (braking) held.push(' ');
          else if (Math.abs(car.speed) < targetSpeed) held.push(goal.reverse ? 's' : 'w');
          else if (Math.abs(car.speed) > targetSpeed + 1) held.push(goal.reverse ? 'w' : 's');
          if (error > .06) held.push(goal.reverse ? 'a' : 'd'); else if (error < -.06) held.push(goal.reverse ? 'd' : 'a');
          setKeys(held);
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
      }
    } finally { setKeys([]); }
  }, { goals, wallTimeoutMs });
}

/** Point the first-person camera at a part; the game then picks it by ray from the crosshair. */
async function aimAt(page: Page, part: string, crouch = false) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await snapshot(page);
    if (current.engine.part === part && (!crouch || current.engine.crouch > .6)) return;
    await page.evaluate(name => (window as unknown as { __NEON_AIM__: (part: string) => boolean }).__NEON_AIM__(name), part);
    await page.waitForTimeout(120);
  }
  throw new Error(`could not aim at ${part}: ${JSON.stringify((await snapshot(page)).engine)}`);
}
async function use(page: Page, part: string, crouch = false) {
  await aimAt(page, part, crouch);
  await page.keyboard.press('e');
}

test('the player tunes the car and changes its oil by hand in first person', async ({ page }, info) => {
  test.setTimeout(240000);
  await page.goto('./');
  await page.locator('#start-game').click();
  await drive(page, [{ x: 0, z: 85, reverse: true }, { x: -7, z: 80 }, { x: -15.7, z: 80 }, { x: -20, z: 76 }, { x: -20, z: 64.5 }], 80000);

  // Visual tuning from the MOD SHOP panel.
  await page.keyboard.press('g');
  await expect(page.locator('#garage-root')).toBeVisible();
  await page.locator('#garage-part-spoiler-2').click();
  await expect.poll(async () => (await snapshot(page)).state.vehicles.find(vehicle => vehicle.id === 'stratus')!.style?.spoiler).toBe(2);
  await page.locator('#garage-part-rimColor-2').click();
  await expect.poll(async () => (await snapshot(page)).state.money).toBe(1250 - 320 - 70);
  await expect(page.locator('#garage-engine-state')).toContainText('Olej');
  await page.screenshot({ path: info.outputPath('tuning-panel.png') });
  await page.locator('#garage-close').click();

  // Out of the car, open the bonnet in first person.
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await page.keyboard.press('o');
  await expect.poll(async () => Boolean((await snapshot(page)).engine.service)).toBe(true);
  expect((await snapshot(page)).cameraMode).toBe(2);
  await expect(page.locator('#engine-service')).toBeVisible();
  const start = await snapshot(page);
  expect(start.engine.care.life).toBeLessThan(.5);

  await use(page, 'hood');
  await expect.poll(async () => (await snapshot(page)).engine.service?.hood).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('engine-bay-open.png') });
  await use(page, 'dipstick'); await expect(page.locator('#toast')).toContainText('Bagnet');
  await use(page, 'dipstick');
  await use(page, 'cap');
  await expect.poll(async () => (await snapshot(page)).engine.service?.cap).toBe(true);
  // Start the engine briefly to watch it run.
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).engine.run.rpm).toBeGreaterThan(600);
  await page.screenshot({ path: info.outputPath('engine-running.png') });
  await page.keyboard.press('q');

  // Crouch and open the sump plug under the front bumper.
  await page.keyboard.press('x');
  await use(page, 'drainPlug', true);
  await expect.poll(async () => (await snapshot(page)).engine.service?.plugOut).toBe(true);
  await page.screenshot({ path: info.outputPath('draining-oil.png') });
  await expect.poll(async () => (await snapshot(page)).engine.care.oil, { timeout: 30000 }).toBeLessThan(.06);
  await use(page, 'drainPlug', true);
  await expect.poll(async () => (await snapshot(page)).engine.service?.plugOut).toBe(false);
  await page.keyboard.press('x');

  await use(page, 'filter'); await expect.poll(async () => (await snapshot(page)).engine.service?.filter).toBe('none');
  await use(page, 'filter'); await expect.poll(async () => (await snapshot(page)).engine.service?.filter).toBe('new');
  await use(page, 'bottle');
  await expect.poll(async () => (await snapshot(page)).engine.service?.pouring).toBe(true);
  await page.screenshot({ path: info.outputPath('pouring-oil.png') });
  await expect.poll(async () => (await snapshot(page)).engine.care.oil, { timeout: 40000 }).toBeGreaterThan(4.45);
  await aimAt(page, 'bottle'); await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).engine.service?.pouring).toBe(false);
  await use(page, 'cap'); await use(page, 'dipstick'); await use(page, 'dipstick');
  await use(page, 'hood');
  await expect.poll(async () => (await snapshot(page)).engine.service?.hood).toBe(false);
  await page.keyboard.press('o');
  await expect.poll(async () => (await snapshot(page)).engine.service).toBeNull();
  const done = await snapshot(page);
  expect(done.engine.care.life).toBeGreaterThan(.95);
  expect(done.engine.care.oil).toBeGreaterThan(4.3);
  expect(done.state.money).toBeLessThan(1250 - 320 - 70);
});
