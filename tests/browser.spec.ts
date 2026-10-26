import { expect, test, type Page } from '@playwright/test';
import campaignSolutions from './fixtures/campaign-solutions.json' with { type: 'json' };
import type { BattleState, Command } from '../src/core/model';

const SAVE_KEY = 'grid-legends-save-v1';

type SavedBattle = {
  round: number;
  units: Record<string, { cell: { x: number; y: number }; hp: number; shield: number; ap: number }>;
};

async function battle(page: Page): Promise<SavedBattle> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.battle, SAVE_KEY);
}

async function clickCell(page: Page, x: number, y: number) {
  const canvas = page.locator('#board canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Plansza nie ma rozmiaru');
  await canvas.click({ position: { x: (40 + x * 70 + 35) * bounds.width / 640, y: (40 + y * 70 + 35) * bounds.height / 640 } });
}

test('plansza renderuje się, a produkcyjne zasoby nie mają 404', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  await expect(page.locator('[data-hero="ignis"]')).toBeVisible();
  await expect(page.locator('[data-hero="kael"]')).toBeVisible();
  await expect(page.locator('[data-hero="lyra"]')).toBeVisible();
  await expect(page.locator('#end-turn')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath('grid-legends.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('ruch z potwierdzeniem wydaje PA i pozostaje po przeładowaniu', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  await page.locator('[data-hero="ignis"]').click();
  await page.locator('[data-mode="move"]').click();
  await clickCell(page, 2, 4);
  await expect(page.locator('#confirm-action')).toBeVisible();
  expect((await battle(page)).units.ignis.cell).toEqual({ x: 2, y: 5 });
  await page.locator('#confirm-action').click();
  await expect.poll(async () => (await battle(page)).units.ignis.cell).toEqual({ x: 2, y: 4 });
  expect((await battle(page)).units.ignis.ap).toBe(1);
  await page.reload();
  await expect(page.locator('#board canvas')).toBeVisible();
  expect((await battle(page)).units.ignis.cell).toEqual({ x: 2, y: 4 });
  expect((await battle(page)).units.ignis.ap).toBe(1);
});

test('Mur Światła korzysta z tego samego modelu co karty bohaterów', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  await page.locator('[data-hero="ignis"]').click();
  await page.locator('[data-mode="shield"]').click();
  await expect(page.locator('#confirm-action')).toBeVisible();
  await page.locator('#confirm-action').click();
  await expect.poll(async () => (await battle(page)).units.ignis.shield).toBe(3);
  expect((await battle(page)).units.ignis.ap).toBe(1);
  await expect(page.locator('[data-mode="shield"]')).toBeDisabled();
});

test('pełna legalna kampania przez interfejs kończy się odzyskaniem Rdzenia', async ({ page }) => {
  test.setTimeout(120000);
  const { freshSave, newRun } = await import('../src/progression');
  const { DIRECTIONS } = await import('../src/core/model');
  const initial = newRun(freshSave());
  initial.settings.reducedMotion = true;
  initial.settings.confirmEnd = false;
  // Only initialize a pristine run and its reward seed. HP, enemies, terrain,
  // cooldowns and every subsequent state transition remain the shipped game.
  initial.run!.seed = 1;
  await page.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem('grid-campaign-started') !== 'yes') {
      localStorage.setItem(key, value); sessionStorage.setItem('grid-campaign-started', 'yes');
    }
  }, { key: SAVE_KEY, value: JSON.stringify(initial) });
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  const commands = campaignSolutions as Command[][];
  const choices = ['teeth', 'lens'];
  for (let room = 0; room < 3; room++) {
    for (const command of commands[room]) {
      await page.waitForFunction(() => !(window as unknown as { __GRID_TEST__: { busy: boolean } }).__GRID_TEST__.busy);
      const before: BattleState = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.battle, SAVE_KEY);
      if (command.type === 'endTurn') {
        await page.locator('#end-turn').click();
      } else {
        await page.locator(`[data-hero="${command.actorId}"]`).click();
        await page.locator(`[data-mode="${command.type}"]`).click();
        if (command.type === 'move') await clickCell(page, command.destination.x, command.destination.y);
        else if (command.type === 'bash') {
          const target = before.units[command.targetId].cell;
          await clickCell(page, target.x, target.y);
        } else if (command.type === 'snare') await clickCell(page, command.cell.x, command.cell.y);
        else if (command.type === 'lightning') await clickCell(page, command.anchor.x, command.anchor.y);
        else if (command.type === 'swap') {
          const first = before.units[command.firstId].cell, second = before.units[command.secondId].cell;
          await clickCell(page, first.x, first.y);
          await clickCell(page, second.x, second.y);
        } else if (command.type === 'shoot') {
          const delta = DIRECTIONS[command.direction];
          const cell = { ...before.units[command.actorId].cell };
          for (let step = 0; step < 7; step++) {
            cell.x += delta.x; cell.y += delta.y;
            const occupied = Object.values(before.units).some(unit => unit.cell.x === cell.x && unit.cell.y === cell.y)
              || Object.values(before.objects).some(object => object.cell.x === cell.x && object.cell.y === cell.y);
            if (occupied || before.board[cell.y]?.[cell.x] === 'wall') break;
          }
          await clickCell(page, cell.x, cell.y);
        }
        await expect(page.locator('#confirm-action')).toBeVisible();
        await page.locator('#confirm-action').click();
      }
      await expect.poll(async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.battle.actionSequence, SAVE_KEY))).toBe(before.actionSequence + 1);
    }
    if (room < 2) {
      await expect(page.locator('[data-reward]')).toHaveCount(3);
      const offersBefore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.offers, SAVE_KEY);
      await page.reload();
      await expect(page.locator('[data-reward]')).toHaveCount(3);
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.offers, SAVE_KEY)).toEqual(offersBefore);
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).profile.echoes, SAVE_KEY)).toBe(room + 1);
      await page.locator(`[data-reward="${choices[room]}"]`).click();
      await expect.poll(async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.room, SAVE_KEY))).toBe(room + 1);
    }
  }
  await expect(page.locator('#again')).toBeVisible();
  const result = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(result.run.status).toBe('won');
  expect(result.run.relics).toEqual(choices);
  expect(result.run.battle.objects.obelisk.hp).toBe(6);
  expect(result.run.battle.units.kael.hp).toBe(6);
  expect(result.profile.echoes).toBe(5);
  expect(result.profile.completedRuns).toBe(1);
  await page.reload();
  await expect(page.locator('#again')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).profile.echoes, SAVE_KEY)).toBe(5);
});

test('zniszczenie Obelisku kończy run i nowa wyprawa resetuje walkę', async ({ page }) => {
  const { freshSave, newRun } = await import('../src/progression');
  const initial = newRun(freshSave());
  initial.settings.reducedMotion = true; initial.settings.confirmEnd = false;
  const state = initial.run!.battle;
  const enemy = state.units['husk-1'];
  enemy.cell = { x: 3, y: 5 };
  state.units = { ignis: state.units.ignis, kael: state.units.kael, lyra: state.units.lyra, [enemy.id]: enemy };
  state.enemyOrder = [enemy.id];
  state.intents = [{ actorId: enemy.id, kind: 'line', direction: 'S', range: 1, damage: 2 }];
  state.objects.obelisk.hp = 2;
  await page.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem('grid-fixture-loaded') !== 'yes') {
      localStorage.setItem(key, value); sessionStorage.setItem('grid-fixture-loaded', 'yes');
    }
  }, { key: SAVE_KEY, value: JSON.stringify(initial) });
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  await page.locator('#end-turn').click();
  await expect(page.locator('#again')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.status, SAVE_KEY)).toBe('lost');
  await page.locator('#again').click();
  await expect.poll(async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.status, SAVE_KEY))).toBe('battle');
  expect((await battle(page)).units.ignis.hp).toBe(12);
  expect((await battle(page)).round).toBe(1);
});

test('klawiatura wybiera bohatera, umiejętność i zatwierdza ruch', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.locator('[data-hero="kael"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('q');
  await expect(page.locator('[data-mode="shoot"]')).toHaveClass(/active/);
  await page.keyboard.press('1');
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#confirm-action')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await battle(page)).units.ignis.cell).toEqual({ x: 2, y: 4 });
  expect((await battle(page)).units.ignis.ap).toBe(1);
});

test('faza wrogów wykonana przez interfejs odpowiada pełnemu forecastowi', async ({ page }) => {
  const { forecast } = await import('../src/core/engine');
  await page.goto('./');
  await expect(page.locator('#board canvas')).toBeVisible();
  const initial = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.battle, SAVE_KEY);
  const expected = forecast(initial).state;
  await page.locator('#end-turn').click();
  await expect(page.locator('#end-confirm')).toBeVisible();
  await page.locator('#end-confirm').click();
  await expect.poll(async () => (await battle(page)).round).toBe(2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).run.battle, SAVE_KEY)).toEqual(expected);
});
