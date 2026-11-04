import { expect, test, type Page } from '@playwright/test';
import { CITY_BUILDINGS, CITY_JUNCTIONS, CITY_STREETS } from '../src/city-map';
import type { GameState, Point } from '../src/model';
import { WORLD_LANDMARKS } from '../src/world-layout';

interface Snapshot {
  state: GameState;
  started: boolean;
  navigation: { route: Point[] };
  rendering: { frames: number; calls: number; triangles: number; view: string };
}
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() =>
  (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

/** Check the actual GPS polyline against the visible building footprints. */
function expectClearRoute(route: Point[]) {
  expect(route.length).toBeGreaterThan(2);
  for (let segment = 1; segment < route.length; segment++) {
    const from = route[segment - 1], to = route[segment];
    const samples = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) * 2));
    for (let step = 0; step <= samples; step++) {
      const x = from.x + (to.x - from.x) * step / samples;
      const z = from.z + (to.z - from.z) * step / samples;
      const obstacle = CITY_BUILDINGS.find(building =>
        Math.abs(x - building.x) < building.halfX + 1 && Math.abs(z - building.z) < building.halfZ + 1);
      expect(obstacle, `GPS segment ${segment} must leave room around buildings at ${x}, ${z}`).toBeUndefined();
    }
  }
}

test('mapa pokazuje zakręty, różne ulice i dzielnice, a GPS prowadzi po nich do Westwood', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = [], missing: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && /\/school_project\/(?:assets\/|favicon)/.test(response.url())) {
      missing.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await expect.poll(async () => (await snapshot(page)).started).toBe(true);
  await page.keyboard.press('t');
  await page.locator('#phone-tab-map').click();
  const map = page.locator('.phone-map svg');
  await expect(map).toBeVisible();
  const rendered = await map.evaluate(element => ({
    streets: [...element.querySelectorAll<SVGPathElement>('[data-city-street]')].map(path => ({
      id: path.getAttribute('data-city-street')!, width: Number(path.getAttribute('stroke-width')),
      points: (path.getAttribute('d')!.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number),
    })),
    buildings: [...element.querySelectorAll<SVGRectElement>('[data-city-building]')]
      .map(rectangle => rectangle.getAttribute('data-city-building')!),
  }));
  // Every street has a sidewalk and road layer; identity must agree with the
  // playable map, including its narrow alleys and curved outer boulevards.
  expect(rendered.streets.map(street => street.id).sort()).toEqual(
    CITY_STREETS.flatMap(street => [street.id, street.id]).sort());
  expect(rendered.buildings.sort()).toEqual(CITY_BUILDINGS.map(building => building.id).sort());
  expect(new Set(rendered.streets.map(street => street.width)).size).toBeGreaterThan(4);
  const boulevard = rendered.streets.find(street => street.id === 'westwood-boulevard')!;
  expect(boulevard.points.length).toBeGreaterThan(20);
  expect(boulevard.points.some((coordinate, index, points) => index >= 2 && index % 2 === 0
    && Math.abs(coordinate - points[index - 2]) > .01 && Math.abs(points[index + 1] - points[index - 1]) > .01)).toBe(true);
  expect(CITY_JUNCTIONS.some(junction => junction.degree === 1)).toBe(true);
  expect(CITY_JUNCTIONS.some(junction => junction.degree === 3)).toBe(true);
  expect(new Set(CITY_BUILDINGS.map(building => building.style)).size).toBeGreaterThan(4);
  for (const landmark of WORLD_LANDMARKS) {
    await expect(page.locator(`#phone-map-${landmark.id}`)).toBeVisible();
    await expect(page.locator(`#phone-route-${landmark.id}`)).toBeEnabled();
  }
  await page.screenshot({ path: info.outputPath('irregular-city-phone-map-desktop.png'), fullPage: true });

  // Use the real, clickable map marker to request GPS. No position or game
  // state is replaced to reach the new neighborhood.
  const destination = WORLD_LANDMARKS.find(landmark => landmark.id === 'westwood')!;
  await page.locator('#phone-map-westwood').click();
  await expect(page.locator('#phone-root')).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).navigation.route.at(-1)).toEqual(destination.point);
  const routed = await snapshot(page);
  const route = routed.navigation.route;
  expect(route.some((point, index) => index > 0 && Math.abs(point.x - route[index - 1].x) > .01
    && Math.abs(point.z - route[index - 1].z) > .01)).toBe(true);
  expectClearRoute(route);
  expect(routed.rendering.view).toBe('city');
  expect(routed.rendering.calls).toBeGreaterThan(0);
  expect(routed.rendering.triangles).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('westwood-gps-desktop.png'), fullPage: true });
  await info.attach('irregular-city-and-gps', {
    body: JSON.stringify({
      streets: CITY_STREETS.map(street => ({ id: street.id, district: street.district, kind: street.kind, width: street.width })),
      junctionDegrees: CITY_JUNCTIONS.map(junction => junction.degree),
      destination, route, rendering: routed.rendering,
    }, null, 2), contentType: 'application/json',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('t');
  await page.locator('#phone-tab-map').click();
  await expect(map).toBeInViewport();
  await expect(page.locator('#phone-close')).toBeInViewport();
  await expect(page.locator('#phone-map-westwood')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.phone-shell').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('irregular-city-phone-map-mobile.png'), fullPage: true });
  await page.locator('#phone-close').click();
  await expect.poll(async () => (await snapshot(page)).rendering.frames).toBeGreaterThan(routed.rendering.frames);
  expect((await snapshot(page)).navigation.route.at(-1)).toEqual(destination.point);
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});
