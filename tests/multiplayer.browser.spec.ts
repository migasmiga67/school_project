import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import type { GameState } from '../src/model';
import type { MultiplayerState, RoomSnapshot } from '../src/multiplayer-model';
import type { PokerState } from '../src/poker-model';

const GAME_URL = process.env.NEON_BASE_URL || 'http://127.0.0.1:5185/school_project/';

type Snapshot = {
  state: GameState;
  paused: boolean;
  started: boolean;
  online: MultiplayerState;
  casino: { pokerOpen: boolean; poker: PokerState | null; reserve: number };
  navigation: { remotePlayers: number; route: { x: number; z: number }[] };
  rendering: { remotePlayers: number; view: 'city' | 'casino' | 'poker'; frames: number };
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __NEON_TEST__: Snapshot }).__NEON_TEST__);
}

async function room(page: Page): Promise<RoomSnapshot> {
  const state = (await snapshot(page)).online;
  expect(state.status).toBe('online');
  expect(state.snapshot).not.toBeNull();
  return state.snapshot!;
}

type Pair = { host: Page; guest: Page; contexts: BrowserContext[]; errors: string[]; failed: string[] };
interface PairOptions {
  preparePage?: (page: Page, role: 'host' | 'guest') => Promise<void>;
  guestJoinTimeoutMs?: number;
}

async function captureFailure(contexts: BrowserContext[], testInfo: TestInfo) {
  await Promise.allSettled(contexts.map(async (context, index) => {
    const page = context.pages()[0];
    if (!page || page.isClosed()) return;
    await page.screenshot({ path: testInfo.outputPath(`online-failure-${index}.png`), fullPage: true });
    await testInfo.attach(`online-state-${index}`, { body: JSON.stringify(await snapshot(page), null, 2), contentType: 'application/json' });
  }));
}

async function createPair(browser: Browser, testInfo: TestInfo, options: PairOptions = {}): Promise<Pair> {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [], failed: string[] = [];
  const open = async (name: string, role: 'host' | 'guest') => {
    const context = await browser.newContext({ baseURL: GAME_URL, viewport: { width: 960, height: 720 } });
    contexts.push(context);
    // A real local signaling service negotiates two real WebRTC data channels.
    // The production transport only reads this override on a loopback origin.
    await context.addInitScript(() => {
      Object.defineProperty(window, '__NEON_SIGNALING__', {
        value: { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false, config: {
          iceServers: [{ urls: 'turn:127.0.0.1:3478?transport=tcp', username: 'neon', credential: 'neon-local-test' }],
          iceTransportPolicy: 'relay',
        } },
      });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('response', response => {
      if (response.status() >= 400 && /\/school_project\/(?:assets\/|favicon)/.test(response.url())) {
        failed.push(`${response.status()} ${response.url()}`);
      }
    });
    await options.preparePage?.(page, role);
    await page.goto('./');
    await expect(page.locator('#intro-online')).toBeVisible();
    await page.locator('#intro-online').click();
    await page.locator('#online-name').fill(name);
    return page;
  };
  try {
    const host = await open('Alicja', 'host');
    await host.locator('#online-create').click();
    await expect.poll(async () => (await snapshot(host)).online.status, { timeout: 20000 }).toBe('online');
    await expect(host.locator('#online-code')).toHaveText(/^[A-Z2-9]{8}$/);
    const code = (await host.locator('#online-code').innerText()).trim();
    await host.locator('#online-enter').click();
    await expect.poll(async () => (await snapshot(host)).started).toBe(true);

    const guest = await open('Borys', 'guest');
    await guest.locator('#online-room').fill(code);
    await guest.locator('#online-join').click();
    await expect.poll(async () => (await snapshot(guest)).online.status, { timeout: options.guestJoinTimeoutMs ?? 20000 }).toBe('online');
    await guest.locator('#online-enter').click();
    await expect.poll(async () => (await snapshot(guest)).started).toBe(true);
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).members.length).toBe(2);
      await expect.poll(async () => (await snapshot(page)).rendering.remotePlayers).toBe(1);
    }
    expect((await room(host)).code).toBe(code);
    expect((await room(guest)).code).toBe(code);
    expect((await room(host)).hostId).toBe((await room(host)).youId);
    expect((await room(guest)).youId).not.toBe((await room(host)).youId);
    return { host, guest, contexts, errors, failed };
  } catch (error) {
    await captureFailure(contexts, testInfo);
    await Promise.allSettled(contexts.map(context => context.close()));
    throw error;
  }
}

async function walkUntil(page: Page, key: string, axis: 'x' | 'z', target: number, increasing: boolean) {
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => {
      const position = (await snapshot(page)).state.player[axis];
      return increasing ? position >= target : position <= target;
    }, { intervals: [50, 100], timeout: 20000 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

async function visitCasino(page: Page) {
  await page.bringToFront();
  if ((await snapshot(page)).paused) await page.locator('#resume').click();
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.player.mode).toBe('foot');
  await walkUntil(page, 's', 'z', 75, true);
  await walkUntil(page, 'd', 'x', 18.5, true);
  await walkUntil(page, 'w', 'z', 74.5, false);
  const doorway = (await snapshot(page)).state.player;
  expect(Math.hypot(doorway.x - 20, doorway.z - 74)).toBeLessThan(3);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).state.interior).toBe('casino');
  await walkUntil(page, 'w', 'z', 2.5, false);
  await page.keyboard.press('e');
  await expect(page.locator('#poker-buyin')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).casino.pokerOpen).toBe(true);
  await expect.poll(async () => (await snapshot(page)).rendering.view).toBe('poker');
}

async function leaveHostRoom(host: Page) {
  await host.bringToFront();
  if ((await snapshot(host)).paused) await host.locator('#resume').click();
  await host.locator('#online').click();
  await host.locator('#online-leave').click();
  await host.locator('#online-confirm-leave').click();
  await expect.poll(async () => (await snapshot(host)).online.status).toBe('offline');
}

test('pokój przyjmuje gracza, gdy prawdziwa odpowiedź WebRTC dociera po 18 sekundach', async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const delayMs = 18000;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const answers: {
    heldAt: number; forwardedAt?: number; guestStatus?: string;
    guestSignaling?: string; guestRelayConfigured?: boolean; hostMembers?: number; progressMessage?: string; candidatesHeld: number; error?: string;
  }[] = [];
  let hostPage: Page | null = null, guestPage: Page | null = null, pair: Pair | undefined;
  try {
    pair = await createPair(browser, testInfo, {
      guestJoinTimeoutMs: 40000,
      preparePage: async (page, role) => {
        if (role === 'guest') { guestPage = page; return; }
        hostPage = page;
        await page.routeWebSocket('ws://127.0.0.1:9000/**', socket => {
          // Connect to the real PeerServer. Preserve SDP/candidate ordering:
          // a later trickled candidate cannot overtake its delayed SDP answer.
          const server = socket.connectToServer();
          const blocked = new Map<string, { candidates: (string | Buffer)[]; answer: typeof answers[number] }>();
          socket.onMessage(message => {
            let type = '', connectionId = '';
            try {
              const frame = JSON.parse(typeof message === 'string' ? message : message.toString());
              type = frame.type; connectionId = frame.payload?.connectionId ?? '';
            } catch { /* Forward non-JSON frames unchanged. */ }
            const pending = blocked.get(connectionId);
            if (type === 'CANDIDATE' && pending) { pending.candidates.push(message); pending.answer.candidatesHeld++; return; }
            if (type !== 'ANSWER') { server.send(message); return; }
            const answer: typeof answers[number] = { heldAt: Date.now(), candidatesHeld: 0 }; answers.push(answer);
            const outgoing = { candidates: [] as (string | Buffer)[], answer }; blocked.set(connectionId, outgoing);
            const timer = setTimeout(async () => {
              timers.delete(timer);
              // Read the actual state while the answer is still held, beyond
              // the former 7s host prune and 15s guest connection timeout.
              try {
                const [guest, host] = await Promise.all([snapshot(guestPage!), snapshot(hostPage!)]);
                answer.guestStatus = guest.online.status; answer.guestSignaling = guest.online.signaling;
                answer.guestRelayConfigured = guest.online.relayConfigured;
                answer.hostMembers = host.online.snapshot?.members.length;
                answer.progressMessage = await guestPage!.locator('#online-connection-message').evaluateAll(nodes => nodes[0]?.textContent ?? '');
              } catch (error) { answer.error = String(error); }
              try {
                answer.forwardedAt = Date.now(); server.send(message);
                for (const candidate of outgoing.candidates) server.send(candidate);
                blocked.delete(connectionId);
              }
              catch (error) { answer.error = String(error); }
            }, delayMs);
            timers.add(timer);
          });
        });
      },
    });
    await testInfo.attach('delayed-real-webrtc-answer', { body: JSON.stringify(answers, null, 2), contentType: 'application/json' });
    expect(answers).toHaveLength(1);
    const answer = answers[0];
    expect(answer.error).toBeUndefined();
    expect(answer.forwardedAt).toBeDefined();
    expect(answer.forwardedAt! - answer.heldAt).toBeGreaterThanOrEqual(delayMs);
    expect(answer.forwardedAt! - answer.heldAt).toBeLessThan(30000);
    expect(answer).toMatchObject({ guestStatus: 'connecting', guestSignaling: 'online', guestRelayConfigured: true, hostMembers: 1 });
    expect(answer.progressMessage).toContain('gospodarzem');
    for (const page of [pair.host, pair.guest]) expect((await room(page)).members).toHaveLength(2);

    // Successful negotiation must carry actual game data, not just open sockets.
    await pair.guest.bringToFront();
    if ((await snapshot(pair.guest)).paused) await pair.guest.locator('#resume').click();
    await pair.guest.keyboard.press('e');
    await expect.poll(async () => (await snapshot(pair!.guest)).state.player.mode).toBe('foot');
    const guestId = (await room(pair.guest)).youId, startX = (await snapshot(pair.guest)).state.player.x;
    await walkUntil(pair.guest, 'd', 'x', startX + 2, true);
    await expect.poll(async () => (await room(pair!.host)).members.find(member => member.id === guestId)?.pose.x).toBeGreaterThan(startX + 1.5);
    expect(pair.errors).toEqual([]); expect(pair.failed).toEqual([]);
  } catch (error) {
    await testInfo.attach('delayed-answer-failure', { body: JSON.stringify(answers, null, 2), contentType: 'application/json' });
    if (pair) await captureFailure(pair.contexts, testInfo);
    throw error;
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await Promise.allSettled(pair?.contexts.map(context => context.close()) ?? []);
  }
});

test('dwie przeglądarki widzą ruch graczy, lokalną pauzę i zakończenie pokoju', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const pair = await createPair(browser, testInfo);
  const { host, guest } = pair;
  try {
    const hostId = (await room(host)).youId, guestId = (await room(guest)).youId;
    await host.bringToFront();
    await host.keyboard.press('e');
    await expect.poll(async () => (await snapshot(host)).state.player.mode).toBe('foot');
    await walkUntil(host, 'd', 'x', 5.3, true);
    const hostPosition = (await snapshot(host)).state.player;
    await expect.poll(async () => {
      const remote = (await room(guest)).members.find(member => member.id === hostId)!.pose;
      return Math.hypot(remote.x - hostPosition.x, remote.z - hostPosition.z);
    }).toBeLessThan(.35);
    await guest.screenshot({ path: testInfo.outputPath('online-city-guest.png'), fullPage: true });

    await host.keyboard.press('Escape');
    await expect.poll(async () => (await snapshot(host)).paused).toBe(true);
    const frozenHost = (await snapshot(host)).state.player;
    await guest.bringToFront();
    if ((await snapshot(guest)).paused) await guest.locator('#resume').click();
    await guest.keyboard.press('e');
    await expect.poll(async () => (await snapshot(guest)).state.player.mode).toBe('foot');
    const beforeGuest = (await snapshot(guest)).state.player.z;
    await walkUntil(guest, 'w', 'z', beforeGuest - 2.2, false);
    await expect.poll(async () => (await room(host)).members.find(member => member.id === guestId)!.pose.z).toBeLessThan(beforeGuest - 1.5);
    expect((await snapshot(host)).state.player).toEqual(frozenHost);
    expect((await snapshot(host)).paused).toBe(true);

    await leaveHostRoom(host);
    await expect.poll(async () => (await snapshot(guest)).online.status, { timeout: 20000 }).not.toBe('online');
    for (const page of [host, guest]) {
      await expect.poll(async () => (await snapshot(page)).rendering.remotePlayers).toBe(0);
      expect((await snapshot(page)).state.money).toBe(1250);
      expect((await snapshot(page)).state.mission.active).toBe(true);
      expect((await snapshot(page)).casino.pokerOpen).toBe(false);
    }
    expect(pair.errors).toEqual([]);
    expect(pair.failed).toEqual([]);
  } catch (error) {
    await captureFailure(pair.contexts, testInfo);
    throw error;
  } finally {
    await Promise.allSettled(pair.contexts.map(context => context.close()));
  }
});

test('ekipa zalicza wspólną trasę, widzi GPS i otrzymuje nagrodę tylko w portfelu online', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const pair = await createPair(browser, testInfo);
  const { host, guest } = pair;
  try {
    await host.bringToFront();
    if ((await snapshot(host)).paused) await host.locator('#resume').click();
    await expect(host.locator('#crew-start')).toBeEnabled();
    await expect(guest.locator('#crew-start')).toBeDisabled();
    await host.locator('#crew-start').click();
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).challenge.status).toBe('active');
      expect((await room(page)).challenge.target).toEqual({ x: 0, z: 40 });
      expect((await room(page)).challenge.eligible).toBe(true);
      await expect(page.locator('#mission-title')).toContainText('Nocny przerzut');
      await expect.poll(async () => (await snapshot(page)).navigation.remotePlayers).toBe(1);
      await expect.poll(async () => (await snapshot(page)).navigation.route.length).toBeGreaterThan(1);
    }

    // The host reaches the first stop using normal controls, then pauses locally.
    await host.keyboard.press('e');
    await expect.poll(async () => (await snapshot(host)).state.player.mode).toBe('foot');
    await walkUntil(host, 'w', 'z', 40.5, false);
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).challenge.checkpoint).toBe(1);
      expect((await room(page)).challenge.target).toEqual({ x: 40, z: 40 });
    }
    const hostId = (await room(host)).youId, guestId = (await room(guest)).youId;
    expect((await room(host)).challenge.contributors).toContain(hostId);
    await host.keyboard.press('Escape');
    await expect.poll(async () => (await snapshot(host)).paused).toBe(true);
    const pausedPosition = (await snapshot(host)).state.player;
    const beforeGuestWalk = (await room(host)).challenge.remainingMs;

    // The guest contributes the remaining stops; the host's pause never pauses
    // the room or its deadline, and progress is replicated to both clients.
    await guest.bringToFront();
    if ((await snapshot(guest)).paused) await guest.locator('#resume').click();
    await guest.keyboard.press('e');
    await expect.poll(async () => (await snapshot(guest)).state.player.mode).toBe('foot');
    await walkUntil(guest, 'w', 'z', 40.5, false);
    await expect.poll(async () => (await room(host)).challenge.remainingMs).toBeLessThan(beforeGuestWalk - 1000);
    expect((await snapshot(host)).state.player).toEqual(pausedPosition);
    expect((await snapshot(host)).paused).toBe(true);
    await walkUntil(guest, 'd', 'x', 40, true);
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).challenge.checkpoint).toBe(2);
      expect((await room(page)).challenge.target).toEqual({ x: 40, z: 80 });
    }
    await guest.screenshot({ path: testInfo.outputPath('crew-route-gps.png'), fullPage: true });
    await walkUntil(guest, 's', 'z', 80, true);
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).challenge.status).toBe('completed');
      await expect.poll(async () => (await room(page)).wallet).toBe(1550);
      const completed = (await room(page)).challenge;
      expect(completed.checkpoint).toBe(3);
      expect(completed.contributors).toEqual(expect.arrayContaining([hostId, guestId]));
      expect(completed.cooldownMs).toBeGreaterThan(0);
      expect(completed.target).toBeNull();
      await expect(page.locator('#crew-start')).toBeDisabled();
      const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-coast-profile-v1') ?? '{}'));
      expect(profile.money).toBe(1250);
    }
    // More accepted poses and host ticks must not pay the completed run again.
    const completedAt = (await room(guest)).worldTime;
    await walkUntil(guest, 'a', 'x', 38, false);
    await expect.poll(async () => (await room(guest)).worldTime).toBeGreaterThan(completedAt + .5);
    expect((await room(host)).wallet + (await room(guest)).wallet).toBe(3100);

    await leaveHostRoom(host);
    await expect.poll(async () => (await snapshot(guest)).online.status).not.toBe('online');
    for (const page of [host, guest]) {
      expect((await snapshot(page)).state.money).toBe(1250);
      expect((await snapshot(page)).state.mission.active).toBe(true);
      await expect.poll(async () => (await snapshot(page)).navigation.remotePlayers).toBe(0);
    }
    expect(pair.errors).toEqual([]);
    expect(pair.failed).toEqual([]);
  } catch (error) {
    await captureFailure(pair.contexts, testInfo);
    throw error;
  } finally {
    await Promise.allSettled(pair.contexts.map(context => context.close()));
  }
});

test('anulowanie łączenia zamyka panel i pozwala ponowić próbę bez zmiany gry solo', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__NEON_SIGNALING__', {
      value: { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false, config: { iceServers: [] } },
    });
  });
  let releaseSignaling!: () => void;
  const signalingHeld = new Promise<void>(resolve => { releaseSignaling = resolve; });
  // Leave the signaling socket open without forwarding a handshake. HTTP
  // fallback is held as well, so a fast "room missing" reply cannot race Esc.
  await page.routeWebSocket('ws://127.0.0.1:9000/**', () => {});
  await page.route('http://127.0.0.1:9000/**', async route => {
    await signalingHeld;
    await route.abort();
  });
  try {
    await page.goto('./');
    await page.locator('#start-game').click();
    const before = (await snapshot(page)).state;
    await page.locator('#online').click();
    await page.locator('#online-name').fill('Alicja');
    await page.locator('#online-room').fill('ABCDEFGH');
    await page.locator('#online-join').click();
    await expect.poll(async () => (await snapshot(page)).online.status).toBe('connecting');
    await expect(page.locator('#online-relay-status')).toBeVisible();
    await expect(page.locator('#online-relay-status')).toContainText('połączenia bezpośredniego');
    await expect(page.locator('#online-cancel-connect')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#online-dialog')).toHaveCount(0);
    await expect.poll(async () => (await snapshot(page)).online.status).toBe('offline');
    expect((await snapshot(page)).state.player).toEqual(before.player);
    expect((await snapshot(page)).state.money).toBe(1250);
    await expect(page.locator('#online')).toBeFocused();

    await page.locator('#online').click();
    await expect(page.locator('#online-join')).toBeEnabled();
    await page.locator('#online-join').click();
    await expect.poll(async () => (await snapshot(page)).online.status).toBe('connecting');
    await page.locator('#online-cancel-connect').click();
    await expect(page.locator('#online-dialog')).toHaveCount(0);
    await expect.poll(async () => (await snapshot(page)).online.status).toBe('offline');
    releaseSignaling();
    await expect.poll(async () => (await snapshot(page)).rendering.frames).toBeGreaterThan(5);
    expect((await snapshot(page)).online.status).toBe('offline');
    expect((await snapshot(page)).state.money).toBe(1250);
    expect((await snapshot(page)).state.mission.active).toBe(true);
  } finally {
    releaseSignaling();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('dwóch graczy rozgrywa wspólne rozdanie z prywatnymi kartami i poprawną wypłatą', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const pair = await createPair(browser, testInfo);
  const { host, guest } = pair;
  try {
    await visitCasino(host);
    await visitCasino(guest);
    await host.locator('#poker-buyin').click();
    await expect.poll(async () => (await room(host)).seated).toBe(true);
    expect((await room(host)).wallet).toBe(1050);
    await expect(host.locator('#poker-next-hand')).toBeDisabled();
    await guest.locator('#poker-buyin').click();
    await expect.poll(async () => (await room(guest)).seated).toBe(true);
    expect((await room(guest)).wallet).toBe(1050);
    await expect(host.locator('#poker-next-hand')).toBeEnabled();
    await host.locator('#poker-next-hand').click();
    for (const page of [host, guest]) {
      await expect.poll(async () => (await room(page)).poker?.phase).toBe('preflop');
      const poker = (await room(page)).poker!;
      expect(poker.deck).toEqual([]);
      expect(poker.seed).toBe(0);
      expect(poker.players[0].hole).toHaveLength(2);
      expect(poker.players[0].hole.every(card => card.rank >= 2 && card.rank <= 14)).toBe(true);
      const opponent = poker.players.slice(1).find(seat => seat.stack + seat.contributed > 0)!;
      expect(opponent.hole).toHaveLength(2);
      expect(opponent.hole.every(card => card.rank === 0)).toBe(true);
      expect(poker.players.filter(seat => seat.hole.length > 0)).toHaveLength(2);
      expect(poker.players.reduce((sum, seat) => sum + seat.stack, poker.pot)).toBe(400);
      await expect(page.locator('#poker-seat-0 [data-face="up"]')).toHaveCount(2);
    }
    await host.screenshot({ path: testInfo.outputPath('online-poker-host.png'), fullPage: true });
    await guest.screenshot({ path: testInfo.outputPath('online-poker-guest.png'), fullPage: true });

    // Only real players act; the inactive browser must not expose enabled actions.
    for (let decisions = 0; decisions < 8; decisions++) {
      const current = (await room(host)).poker!;
      if (current.phase === 'showdown') break;
      await expect.poll(async () => {
        const a = await room(host), b = await room(guest);
        return a.tableVersion === b.tableVersion;
      }).toBe(true);
      const a = await room(host), b = await room(guest);
      const acting = a.poker!.actor === 0 ? host : guest;
      const inactive = acting === host ? guest : host;
      expect([a.poker!.actor === 0, b.poker!.actor === 0].filter(Boolean)).toHaveLength(1);
      await expect(inactive.locator('#poker-allin')).toBeDisabled();
      await expect(acting.locator('#poker-allin')).toBeEnabled();
      const version = a.tableVersion;
      await acting.locator('#poker-allin').click();
      await expect.poll(async () => (await room(host)).tableVersion).toBeGreaterThan(version);
    }
    await expect.poll(async () => (await room(host)).poker?.phase).toBe('showdown');
    await expect.poll(async () => (await room(guest)).poker?.phase).toBe('showdown');
    const hostResult = (await room(host)).poker!, guestResult = (await room(guest)).poker!;
    expect(hostResult.board).toHaveLength(5);
    expect(guestResult.board).toEqual(hostResult.board);
    expect(hostResult.pot).toBe(0);
    expect(hostResult.players.reduce((sum, seat) => sum + seat.stack, 0)).toBe(400);
    expect(hostResult.payouts.reduce((sum, payout) => sum + payout, 0)).toBe(400);
    const hostRefund = hostResult.players[0].stack, guestRefund = guestResult.players[0].stack;
    await host.locator('#poker-leave').click();
    await guest.locator('#poker-leave').click();
    await expect.poll(async () => (await room(host)).wallet).toBe(1050 + hostRefund);
    await expect.poll(async () => (await room(guest)).wallet).toBe(1050 + guestRefund);
    expect((await room(host)).wallet + (await room(guest)).wallet).toBe(2500);
    for (const page of [host, guest]) {
      expect((await snapshot(page)).casino.pokerOpen).toBe(false);
      expect((await snapshot(page)).casino.reserve).toBe(0);
      expect((await snapshot(page)).state.interior).toBe('casino');
      const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-coast-profile-v1') ?? '{}'));
      expect(profile.money).toBe(1250);
    }
    expect(pair.errors).toEqual([]);
    expect(pair.failed).toEqual([]);
  } catch (error) {
    await captureFailure(pair.contexts, testInfo);
    throw error;
  } finally {
    await Promise.allSettled(pair.contexts.map(context => context.close()));
  }
});
