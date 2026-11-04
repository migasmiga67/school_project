import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/model';
import type { PokerState } from '../src/poker-model';
import type { CasinoGamesSnapshot } from '../src/casino-games';

type Snapshot = {
  state: GameState;
  paused: boolean;
  started: boolean;
  casino: { pokerOpen: boolean; poker: PokerState | null; reserve: number };
  camera: { yaw: number; pitch: number; zoom: number; locked: boolean };
  rendering: { view: 'city' | 'casino' | 'poker'; frames: number; calls: number };
  expansion: {casinoOpen:boolean;casinoStation:string|null;casinoGames:CasinoGamesSnapshot};
};
type RouletteFrame = {
  phase: string; status: string; elapsedMs: number; spinId: number; version: number;
  durationMs: number; wallet: number; number: number | null; payout: number; history: number[]; locked: boolean; sameSvg: boolean;
  rotor: string | null; x: string | null; y: string | null;
};
type RouletteObservation = { frames: RouletteFrame[]; done: boolean };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);
}

/** The playable table must keep the actual, live casino scene in view. */
async function expectCasinoView(page: Page, view: 'casino' | 'poker') {
  await expect.poll(async () => (await snapshot(page)).rendering.view).toBe(view);
  await expect(page.locator('#world canvas')).toBeVisible();
  const before = await snapshot(page);
  expect(before.state.interior).toBe('casino');
  expect(before.rendering.calls).toBeGreaterThan(0);
  await expect.poll(async () => (await snapshot(page)).rendering.frames).toBeGreaterThan(before.rendering.frames);
  if (view === 'poker') {
    expect(await page.locator('#poker-root').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight * .43)?.matches('#world canvas'))).toBe(true);
  }
}

async function walkUntil(page: Page, key: string, axis: 'x' | 'z', target: number, increasing: boolean, sprint = false) {
  if (sprint) await page.keyboard.down('Shift');
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => {
      const position = (await snapshot(page)).state.player[axis];
      return increasing ? position >= target : position <= target;
    }, { intervals: [50, 100], timeout: 15000 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
    if (sprint) await page.keyboard.up('Shift');
  }
}

/** Follow the actual sidewalk from the normal spawn; no teleport or engine bypass. */
async function visitCasinoTable(page: Page, capture?: (name: string) => Promise<void>) {
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await page.locator('#casino-nav').click();
  await expect(page.locator('#casino-nav')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await walkUntil(page, 's', 'z', 75, true);
  await walkUntil(page, 'd', 'x', 18.5, true);
  // Approach the door after traversing the sidewalk; a rendered frame can pass
  // between the position read and key-up on a software GPU.
  await walkUntil(page, 'w', 'z', 74.5, false);
  const doorway = (await snapshot(page)).state.player;
  expect(Math.hypot(doorway.x - 20, doorway.z - 74)).toBeLessThan(3);
  await capture?.('casino-entrance.png');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.interior).toBe('casino');
  await expectCasinoView(page, 'casino');
  await capture?.('casino-interior.png');
  await walkUntil(page, 'w', 'z', 2.5, false);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).casino.pokerOpen).toBe(true);
  await expect(page.locator('#poker-buyin')).toBeVisible();
  await expectCasinoView(page, 'poker');
}

async function buyIn(page: Page) {
  expect((await snapshot(page)).state.money).toBe(1250);
  await page.locator('#poker-buyin').click();
  await expect.poll(async () => (await snapshot(page)).casino.poker).not.toBeNull();
  expect((await snapshot(page)).state.money).toBe(1050);
  await expect(page.locator('#poker-seat-0 [data-testid="poker-hole-card"][data-face="up"]')).toHaveCount(2);
  const poker = (await snapshot(page)).casino.poker!;
  if (poker.phase !== 'showdown') {
    for (let seat = 1; seat < 4; seat++) {
      await expect(page.locator(`#poker-seat-${seat} [data-face="down"]`)).toHaveCount(2);
      await expect(page.locator(`#poker-seat-${seat} [data-face="up"]`)).toHaveCount(0);
    }
  }
}

test('można wejść do kasyna, rozegrać pokera, wypłacić żetony i wrócić do miasta', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await visitCasinoTable(page, name => page.screenshot({ path: testInfo.outputPath(name), fullPage: true }).then(() => undefined));
  await page.screenshot({ path: testInfo.outputPath('casino-table-lobby.png'), fullPage: true });
  const seated = await snapshot(page);
  const viewport = page.viewportSize()!;
  const lookFrom = { x: viewport.width / 2, y: viewport.height * .43 };
  await page.mouse.click(lookFrom.x, lookFrom.y);
  await page.mouse.move(lookFrom.x, lookFrom.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(lookFrom.x + 80, lookFrom.y + 15, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => Math.abs((await snapshot(page)).camera.yaw - seated.camera.yaw)).toBeGreaterThan(.05);
  expect((await snapshot(page)).state.player).toEqual(seated.state.player);
  expect((await snapshot(page)).casino.pokerOpen).toBe(true);
  expect((await snapshot(page)).camera.locked).toBe(false);
  // Return the view to the table before dealing. Looking never moves the actor.
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(lookFrom.x, lookFrom.y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await buyIn(page);
  await expectCasinoView(page, 'poker');
  await page.screenshot({ path: testInfo.outputPath('casino-poker.png'), fullPage: true });

  // Choose actions through real controls. Bots retain their own shuffled hands.
  // A fold-win may end before five community cards; both are valid poker results.
  let decisions = 0;
  while ((await snapshot(page)).casino.poker!.phase !== 'showdown') {
    const poker = (await snapshot(page)).casino.poker!;
    if (poker.actor === 0) {
      expect(decisions++).toBeLessThan(16);
      const allIn = page.locator('#poker-allin');
      if (await allIn.isEnabled()) await allIn.click();
      else if (await page.locator('#poker-check').isEnabled()) await page.locator('#poker-check').click();
      else await page.locator('#poker-call').click();
    } else {
      await expect.poll(async () => {
        const next = (await snapshot(page)).casino.poker!;
        return next.phase === 'showdown' || next.actor === 0;
      }, { timeout: 20000, intervals: [100, 200] }).toBe(true);
    }
  }
  const result = (await snapshot(page)).casino.poker!;
  expect(result.pot).toBe(0);
  expect(result.winners.length).toBeGreaterThan(0);
  expect(result.players.reduce((sum, seat) => sum + seat.stack, 0)).toBe(800);
  expect(result.board.length).toBeLessThanOrEqual(5);
  await expect(page.locator('#poker-board [data-testid="poker-board-card"]')).toHaveCount(result.board.length);
  await expect(page.locator('#poker-status')).toHaveText(/\S/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCasinoView(page, 'poker');
  await page.screenshot({ path: testInfo.outputPath('casino-poker-mobile.png'), fullPage: true });
  expect(await page.locator('#poker-root').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator('#poker-board')).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  const refund = result.players[0].stack;
  await page.locator('#poker-leave').click();
  await expect.poll(async () => (await snapshot(page)).casino.pokerOpen).toBe(false);
  await expectCasinoView(page, 'casino');
  expect((await snapshot(page)).casino.reserve).toBe(0);
  expect((await snapshot(page)).state.money).toBe(1050 + refund);
  expect((await snapshot(page)).state.interior).toBe('casino');

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).state.money).toBe(1050 + refund);
  await page.locator('#resume').click();
  await walkUntil(page, 's', 'z', 8, true);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.interior).toBeNull();
  const outside = (await snapshot(page)).state.player;
  expect(Math.hypot(outside.x - 20, outside.z - 75.8)).toBeLessThan(1);
  expect((await snapshot(page)).state.money).toBe(1050 + refund);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('odświeżenie stołu zwraca niewykorzystane żetony dokładnie raz', async ({ page }) => {
  test.setTimeout(90000);
  await visitCasinoTable(page);
  await buyIn(page);
  await expect.poll(async () => {
    const poker = (await snapshot(page)).casino.poker!;
    return poker.actor === 0 || poker.phase === 'showdown';
  }, { timeout: 15000 }).toBe(true);
  let poker = (await snapshot(page)).casino.poker!;
  if (poker.phase !== 'showdown') {
    if (await page.locator('#poker-call').isEnabled()) await page.locator('#poker-call').click();
    else if (await page.locator('#poker-check').isEnabled()) await page.locator('#poker-check').click();
  }
  // Opening the real leave confirmation suspends bot timers, so the persisted
  // reserve cannot race with a payout between the balance read and reload.
  await page.keyboard.press('Escape');
  poker = (await snapshot(page)).casino.poker!;
  if ((await snapshot(page)).casino.pokerOpen) await expect(page.locator('#poker-confirm-leave')).toBeVisible();
  const before = await snapshot(page);
  const expectedWallet = before.state.money + before.casino.reserve;
  expect(before.casino.reserve).toBeGreaterThanOrEqual(0);
  await page.reload();
  await expect(page.locator('#start-game')).toBeVisible();
  await page.locator('#start-game').click();
  await expect.poll(async () => (await snapshot(page)).state.money).toBe(expectedWallet);
  expect((await snapshot(page)).casino.reserve).toBe(0);
  expect((await snapshot(page)).casino.pokerOpen).toBe(false);
  await page.reload();
  await expect(page.locator('#start-game')).toBeVisible();
  await page.locator('#start-game').click();
  expect((await snapshot(page)).state.money).toBe(expectedWallet);
  expect((await snapshot(page)).casino.reserve).toBe(0);
});

test('blackjack i pełny obrót ruletki działają przy osobnych stołach w widocznym kasynie', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('#start-game').click();
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await walkUntil(page, 's', 'z', 75, true);
  await walkUntil(page, 'd', 'x', 18.5, true);
  await walkUntil(page, 'w', 'z', 74.5, false);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.interior).toBe('casino');
  // Normal walking from the entrance reaches the left-hand blackjack station.
  await walkUntil(page, 'a', 'x', -6.8, false);
  await walkUntil(page, 'w', 'z', 3.2, false);
  await page.keyboard.press('e');
  await expect(page.locator('#casino-games-dialog')).toBeVisible();
  await expect(page.locator('#casino-games-title')).toHaveText(/BLACKJACK/);
  await expectCasinoView(page, 'casino');
  await page.locator('#casino-bet').fill('100');
  const before = (await snapshot(page)).state.money;
  await page.locator('#blackjack-deal').click();
  await expect.poll(async () => (await snapshot(page)).expansion.casinoGames.version).toBeGreaterThan(0);
  let hand = (await snapshot(page)).expansion.casinoGames.blackjack;
  if (hand.status === 'playing') {
    expect((await snapshot(page)).state.money).toBe(before - 100);
    expect(hand.dealer[1].rank).toBe(0);
    await page.locator('#blackjack-stand').click();
  }
  await expect.poll(async () => (await snapshot(page)).expansion.casinoGames.blackjack.status).toBe('settled');
  hand = (await snapshot(page)).expansion.casinoGames.blackjack;
  expect((await snapshot(page)).state.money).toBe(before - 100 + hand.payout);
  expect(hand.dealer.every(card => card.rank > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('blackjack-casino.png'), fullPage: true });
  await page.locator('#casino-games-close').click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  // Cross the open south side, clear of the physical poker table collider.
  await walkUntil(page, 'd', 'x', 6.8, true);
  await page.keyboard.press('e');
  await expect(page.locator('#casino-games-title')).toHaveText(/RULETKA/);
  await expect(page.locator('#roulette-wheel svg')).toBeVisible();
  await expect(page.locator('.roulette-pocket')).toHaveCount(37);
  const numbers = await page.locator('.roulette-pocket').evaluateAll(pockets =>
    pockets.map(pocket => Number(pocket.getAttribute('data-pocket-number'))).sort((a, b) => a - b));
  expect(numbers).toEqual(Array.from({ length: 37 }, (_, number) => number));
  await page.locator('#casino-bet').fill('20');
  await page.locator('#roulette-choice').selectOption('straight');
  await page.locator('#roulette-number').fill('0');
  await page.screenshot({ path: testInfo.outputPath('roulette-ready.png'), fullPage: true });
  const prior = await snapshot(page);
  // Record DOM poses passively inside the page. CDP calls and screenshots must
  // not determine whether a short dropping or settling phase is observed.
  await page.evaluate(() => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot; __ROULETTE_QA__: RouletteObservation };
    const observation: RouletteObservation = { frames: [], done: false };
    scope.__ROULETTE_QA__ = observation;
    const originalSvg = document.querySelector('#roulette-wheel svg');
    const observe = () => {
      const wheel = document.querySelector<HTMLElement>('#roulette-wheel');
      const snapshot = scope.__NEON_TEST__;
      const state = snapshot.expansion.casinoGames.roulette;
      if (wheel && state.status !== 'idle' && wheel.dataset.status === state.status) {
        observation.frames.push({
          phase: wheel.dataset.phase!, status: state.status, elapsedMs: state.elapsedMs,
          spinId: state.spin!.id, durationMs: state.spin!.durationMs, version: snapshot.expansion.casinoGames.version,
          wallet: snapshot.state.money, number: state.number, payout: state.payout, history: [...state.history],
          locked: ['#casino-bet', '#roulette-choice', '#roulette-number', '#roulette-spin']
            .every(selector => document.querySelector<HTMLInputElement>(selector)?.disabled === true),
          sameSvg: originalSvg === wheel.querySelector('svg'),
          rotor: wheel.querySelector('.roulette-rotor')!.getAttribute('transform'),
          x: wheel.querySelector('.roulette-ball')!.getAttribute('cx'),
          y: wheel.querySelector('.roulette-ball')!.getAttribute('cy'),
        });
        if (state.status === 'settled') { observation.done = true; return; }
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  const startedAt = Date.now();
  await page.locator('#roulette-spin').click();
  await page.screenshot({ path: testInfo.outputPath('roulette-spinning.png'), fullPage: true });
  const frames = await page.evaluate(async () => {
    const observation = (window as unknown as { __ROULETTE_QA__: RouletteObservation }).__ROULETTE_QA__;
    while (!observation.done) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return observation.frames;
  });
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(6800);
  await expect(page.locator('#roulette-wheel')).toHaveAttribute('data-status', 'settled');
  const phaseOrder = ['accelerating', 'spinning', 'slowing', 'dropping', 'settling', 'settled'];
  const observedPhases = [...new Set(frames.map(frame => frame.phase))];
  expect(observedPhases).toContain('spinning');
  expect(observedPhases).toContain('slowing');
  expect(observedPhases.at(-1)).toBe('settled');
  expect(frames.every((frame, index) => index === 0
    || phaseOrder.indexOf(frame.phase) >= phaseOrder.indexOf(frames[index - 1].phase))).toBe(true);
  const moving = frames.filter(frame => frame.status === 'spinning');
  expect(new Set(moving.map(frame => frame.rotor)).size).toBeGreaterThan(5);
  expect(new Set(moving.map(frame => `${frame.x},${frame.y}`)).size).toBeGreaterThan(5);
  expect(moving.every(frame => frame.sameSvg && frame.locked && frame.number === null && frame.payout === 0
    && frame.durationMs === 7200 && frame.wallet === prior.state.money - 20
    && frame.history.length === prior.expansion.casinoGames.roulette.history.length)).toBe(true);
  expect(new Set(moving.map(frame => frame.spinId)).size).toBe(1);
  expect(new Set(moving.map(frame => frame.version)).size).toBe(1);
  await testInfo.attach('roulette-motion-observations', { body: JSON.stringify(frames, null, 2), contentType: 'application/json' });
  // Reconstruct the pocket from the rendered rotor matrix and ball coordinates.
  // This deliberately does not call the shared motion or outcome helpers.
  const visiblePocket = await page.locator('#roulette-wheel svg').evaluate(element => {
    const rotor = element.querySelector<SVGGElement>('.roulette-rotor')!;
    const matrix = rotor.transform.baseVal.consolidate()!.matrix;
    const wheelAngle = Math.atan2(matrix.b, matrix.a);
    const ball = element.querySelector<SVGCircleElement>('.roulette-ball')!;
    const ballAngle = Math.atan2(ball.cx.baseVal.value, -ball.cy.baseVal.value);
    const turn = Math.PI * 2;
    const relative = ((ballAngle - wheelAngle) % turn + turn) % turn;
    const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    return order[Math.round(relative / (turn / 37)) % 37];
  });
  const settled = await snapshot(page);
  const outcome = settled.expansion.casinoGames.roulette;
  expect(outcome.number).toBe(visiblePocket);
  expect(outcome.payout).toBe(visiblePocket === 0 ? 720 : 0);
  expect(outcome.history).toEqual([visiblePocket, ...prior.expansion.casinoGames.roulette.history].slice(0, 12));
  expect(settled.state.money).toBe(prior.state.money - 20 + outcome.payout);
  await expect(page.locator('#roulette-result strong')).toHaveText(String(visiblePocket));
  await expect(page.locator('#roulette-message')).toContainText(`Wypadło ${visiblePocket}`);
  await expect(page.locator('#roulette-payout')).toHaveText(visiblePocket === 0 ? '$720' : '$0');
  await expect(page.locator('#roulette-net')).toHaveText(visiblePocket === 0 ? '+$700' : '−$20');
  await expect(page.locator('.roulette-pocket-winner')).toHaveCount(1);
  await expect(page.locator('.roulette-pocket-winner')).toHaveAttribute('data-pocket-number', String(visiblePocket));
  await expect(page.locator('.roulette-history span').first()).toHaveText(String(visiblePocket));
  await expect(page.locator('#roulette-spin')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('roulette-settled.png'), fullPage: true });
  await expect.poll(async () => (await snapshot(page)).rendering.frames).toBeGreaterThan(settled.rendering.frames + 5);
  const afterSettlement = await snapshot(page);
  expect(afterSettlement.expansion.casinoGames.version).toBe(settled.expansion.casinoGames.version);
  expect(afterSettlement.expansion.casinoGames.roulette.history).toEqual(outcome.history);
  expect(afterSettlement.state.money).toBe(settled.state.money);

  // Check mobile controls while the first wager is already settled, so layout
  // assertions do not compete with the animation's short phases.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of ['#casino-games-close', '#casino-bet', '#roulette-choice', '#roulette-number', '#roulette-spin']) {
    await expect(page.locator(control)).toBeInViewport();
  }
  expect(await page.locator('.casino-games-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('roulette-mobile.png'), fullPage: true });

  // A second real wager isolates close/reopen continuity from visual QA. The
  // probe only records normal clicks; it never sends actions or changes state.
  type ContinuityProbe = { accepted?: { id: number; elapsed: number }; closed?: { id: number; elapsed: number } };
  await page.evaluate(() => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot; __ROULETTE_CONTINUITY__: ContinuityProbe };
    const probe: ContinuityProbe = {};
    scope.__ROULETTE_CONTINUITY__ = probe;
    const record = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const state = scope.__NEON_TEST__.expansion.casinoGames.roulette;
      if (target.closest('#roulette-spin') && state.spin) probe.accepted = { id: state.spin.id, elapsed: state.elapsedMs };
      if (target.closest('#casino-games-close') && state.spin) probe.closed = { id: state.spin.id, elapsed: state.elapsedMs };
      if (probe.accepted && probe.closed) document.removeEventListener('click', record);
    };
    document.addEventListener('click', record);
  });
  const secondStartedAt = Date.now();
  await page.locator('#roulette-spin').click();
  await page.locator('#casino-games-close').click();
  await page.keyboard.press('e');
  const reopened = await page.evaluate(() => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot; __ROULETTE_CONTINUITY__: ContinuityProbe };
    return { probe: scope.__ROULETTE_CONTINUITY__, state: scope.__NEON_TEST__,
      open: document.querySelector('#casino-games-title')?.textContent?.includes('RULETKA') === true };
  });
  expect(reopened.open).toBe(true);
  expect(reopened.probe.accepted?.id).toBe(outcome.spin!.id + 1);
  expect(reopened.probe.closed?.id).toBe(reopened.probe.accepted!.id);
  const continuing = reopened.state.expansion.casinoGames.roulette;
  expect(continuing.spin!.id).toBe(reopened.probe.accepted!.id);
  expect(continuing.elapsedMs).toBeGreaterThan(reopened.probe.closed!.elapsed);
  expect(['spinning', 'settled']).toContain(continuing.status);
  if (continuing.status === 'settled') expect(Date.now() - secondStartedAt).toBeGreaterThanOrEqual(6800);
  else expect(reopened.state.state.money).toBe(settled.state.money - 20);
  const completed = await page.evaluate(async () => {
    const scope = window as unknown as { __NEON_TEST__: Snapshot };
    while (scope.__NEON_TEST__.expansion.casinoGames.roulette.status !== 'settled') {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return scope.__NEON_TEST__;
  });
  expect(completed.state.money).toBe(settled.state.money - 20 + completed.expansion.casinoGames.roulette.payout);
  expect(completed.expansion.casinoGames.roulette.history).toHaveLength(outcome.history.length + 1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#casino-games-dialog')).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  expect(errors).toEqual([]);
});
