import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';

interface Snapshot {
  state: GameState & { garageGate?: { openness: number; holdUntil: number } };
  started: boolean;
  paused: boolean;
  garageOpen: boolean;
  camera: { yaw: number };
  rendering: { frames: number; calls: number; view: string };
}
interface Goal { x: number; z: number; reverse?: boolean; foot?: boolean }
interface GateProof { partialOpening: boolean; insideFrames: number; minimumInsideOpening: number; samples: number }
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() =>
  (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

/** Drive only through real keyboard handlers. RAF feedback avoids slow CDP
 * round trips steering the car past a narrow entrance on software WebGL. */
async function followRoute(page: Page, goals: Goal[], wallTimeoutMs: number) {
  return page.evaluate(async ({ goals, wallTimeoutMs }) => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot };
    const keys = new Set<string>();
    const history: { stage: number; x: number; z: number; heading: number; speed: number }[] = [];
    const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const setKeys = (next: string[]) => {
      for (const key of keys) if (!next.includes(key)) {
        window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })); keys.delete(key);
      }
      for (const key of next) if (!keys.has(key)) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); keys.add(key);
      }
    };
    const deadline = performance.now() + wallTimeoutMs;
    try {
      for (let stage = 0; stage < goals.length; stage++) {
        const goal = goals[stage]; let braking = false;
        while (true) {
          const current = scope.__NEON_TEST__, player = current.state.player;
          const car = current.state.vehicles.find(vehicle => vehicle.id === player.vehicleId);
          if (current.paused || (goal.foot ? player.mode !== 'foot' : player.mode !== 'drive' || !car)) {
            throw new Error(`Route ${stage}: unexpected controls/state ${JSON.stringify({ paused: current.paused, player })}`);
          }
          const distance = Math.hypot(player.x - goal.x, player.z - goal.z);
          if (performance.now() > deadline) throw new Error(`Route ${stage} timed out: ${JSON.stringify({ goal, player, car, gate: current.state.garageGate })}`);
          if (goal.foot) {
            if (distance < .45) { setKeys([]); break; }
            const dx = goal.x - player.x, dz = goal.z - player.z, yaw = current.camera.yaw;
            const forward = dx * Math.sin(yaw) - dz * Math.cos(yaw);
            const right = dx * Math.cos(yaw) + dz * Math.sin(yaw);
            const held: string[] = [];
            if (forward > .16) held.push('w'); else if (forward < -.16) held.push('s');
            if (right > .16) held.push('d'); else if (right < -.16) held.push('a');
            setKeys(held);
          } else {
            if (distance < 1.4) braking = true;
            if (braking && Math.abs(car!.speed) < .25) { setKeys([]); break; }
            const heading = Math.atan2(goal.x - player.x, -(goal.z - player.z)) + (goal.reverse ? Math.PI : 0);
            const error = wrap(heading - car!.heading) * (goal.reverse ? -1 : 1);
            const targetSpeed = Math.min(4, Math.max(2.3, distance)), held: string[] = [];
            if (braking) held.push(' ');
            else {
              if (error < -.08) held.push('a'); else if (error > .08) held.push('d');
              if (Math.abs(car!.speed) < targetSpeed - .3) held.push(goal.reverse ? 's' : 'w');
            }
            setKeys(held);
          }
          if (history.length < 1200) history.push({ stage, x: player.x, z: player.z, heading: player.heading, speed: car?.speed ?? 0 });
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
      }
      return history;
    } finally { setKeys([]); }
  }, { goals, wallTimeoutMs });
}

test('brama otwiera się przed autem, można wjechać do warsztatu, wysiąść i wyjechać', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = [], missing: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram|framebuffer/i.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && /\/school_project\/(?:assets\/|favicon)/.test(response.url())) missing.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  const before = await snapshot(page);
  expect(before.state.player.vehicleId).toBe('stratus');
  expect(before.state.money).toBe(1250);
  expect(before.state.garageGate?.openness).toBe(0);
  await page.evaluate(() => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot; __GARAGE_ENTRY_PROOF__: GateProof; __GARAGE_PROBE_ACTIVE__: boolean };
    const proof: GateProof = { partialOpening: false, insideFrames: 0, minimumInsideOpening: 1, samples: 0 };
    scope.__GARAGE_ENTRY_PROOF__ = proof; scope.__GARAGE_PROBE_ACTIVE__ = true;
    const record = () => {
      if (!scope.__GARAGE_PROBE_ACTIVE__) return;
      const current = scope.__NEON_TEST__, opening = current.state.garageGate?.openness ?? 0;
      proof.samples++;
      if (opening > 0 && opening < 1) proof.partialOpening = true;
      if (current.state.player.mode === 'drive' && current.state.player.x > -24 && current.state.player.x < -16
        && current.state.player.z > 57 && current.state.player.z < 69) {
        proof.insideFrames++; proof.minimumInsideOpening = Math.min(proof.minimumInsideOpening, opening);
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  // Reverse to the open avenue, turn west, then approach the northbound bay.
  // These are normal road manoeuvres from the game's original spawn.
  const approach = await followRoute(page, [
    { x: 0, z: 85, reverse: true }, { x: -7, z: 80 }, { x: -15.7, z: 80 },
    { x: -20, z: 76 }, { x: -20, z: 62 },
  ], 70000);
  await expect.poll(async () => {
    const current = await snapshot(page);
    return Math.abs(current.state.vehicles.find(vehicle => vehicle.id === 'stratus')!.speed);
  }).toBeLessThan(.1);
  const inside = await snapshot(page), car = inside.state.vehicles.find(vehicle => vehicle.id === 'stratus')!;
  expect(inside.state.player.mode).toBe('drive'); expect(inside.state.player.vehicleId).toBe('stratus');
  expect(inside.state.interior).toBeNull();
  expect(car.x).toBeGreaterThan(-23); expect(car.x).toBeLessThan(-17);
  expect(car.z).toBeGreaterThan(57); expect(car.z).toBeLessThan(67);
  expect(car.health).toBe(100); expect(inside.state.money).toBe(before.state.money);
  expect(inside.state.garageGate!.openness).toBeGreaterThan(.99);
  expect(inside.rendering.calls).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('drive-in-garage-interior.png'), fullPage: true });
  await page.evaluate(async () => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot };
    const end = scope.__NEON_TEST__.state.time + 2;
    while (scope.__NEON_TEST__.state.time < end) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  expect((await snapshot(page)).state.garageGate!.openness).toBeGreaterThan(.99);

  await page.keyboard.press('g');
  await expect(page.locator('#garage-root')).toBeVisible();
  const parked = await snapshot(page), location = { ...parked.state.player };
  await page.locator('#garage-paint-387e9a').click();
  await expect.poll(async () => (await snapshot(page)).state.money).toBe(1170);
  const painted = await snapshot(page);
  expect(painted.state.player).toEqual(location);
  expect(painted.state.vehicles.find(vehicle => vehicle.id === 'stratus')!.color).toBe(0x387e9a);
  await page.locator('#garage-close').click();
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  const onFoot = await snapshot(page);
  expect(onFoot.state.player.z).toBeLessThan(69);
  // Walk through the same physical opening and back to the parked car. E away
  // from the service desk must enter the vehicle rather than reopen its panel.
  const walking = await followRoute(page, [{ x: -18, z: 78, foot: true }, { x: onFoot.state.player.x, z: onFoot.state.player.z, foot: true }], 35000);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.vehicleId).toBe('stratus');
  const departure = await followRoute(page, [{ x: -20, z: 84, reverse: true }], 25000);
  const outside = await snapshot(page);
  expect(outside.state.player.mode).toBe('drive'); expect(outside.state.player.z).toBeGreaterThan(79);
  expect(outside.state.player.vehicleId).toBe('stratus'); expect(outside.state.money).toBe(1170);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#world canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('drive-in-garage-mobile.png'), fullPage: true });
  const proof = await page.evaluate(() => {
    const scope = window as unknown as { __GARAGE_ENTRY_PROOF__: GateProof; __GARAGE_PROBE_ACTIVE__: boolean };
    scope.__GARAGE_PROBE_ACTIVE__ = false; return scope.__GARAGE_ENTRY_PROOF__;
  });
  expect(proof.partialOpening).toBe(true); expect(proof.insideFrames).toBeGreaterThan(3);
  expect(proof.minimumInsideOpening).toBeGreaterThan(.99);
  await info.attach('physical-garage-drive-proof', { body: JSON.stringify({ proof, before: before.state.player, inside: car, outside: outside.state.player, approach, walking, departure }, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]); expect(missing).toEqual([]);
});
