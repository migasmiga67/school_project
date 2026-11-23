import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';

type Snapshot = { state: GameState; inventory: { slots: { item: string; count: number }[] }; phoneApps: { food: { item: string } | null; radio: string | null; estate: { owned: string[] } } };
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);

test('aplikacje telefonu: wszystkie się otwierają, kurier dowozi jedzenie, radio i nieruchomości działają', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.locator('#start-game').click();
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('drive');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');

  await page.keyboard.press('t');
  await expect(page.locator('#phone-root')).toBeVisible();
  for (const [id, title] of [['scanner', 'Skaner'], ['races', 'Wyścigi'], ['food', 'Jedzenie'], ['estate', 'Nieruchomości'], ['tow', 'Mechanik'], ['weather', 'Pogoda i radio'], ['market', 'Czarny rynek']]) {
    await page.locator(`#phone-launch-app-${id}`).click();
    await expect(page.locator('#phone-heading')).toHaveText(title);
    await expect(page.locator('#phone-content')).toHaveAttribute('data-phone-app', id);
    await page.locator('#phone-app-back').click();
  }

  // Radio: tune in on foot; it starts playing once the player drives.
  await page.locator('#phone-launch-app-weather').click();
  await page.locator('#pa-radio-chill').click();
  await expect(page.locator('#phone-notice')).toContainText('Coast Chill');
  await expect.poll(async () => (await snapshot(page)).phoneApps.radio).toBe('chill');
  await page.locator('#phone-app-back').click();

  // Property: buy the garage and see it listed as owned.
  await page.locator('#phone-launch-app-estate').click();
  const money = (await snapshot(page)).state.money;
  await page.locator('#pa-estate-buy-garage-port').click();
  await expect.poll(async () => (await snapshot(page)).phoneApps.estate.owned).toContain('garage-port');
  expect((await snapshot(page)).state.money).toBe(money - 1200);
  await page.locator('#phone-app-back').click();

  // Food: the scooter courier rides over and the coffee lands in the backpack.
  await page.locator('#phone-launch-app-food').click();
  await page.locator('#pa-food-coffee').click();
  await expect(page.locator('#phone-notice')).toContainText('Kurier już jedzie');
  await page.keyboard.press('Escape');
  await expect(page.locator('#phone-root')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).phoneApps.food, { timeout: 60000, intervals: [500] }).toBeNull();
  expect((await snapshot(page)).inventory.slots.some(slot => slot.item === 'coffee')).toBe(true);
  expect(errors).toEqual([]);
});
