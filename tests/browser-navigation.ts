import { expect, type Page } from '@playwright/test';
import type { Point } from '../src/model';

const position = (page: Page): Promise<Point> => page.evaluate(() => {
  const player = (window as unknown as {
    __NEON_TEST__: { state: { player: Point } };
  }).__NEON_TEST__.state.player;
  return { x: player.x, z: player.z };
});
const walkKey = (axis: 'x' | 'z', error: number) =>
  axis === 'x' ? (error > 0 ? 'd' : 'a') : (error > 0 ? 's' : 'w');

/** Routes use the initial north-facing walking camera and real keyboard input. */
export async function walk(page: Page, axis: 'x' | 'z', target: number, sprint = false, cruiseTimeout = 25000) {
  let error = target - (await position(page))[axis];
  if (Math.abs(error) <= 1) return;
  // Release both controls before measuring the endpoint: a software-rendered
  // frame can delay key-up beyond the position returned by a poll.
  if (Math.abs(error) > 6) {
    const direction = Math.sign(error), key = walkKey(axis, error);
    if (sprint) await page.keyboard.down('Shift');
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => direction * (target - (await position(page))[axis]) <= 6,
        { timeout: cruiseTimeout, intervals: [50, 100] }).toBe(true);
    } finally {
      await page.keyboard.up(key);
      if (sprint) await page.keyboard.up('Shift');
    }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    error = target - (await position(page))[axis];
    if (Math.abs(error) <= 1) return;
    await page.keyboard.press(walkKey(axis, error), { delay: 80 });
  }
  expect(Math.abs(target - (await position(page))[axis]), `Dojście do ${axis}=${target} po zwolnieniu klawisza`).toBeLessThanOrEqual(1);
}

export async function approach(page: Page, target: Point, tolerance = 1.5) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const player = await position(page), dx = target.x - player.x, dz = target.z - player.z;
    if (Math.hypot(dx, dz) <= tolerance) return;
    const axis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
    await page.keyboard.press(walkKey(axis, axis === 'x' ? dx : dz), { delay: 80 });
  }
  const player = await position(page);
  expect(Math.hypot(player.x - target.x, player.z - target.z), `Dojście do punktu (${target.x},${target.z})`).toBeLessThanOrEqual(tolerance);
}

export async function walkTo(page: Page, target: Point, firstAxis: 'x' | 'z', sprint = false, cruiseTimeout = 25000) {
  await walk(page, firstAxis, target[firstAxis], sprint, cruiseTimeout);
  const secondAxis = firstAxis === 'x' ? 'z' : 'x';
  await walk(page, secondAxis, target[secondAxis], sprint, cruiseTimeout);
  await approach(page, target);
}
