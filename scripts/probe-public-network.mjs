import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const started = Date.now();
const url = 'http://127.0.0.1:5185/school_project/';
const report = { started: new Date(started).toISOString(), stage: 'server', success: false, pages: [] };
const contexts = [];
let browser;
const server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { env: { ...process.env, PORT: '5185' }, stdio: 'ignore' });
server.on('error', () => {});
// Keep the process bounded even if a browser IPC cleanup stalls.
const hardStop = setTimeout(() => { server.kill('SIGKILL'); process.exit(1); }, 98000);
hardStop.unref();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = (promise, ms, message) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
};
const redact = value => String(value).replace(/(?:https?|wss?):\/\/[^\s"]+/g, '[endpoint]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[address]');
const mark = (level, title, message) => console.log(`::${level} title=${title}::${String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
const status = page => page.evaluate(() => {
  const state = window.__NEON_TEST__.online;
  return { status: state.status, signaling: state.signaling, message: state.message, members: state.snapshot?.members.length ?? 0 };
});

async function openPlayer(role) {
  const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
  contexts.push(context);
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.__PUBLIC_ICE__ = [];
    const service = value => {
      const match = String(value).match(/(?:eu-0|us-0)\.turn\.peerjs\.com(?::\d+)?|stun\.l\.google\.com(?::\d+)?/);
      return match?.[0] ?? 'configured-ice-service';
    };
    window.RTCPeerConnection = class extends Native {
      constructor(configuration, constraints) {
        super({ ...configuration, iceTransportPolicy: 'relay' }, constraints);
        // Credentials remain private to this page and never enter the report.
        const entry = { pc: this, servers: configuration?.iceServers ?? [], errors: [], candidates: [], states: [] };
        window.__PUBLIC_ICE__.push(entry);
        this.addEventListener('icecandidate', event => {
          if (event.candidate) entry.candidates.push({ type: event.candidate.type, protocol: event.candidate.protocol });
        });
        this.addEventListener('icecandidateerror', event => entry.errors.push({ service: service(event.url), code: event.errorCode }));
        for (const name of ['connectionstatechange', 'iceconnectionstatechange', 'icegatheringstatechange']) this.addEventListener(name, () => {
          entry.states.push({ connection: this.connectionState, ice: this.iceConnectionState, gathering: this.iceGatheringState });
        });
      }
    };
  });
  const page = await context.newPage();
  const result = { role, sockets: [], states: [], ice: [] }; report.pages.push(result);
  page.on('websocket', socket => {
    // Discard the URL query, which contains the private room identifier.
    const item = { service: 'public-peerjs-signaling', errors: [], closed: false }; result.sockets.push(item);
    socket.on('socketerror', error => item.errors.push(String(error).match(/net::[A-Z_]+/)?.[0] ?? 'websocket-connection-failed'));
    socket.on('close', () => { item.closed = true; });
  });
  await page.goto(url, { timeout: 10000 });
  await page.locator('#intro-online').click();
  await page.locator('#online-name').fill(role === 'host' ? 'NetworkHost' : 'NetworkGuest');
  return { page, result };
}
async function capture(player) {
  player.result.states.push(await status(player.page));
  player.result.ice = await player.page.evaluate(async () => Promise.all(window.__PUBLIC_ICE__.map(async entry => {
    let pairs = [];
    try {
      const stats = await entry.pc.getStats();
      const selected = new Set([...stats.values()].filter(value => value.type === 'transport').map(value => value.selectedCandidatePairId));
      pairs = [...stats.values()].filter(value => value.type === 'candidate-pair' && (selected.has(value.id) || value.nominated && value.state === 'succeeded')).map(value => {
        const local = stats.get(value.localCandidateId), remote = stats.get(value.remoteCandidateId);
        return { state: value.state, localType: local?.candidateType, remoteType: remote?.candidateType, protocol: local?.protocol, relayProtocol: local?.relayProtocol };
      });
    } catch { /* A closed compatibility-check connection has no usable stats. */ }
    return { connection: entry.pc.connectionState, errors: entry.errors, candidates: entry.candidates, states: entry.states, selectedPairs: pairs };
  })));
}
async function run() {
  for (let attempt = 0; attempt < 25; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) break; } catch { /* Wait only for the local production build. */ }
    if (attempt === 24) throw new Error('Production build server did not become ready.');
    await delay(100);
  }
  report.stage = 'browser-launch';
  // GitHub runners may expose a system Chromium launcher that needs Snap.
  // CI uses the browser installed by Playwright unless explicitly overridden.
  const executablePath = process.env.CHROMIUM_PATH || (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  report.browserSource = process.env.CHROMIUM_PATH ? 'explicit-override' : executablePath ? 'local-system' : 'playwright-managed';
  browser = await chromium.launch({ executablePath, headless: true, timeout: 15000, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
  report.stage = 'host-signaling';
  const host = await openPlayer('host');
  await host.page.locator('#online-create').click();
  await host.page.waitForFunction(() => ['online', 'error'].includes(window.__NEON_TEST__.online.status), null, { timeout: 13000 });
  const hostState = await status(host.page); host.result.states.push(hostState);
  if (hostState.status !== 'online') throw new Error(`Host signaling: ${hostState.message}`);
  if (hostState.signaling !== 'online') throw new Error('Host signaling is reconnecting and cannot accept new room members.');
  const code = (await host.page.locator('#online-code').innerText()).trim();
  if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error('Host signaling has not provided a usable room identifier.');
  await host.page.locator('#online-enter').click();
  report.stage = 'guest-connection';
  const guest = await openPlayer('guest');
  await guest.page.locator('#online-room').fill(code);
  await guest.page.locator('#online-join').click();
  await guest.page.waitForFunction(() => ['online', 'error'].includes(window.__NEON_TEST__.online.status), null, { timeout: 50000 });
  const guestState = await status(guest.page); guest.result.states.push(guestState);
  if (guestState.status !== 'online') throw new Error(`Guest connection: ${guestState.message}`);
  report.stage = 'public-relay-proof';
  await delay(500);
  for (const player of [host, guest]) {
    await capture(player);
    const state = await status(player.page);
    if (state.members !== 2) throw new Error('The public room did not contain both players.');
    const relay = player.result.ice.some(connection => connection.connection === 'connected' && connection.selectedPairs.some(pair => pair.state === 'succeeded' && pair.localType === 'relay'));
    if (!relay) throw new Error(`No selected public TURN relay candidate for ${player.result.role}.`);
  }
  report.success = true; report.stage = 'connected-through-public-turn';
}
async function probeTlsFallback() {
  if (!browser || Date.now() - started > 70000 || !contexts.length) return;
  const page = contexts[0].pages()[0];
  if (!page || page.isClosed()) return;
  report.tls443 = await page.evaluate(async () => {
    const source = window.__PUBLIC_ICE__.flatMap(entry => entry.servers).find(server => {
      const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
      return urls?.some(url => /turn\.peerjs\.com/.test(url)) && server.username && server.credential;
    });
    if (!source) return { attempted: false, reason: 'No official PeerJS relay credentials were loaded.' };
    const pc = new RTCPeerConnection({ iceTransportPolicy: 'relay', iceServers: [{ ...source, urls: ['turns:eu-0.turn.peerjs.com:443?transport=tcp', 'turns:us-0.turn.peerjs.com:443?transport=tcp'] }] });
    const result = { attempted: true, relayAllocated: false, errors: [] };
    let timer;
    try {
      await new Promise(async (resolve, reject) => {
        timer = setTimeout(resolve, 14000);
        pc.addEventListener('icecandidate', event => {
          if (event.candidate?.type === 'relay') { result.relayAllocated = true; result.protocol = event.candidate.protocol; resolve(); }
        });
        pc.addEventListener('icecandidateerror', event => result.errors.push({ service: String(event.url).includes('eu-0') ? 'eu-0.turn.peerjs.com:443' : 'us-0.turn.peerjs.com:443', code: event.errorCode }));
        try { pc.createDataChannel('network-diagnostic'); await pc.setLocalDescription(await pc.createOffer()); } catch (error) { reject(error); }
      });
    } catch { result.error = 'TLS relay allocation could not be started.'; }
    finally { clearTimeout(timer); pc.close(); }
    return result;
  });
}
try {
  await bounded(run(), 78000, 'The public network diagnostic exceeded its bounded runtime.');
} catch (error) {
  report.failureDetails = redact(error instanceof Error ? error.message : error).slice(0, 12000);
  report.failure = report.failureDetails.split('\n')[0].slice(0, 500);
  process.exitCode = 1;
  // Allocation alone is a diagnostic, never proof that full room joins work.
  try { await bounded(probeTlsFallback(), 15000, 'TLS allocation diagnostic timed out.'); } catch { report.tls443 = { attempted: true, relayAllocated: false, error: 'TLS diagnostic timed out.' }; }
} finally {
  for (let index = 0; index < contexts.length; index++) {
    const page = contexts[index].pages()[0];
    if (page && !page.isClosed()) {
      try { await bounded(capture({ page, result: report.pages[index] }), 2000, 'Stats unavailable.'); } catch { /* Keep the prior diagnostic state. */ }
    }
  }
  report.elapsedMs = Date.now() - started;
  await writeFile('public-network-diagnostic.json', redact(JSON.stringify(report, null, 2)));
  const selected = report.pages.flatMap(page => page.ice.flatMap(connection => connection.selectedPairs)).map(pair => `${pair.localType}/${pair.protocol}${pair.relayProtocol ? '/' + pair.relayProtocol : ''}`);
  const message = report.success ? `Two real players connected through public PeerJS/TURN (${selected.join(', ')}).` : `${report.stage}: ${report.failure}`;
  mark(report.success ? 'notice' : 'error', 'Public room connection', message);
  if (report.failureDetails) console.error(report.failureDetails);
  if (report.tls443?.attempted) mark('notice', 'Official PeerJS TURN TLS 443', report.tls443.relayAllocated ? 'A relay candidate was allocated successfully.' : 'No relay allocation was confirmed.');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Public room network diagnostic\n\n${report.success ? 'PASS' : 'FAIL'}: ${message}\n\nThis probe used the public signaling service and forced public TURN relays, without a local signaling or relay override.\n${report.tls443?.attempted ? `\nOfficial TURN TLS 443 allocation: ${report.tls443.relayAllocated ? 'confirmed' : 'not confirmed'}.\n` : ''}`);
  try { if (browser) await bounded(browser.close(), 3000, 'Browser cleanup timed out.'); } catch { /* Runner cleanup also terminates browser children. */ }
  server.kill('SIGTERM');
}
