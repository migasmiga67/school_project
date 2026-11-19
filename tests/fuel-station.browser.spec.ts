import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';
import type { EngineCare } from '../src/engine';
import type { FuelSession } from '../src/fuel-stations';
import { PUMP_SIDES, SHOP_DOOR, stationPoint } from '../src/fuel-stations';

interface Snapshot {
  state: GameState; paused: boolean; cameraMode: number;
  camera: { yaw: number };
  engine: { care: EngineCare };
  fuel: { session: FuelSession | null; part: string | null; bill: { station: string; amount: number } | null };
}
interface Goal { x: number; z: number; reverse?: boolean; foot?: boolean }
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

/** Keyboard-only, RAF-paced driving and walking. */
async function follow(page: Page, goals: Goal[], wallTimeoutMs: number) {
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
          const current = scope.__NEON_TEST__, player = current.state.player;
          if (performance.now() > deadline) throw new Error(`timed out at ${JSON.stringify({ goal, player })}`);
          const distance = Math.hypot(player.x - goal.x, player.z - goal.z);
          if (goal.foot) {
            if (distance < .35) { setKeys([]); break; }
            const dx = goal.x - player.x, dz = goal.z - player.z, yaw = current.camera.yaw, held: string[] = [];
            const forward = dx * Math.sin(yaw) - dz * Math.cos(yaw), right = dx * Math.cos(yaw) + dz * Math.sin(yaw);
            if (forward > .12) held.push('w'); else if (forward < -.12) held.push('s');
            if (right > .12) held.push('d'); else if (right < -.12) held.push('a');
            setKeys(held);
          } else {
            const car = current.state.vehicles.find(vehicle => vehicle.id === player.vehicleId)!;
            if (distance < 1.2) braking = true;
            if (braking && Math.abs(car.speed) < .25) { setKeys([]); break; }
            const heading = Math.atan2(goal.x - player.x, -(goal.z - player.z)) + (goal.reverse ? Math.PI : 0);
            const error = wrap(heading - car.heading) * (goal.reverse ? -1 : 1), held: string[] = [];
            const targetSpeed = Math.min(4, Math.max(2, distance * .6));
            if (braking) held.push(' ');
            else if (Math.abs(car.speed) < targetSpeed) held.push(goal.reverse ? 's' : 'w');
            else if (Math.abs(car.speed) > targetSpeed + 1) held.push(goal.reverse ? 'w' : 's');
            if (error > .05) held.push(goal.reverse ? 'a' : 'd'); else if (error < -.05) held.push(goal.reverse ? 'd' : 'a');
            setKeys(held);
          }
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
      }
    } finally { setKeys([]); }
  }, { goals, wallTimeoutMs });
}
async function use(page: Page, part: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await snapshot(page)).fuel.part === part) { await page.keyboard.press('e'); return; }
    await page.evaluate(name => (window as unknown as { __NEON_AIM__: (part: string) => boolean }).__NEON_AIM__(name), part);
    await page.waitForTimeout(120);
  }
  throw new Error(`could not aim at ${part}: ${JSON.stringify((await snapshot(page)).fuel)}`);
}

test('the player refuels at a PetroCoast pump and pays at the till', async ({ page }, info) => {
  test.setTimeout(300000);
  await page.goto('./');
  await page.locator('#start-game').click();
  // The street-side face of the eastern island at Southside.
  const pump = PUMP_SIDES.find(item => item.station.id === 'southside' && item.side === -1 && stationPoint(item.station, 0, 0).x < item.point.x)!;
  const { along, out } = pump.station;
  // Car heading along +along puts the right-hand filler flap towards the island.
  const stop = { x: pump.point.x + along.x * 1.55 - out.x * 1.35, z: pump.point.z + along.z * 1.55 - out.z * 1.35 };
  const lane = (u: number) => ({ x: stop.x + along.x * u, z: stop.z + along.z * u });
  await follow(page, [{ x: 0, z: 85, reverse: true }, { x: -7, z: 80 }, { x: -48, z: 77 }, { x: -78, z: 78 }, { x: -82, z: 84 }, { x: -72, z: 85 }, lane(-9), lane(-4), stop], 150000);
  const parked = await snapshot(page), car = parked.state.vehicles.find(vehicle => vehicle.id === 'stratus')!;
  expect(Math.hypot(car.x - stop.x, car.z - stop.z)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('station-arrival.png') });
  const before = parked.engine.care.fuel, money = parked.state.money;
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await follow(page, [{ x: pump.point.x - along.x * 1.1 - out.x * .5, z: pump.point.z - along.z * 1.1 - out.z * .5, foot: true }], 30000);
  await page.keyboard.press('e');
  await expect.poll(async () => Boolean((await snapshot(page)).fuel.session)).toBe(true);
  await expect(page.locator('#engine-service')).toContainText('DYSTRYBUTOR');
  await use(page, 'fuelFlap');
  await use(page, 'grade95');
  await use(page, 'nozzle');
  await expect.poll(async () => (await snapshot(page)).fuel.session?.nozzle).toBe('hand');
  await page.screenshot({ path: info.outputPath('nozzle-in-hand.png') });
  await use(page, 'fuelFlap');
  await expect.poll(async () => (await snapshot(page)).fuel.session?.pouring).toBe(true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('refuelling.png') });
  await expect.poll(async () => (await snapshot(page)).fuel.session?.pouring, { timeout: 90000 }).toBe(false);
  const full = await snapshot(page);
  expect(full.engine.care.fuel).toBeGreaterThan(49.5);
  expect(full.fuel.session!.litres).toBeGreaterThan(30);
  await use(page, 'fuelFlap'); await use(page, 'nozzle'); await use(page, 'fuelFlap');
  await page.keyboard.press('o');
  await expect.poll(async () => (await snapshot(page)).fuel.bill?.amount ?? 0).toBeGreaterThan(50);
  const bill = (await snapshot(page)).fuel.bill!.amount;
  const door = stationPoint(pump.station, SHOP_DOOR.u, SHOP_DOOR.v - .9);
  await follow(page, [{ x: pump.point.x - along.x * 2.4 - out.x * .6, z: pump.point.z - along.z * 2.4 - out.z * .6, foot: true }, { x: door.x, z: door.z, foot: true }], 40000);
  await page.screenshot({ path: info.outputPath('station-shop.png') });
  await page.keyboard.press('e');
  await expect(page.locator('#inventory-root')).toBeVisible();
  await page.locator('#inventory-pay').click();
  await expect.poll(async () => (await snapshot(page)).fuel.bill).toBeNull();
  await page.locator('#inventory-buy-canister').click();
  await expect(page.locator('#inventory-message')).toContainText('Kanister');
  await page.screenshot({ path: info.outputPath('station-shop-panel.png') });
  await page.locator('#inventory-close').click();
  const paid = await snapshot(page);
  expect(paid.state.money).toBe(money - bill - 14);
  // Paying never raises the wanted level (driving incidents on the way may have).
  expect(paid.state.wanted).toBeLessThanOrEqual(parked.state.wanted);
  expect(before).toBeLessThan(20);
});
