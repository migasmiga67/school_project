import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import type { GarageState } from '../src/garage';
import type { GameState } from '../src/model';
import type { MultiplayerState, RoomSnapshot } from '../src/multiplayer-model';

const GAME_URL = process.env.NEON_BASE_URL || 'http://127.0.0.1:5185/school_project/';
type Snapshot = {
  state: GameState;
  started: boolean;
  paused: boolean;
  garage: GarageState;
  garageOpen: boolean;
  activitiesOpen: boolean;
  online: MultiplayerState;
  rendering: { frames: number; remotePlayers: number };
};
type Pair = { host: Page; guest: Page; contexts: BrowserContext[]; errors: string[]; failed: string[] };

const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);
async function room(page: Page): Promise<RoomSnapshot> {
  const online = (await snapshot(page)).online;
  expect(online.status).toBe('online');
  expect(online.snapshot).not.toBeNull();
  return online.snapshot!;
}
function watch(page: Page, errors: string[], failed: string[], name: string) {
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && /\/school_project\/(?:assets\/|favicon)/.test(response.url())) failed.push(`${response.status()} ${response.url()}`);
  });
}
async function captureFailure(contexts: BrowserContext[], info: TestInfo) {
  await Promise.allSettled(contexts.map(async (context, index) => {
    const page = context.pages()[0];
    if (!page || page.isClosed()) return;
    await page.screenshot({ path: info.outputPath(`expansion-failure-${index}.png`), fullPage: true });
    await info.attach(`expansion-state-${index}`, { body: JSON.stringify(await snapshot(page), null, 2), contentType: 'application/json' });
  }));
}
async function createPair(browser: Browser, info: TestInfo): Promise<Pair> {
  const contexts: BrowserContext[] = [], errors: string[] = [], failed: string[] = [];
  const open = async (name: string) => {
    const context = await browser.newContext({ baseURL: GAME_URL, viewport: { width: 960, height: 720 } });
    contexts.push(context);
    await context.addInitScript(() => {
      Object.defineProperty(window, '__NEON_SIGNALING__', {
        value: { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false, config: {
          iceServers: [{ urls: 'turn:127.0.0.1:3478?transport=tcp', username: 'neon', credential: 'neon-local-test' }],
          iceTransportPolicy: 'relay',
        } },
      });
    });
    const page = await context.newPage(); watch(page, errors, failed, name);
    await page.goto('./');
    await page.locator('#intro-online').click();
    await page.locator('#online-name').fill(name);
    return page;
  };
  try {
    const host = await open('Alicja');
    await host.locator('#online-create').click();
    await expect.poll(async () => (await snapshot(host)).online.status, { timeout: 20000 }).toBe('online');
    const code = (await host.locator('#online-code').innerText()).trim();
    await host.locator('#online-enter').click();
    const guest = await open('Borys');
    await guest.locator('#online-room').fill(code);
    await guest.locator('#online-join').click();
    await expect.poll(async () => (await snapshot(guest)).online.status, { timeout: 20000 }).toBe('online');
    await guest.locator('#online-enter').click();
    for (const page of [host, guest]) {
      await expect.poll(async () => (await snapshot(page)).started).toBe(true);
      await expect.poll(async () => (await room(page)).members.length).toBe(2);
    }
    return { host, guest, contexts, errors, failed };
  } catch (error) {
    await captureFailure(contexts, info);
    await Promise.allSettled(contexts.map(context => context.close()));
    throw error;
  }
}
async function focusCity(page: Page) {
  await page.bringToFront();
  if ((await snapshot(page)).activitiesOpen) await page.locator('#activities-close').click();
  if ((await snapshot(page)).paused) await page.locator('#resume').click();
}
async function openActivities(page: Page) {
  await focusCity(page);
  await page.keyboard.press('j');
  await expect(page.locator('#activities-dialog')).toBeVisible();
}
async function moveUntil(page: Page, key: string, axis: 'x' | 'z', target: number, increasing: boolean, timeout = 20000) {
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => {
      const value = (await snapshot(page)).state.player[axis];
      return increasing ? value >= target : value <= target;
    }, { intervals: [50, 100], timeout }).toBe(true);
  } finally { await page.keyboard.up(key); }
}
async function stopCar(page: Page) {
  await page.keyboard.down(' ');
  try {
    await expect.poll(async () => {
      const state = (await snapshot(page)).state;
      return Math.abs(state.vehicles.find(car => car.id === state.player.vehicleId)?.speed ?? 0);
    }, { intervals: [50, 100] }).toBeLessThan(.6);
  } finally { await page.keyboard.up(' '); }
}
async function walkToCasinoDoor(page: Page) {
  await focusCity(page);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await moveUntil(page, 's', 'z', 75, true);
  await moveUntil(page, 'd', 'x', 19, true);
  await moveUntil(page, 'w', 'z', 74.5, false);
  expect(Math.hypot((await snapshot(page)).state.player.x - 20, (await snapshot(page)).state.player.z - 74)).toBeLessThan(3);
}

test('garaż kupuje i ulepsza samochód, a profil pozostaje po odświeżeniu', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [], failed: string[] = []; watch(page, errors, failed, 'Garaż');
  await page.goto('./');
  await page.locator('#start-game').click();
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await moveUntil(page, 's', 'z', 75.5, true);
  await moveUntil(page, 'a', 'x', -19.5, false);
  await moveUntil(page, 'w', 'z', 74.5, false);
  await page.keyboard.press('e');
  await expect(page.locator('#garage-root')).toBeVisible();
  await expect(page.locator('#garage-wallet')).toHaveText(/\$1\s?250/);
  await page.locator('#garage-buy-sentinel').click();
  await expect.poll(async () => (await snapshot(page)).garage.selected).toBe('sentinel');
  expect((await snapshot(page)).state.money).toBe(350);
  await expect(page.locator('#garage-upgrade-engine')).toBeEnabled();
  await page.locator('#garage-upgrade-engine').click();
  await expect.poll(async () => (await snapshot(page)).state.money).toBe(0);
  const upgraded = await snapshot(page), car = upgraded.state.vehicles.find(item => item.id === 'stratus')!;
  expect(upgraded.garage.owned).toEqual(['stratus', 'sentinel']);
  expect(upgraded.garage.cars.sentinel?.engine).toBe(1);
  expect(car.kind).toBe('sedan'); expect(car.label).toBe('Sentinel GT'); expect(car.tuning?.engine).toBe(1);
  await page.screenshot({ path: info.outputPath('garage-upgraded.png'), fullPage: true });
  await page.locator('#garage-close').click();
  await page.reload();
  await page.locator('#start-game').click();
  const restored = await snapshot(page), restoredCar = restored.state.vehicles.find(item => item.id === 'stratus')!;
  expect(restored.state.money).toBe(0); expect(restored.garage.selected).toBe('sentinel');
  expect(restoredCar.kind).toBe('sedan'); expect(restoredCar.tuning?.engine).toBe(1);
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});

test('pasażer jedzie samochodem znajomego i odzyskuje sterowanie po rozłączeniu kierowcy', async ({ browser }, info) => {
  test.setTimeout(150000);
  const pair = await createPair(browser, info), { host, guest } = pair;
  try {
    const hostId = (await room(host)).youId;
    await focusCity(guest); await guest.keyboard.press('e');
    await expect.poll(async () => (await snapshot(guest)).state.player.mode).toBe('foot');
    await moveUntil(guest, 's', 'z', 66.5, true);
    await guest.keyboard.press('f');
    await expect.poll(async () => (await snapshot(guest)).state.player.passengerOf).toBe(hostId);
    await focusCity(host);
    await moveUntil(host, 'w', 'z', 63, false);
    await stopCar(host);
    await expect.poll(async () => {
      const a = (await snapshot(host)).state.player, b = (await snapshot(guest)).state.player;
      return Math.hypot(a.x - b.x, a.z - b.z);
    }).toBeLessThan(.35);
    await focusCity(guest);
    const before = (await snapshot(guest)).state.player;
    // R must be ignored while riding, rather than queued until we leave.
    await guest.keyboard.press('r');
    await guest.keyboard.down('w');
    await guest.waitForTimeout(350);
    await guest.keyboard.up('w');
    const after = (await snapshot(guest)).state.player;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(.35);
    expect(after.passengerOf).toBe(hostId);
    await guest.screenshot({ path: info.outputPath('passenger-shared-car.png'), fullPage: true });
    await guest.keyboard.press('f');
    await expect.poll(async () => (await snapshot(guest)).state.player.passengerOf).toBeFalsy();
    expect((await snapshot(guest)).state.player.mode).toBe('foot');
    expect((await room(guest)).wallet).toBe(1250);
    await guest.keyboard.press('f');
    await expect.poll(async () => (await snapshot(guest)).state.player.passengerOf).toBe(hostId);
    await pair.contexts[0].close();
    await expect.poll(async () => (await snapshot(guest)).online.status, { timeout: 20000 }).not.toBe('online');
    expect((await snapshot(guest)).state.player.passengerOf).toBeFalsy();
    expect((await snapshot(guest)).state.money).toBe(1250);
    expect((await snapshot(guest)).state.mission.active).toBe(true);
    expect(pair.errors).toEqual([]); expect(pair.failed).toEqual([]);
  } catch (error) { await captureFailure(pair.contexts, info); throw error; }
  finally { await Promise.allSettled(pair.contexts.map(context => context.close())); }
});

test('napad wymaga przygotowania obu ról i prywatnej sekwencji hakera', async ({ browser }, info) => {
  test.setTimeout(180000);
  const pair = await createPair(browser, info), { host, guest } = pair;
  try {
    await openActivities(host);
    await expect(host.locator('#heist-start')).toBeEnabled();
    await host.locator('#heist-start').click();
    await expect.poll(async () => (await room(host)).jobs.heist.status).toBe('gather');
    await walkToCasinoDoor(host);
    await openActivities(host);
    await expect(host.locator('#heist-interact')).toBeEnabled();
    await host.locator('#heist-interact').click();
    await expect.poll(async () => (await room(host)).jobs.heist.gathered).toContain((await room(host)).youId);
    await walkToCasinoDoor(guest);
    await openActivities(guest);
    await expect(guest.locator('#heist-interact')).toBeEnabled();
    await guest.locator('#heist-interact').click();
    for (const page of [host, guest]) await expect.poll(async () => (await room(page)).jobs.heist.status).toBe('hack');
    expect((await room(host)).jobs.heist.role).toBe('driver');
    expect((await room(host)).jobs.heist.sequence).toEqual([]);
    expect((await room(guest)).jobs.heist.role).toBe('hacker');
    const symbols = (await room(guest)).jobs.heist.sequence;
    expect(symbols).toHaveLength(3);
    await expect(host.locator('[id^="heist-symbol-"]')).toHaveCount(0);
    await expect(guest.locator('[id^="heist-symbol-"]')).toHaveCount(4);
    await guest.screenshot({ path: info.outputPath('heist-private-hacker-panel.png'), fullPage: true });
    for (let index = 0; index < symbols.length; index++) {
      await guest.locator(`#heist-symbol-${symbols[index]}`).click();
      await expect.poll(async () => (await room(guest)).jobs.heist.progress).toBe(index + 1);
    }
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).jobs.heist.status).toBe('escape');
      expect((await room(page)).jobs.heist.target).toEqual({ x: -80, z: 0 });
      await expect.poll(async () => (await snapshot(page)).state.wanted).toBe(3);
      expect((await room(page)).wallet).toBe(1250);
    }
    expect(pair.errors).toEqual([]); expect(pair.failed).toEqual([]);
  } catch (error) { await captureFailure(pair.contexts, info); throw error; }
  finally { await Promise.allSettled(pair.contexts.map(context => context.close())); }
});

test('wyścig ustawia kierowców na starcie i zalicza pierwszy punkt po sygnale', async ({ browser }, info) => {
  test.setTimeout(150000);
  const pair = await createPair(browser, info), { host, guest } = pair;
  try {
    await openActivities(host);
    await expect(host.locator('#race-start')).toBeEnabled();
    await host.locator('#race-start').click();
    await expect.poll(async () => (await room(host)).jobs.race.status).toBe('lobby');
    await expect(host.locator('#race-ready')).toBeEnabled();
    await host.locator('#race-ready').click();
    await expect.poll(async () => (await room(host)).jobs.race.ready).toContain((await room(host)).youId);
    await focusCity(guest);
    await moveUntil(guest, 's', 'z', 72, true);
    await stopCar(guest);
    await openActivities(guest);
    await expect(guest.locator('#race-ready')).toBeEnabled();
    await guest.locator('#race-ready').click();
    await expect.poll(async () => (await room(guest)).jobs.race.status).toBe('countdown');
    const grid = (await room(guest)).jobs.race.grid!;
    expect(grid).toEqual({ x: 3, z: 82 });
    await guest.locator('#activities-close').click();
    await guest.keyboard.down('w');
    // One-shot actions during the locked grid must not execute at the GO signal.
    await guest.keyboard.press('e');
    await guest.keyboard.press('r');
    await guest.waitForTimeout(100);
    const waiting = await snapshot(guest);
    if (waiting.online.snapshot?.jobs.race.status === 'countdown') {
      expect(Math.hypot(waiting.state.player.x - grid.x, waiting.state.player.z - grid.z)).toBeLessThan(.1);
    }
    await guest.keyboard.up('w');
    await focusCity(host);
    await expect.poll(async () => (await room(host)).jobs.race.status, { timeout: 10000 }).toBe('running');
    expect((await snapshot(guest)).state.player.mode).toBe('drive');
    // Police arrest costs $200; an incorrectly queued R would cost $100.
    expect((1250 - (await room(guest)).wallet) % 200).toBe(0);
    await moveUntil(host, 'w', 'z', 40.5, false);
    const hostId = (await room(host)).youId;
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).jobs.race.participants.find(person => person.id === hostId)?.checkpoint).toBe(1);
      const current = await room(page);
      expect(current.jobs.race.participants.every(person => person.prize === 0)).toBe(true);
      expect(current.wallet).toBeLessThanOrEqual(1250);
    }
    expect((await room(host)).jobs.race.target).toEqual({ x: 40, z: 40 });
    await openActivities(host);
    await expect(host.locator('.race-ranking')).toBeVisible();
    await expect(host.locator('.race-ranking')).toContainText('Alicja');
    await expect(host.locator('.race-ranking')).toContainText('1/4');
    await host.screenshot({ path: info.outputPath('race-live-ranking.png'), fullPage: true });
    expect(pair.errors).toEqual([]); expect(pair.failed).toEqual([]);
  } catch (error) { await captureFailure(pair.contexts, info); throw error; }
  finally { await Promise.allSettled(pair.contexts.map(context => context.close())); }
});
