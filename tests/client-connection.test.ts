import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerClient } from '../src/multiplayer-client';
import { RoomAuthority } from '../src/room-authority';
import { ROOM_PROTOCOL } from '../src/multiplayer-model';

const transport = vi.hoisted(() => {
  class Events {
    private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    on(event: string, listener: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]); return this;
    }
    emit(event: string, ...args: unknown[]) { for (const listener of [...(this.handlers.get(event) ?? [])]) listener(...args); }
  }
  class Connection extends Events {
    open = false;
    closed = false;
    sent: unknown[] = [];
    dataChannel = { bufferedAmount: 0 };
    constructor(readonly peer: string) { super(); }
    openChannel() { this.open = true; this.emit('open'); }
    receive(value: unknown) { this.emit('data', value); }
    send(value: unknown) { this.sent.push(structuredClone(value)); }
    close() { this.open = false; this.closed = true; this.emit('close'); }
  }
  class Peer extends Events {
    static instances: Peer[] = [];
    open = false;
    disconnected = false;
    destroyed = false;
    reconnectCalls = 0;
    connections: Connection[] = [];
    constructor(readonly id: string, readonly options?: { config?: RTCConfiguration; host?: string }) { super(); Peer.instances.push(this); }
    openSignaling() { this.open = true; this.disconnected = false; this.emit('open', this.id); }
    connect(id: string) { const connection = new Connection(id); this.connections.push(connection); return connection; }
    incoming(id = 'neonc-player-FRIEND') { const connection = new Connection(id); this.connections.push(connection); this.emit('connection', connection); return connection; }
    disconnect() { if (this.disconnected) return; this.open = false; this.disconnected = true; this.emit('disconnected'); }
    reconnect() { this.reconnectCalls++; this.disconnected = false; }
    destroy() { this.open = false; this.destroyed = true; this.emit('close'); }
  }
  return { Peer };
});
vi.mock('peerjs', () => ({ Peer: transport.Peer }));

const CODE = 'ABCDEFGH';
const HOST = `neonc-${CODE}`;
let clients: MultiplayerClient[];
const latestPeer = () => transport.Peer.instances.at(-1)!;
function joining() {
  const client = new MultiplayerClient(); clients.push(client);
  const result = client.join(CODE, 'Przyjaciel').then(() => null, error => error as Error);
  const peer = latestPeer();
  return { client, peer, result };
}
async function hosting() {
  const client = new MultiplayerClient(); clients.push(client);
  const ready = client.create('Gospodarz');
  const peer = latestPeer(); peer.openSignaling(); await ready;
  return { client, peer };
}
function welcome(peer: InstanceType<typeof transport.Peer>, protocol = ROOM_PROTOCOL) {
  const room = new RoomAuthority(CODE, HOST, 'Gospodarz');
  expect(room.join(peer.id, 'Przyjaciel').ok).toBe(true);
  return { type: 'snapshot', protocol, seq: 1, snapshot: room.snapshot(peer.id) };
}
function hello(sequence = 1) { return { type: 'hello', protocol: ROOM_PROTOCOL, name: 'Przyjaciel', seq: sequence }; }

beforeEach(() => {
  clients = []; transport.Peer.instances = [];
  vi.useFakeTimers(); vi.setSystemTime(0);
  vi.stubEnv('VITE_ICE_SERVERS', '');
  vi.stubGlobal('location', { hostname: 'example.test' });
  vi.stubGlobal('RTCPeerConnection', function () {});
});
afterEach(() => { for (const client of clients) client.leave(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('explicit relay configuration and safe diagnostics', () => {
  const configured = [{ urls: 'turns:relay.example.invalid:443?transport=tcp', username: 'relay-unit-account', credential: 'unit:credential-not-for-public-status' }];

  it('uses STUN without claiming a relay when the build has no TURN configuration', async () => {
    const { client, peer } = await hosting();
    expect(client.state.relayConfigured).toBe(false);
    const urls = peer.options?.config?.iceServers?.flatMap(server => typeof server.urls === 'string' ? [server.urls] : server.urls) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every(url => /^stun:/i.test(url))).toBe(true);
    expect(JSON.stringify(peer.options)).not.toContain('turn.peerjs.com');
  });

  it('publishes only the configured capability rather than relay credentials', async () => {
    vi.stubEnv('VITE_ICE_SERVERS', JSON.stringify(configured));
    const { client, peer } = await hosting();
    expect(client.state.relayConfigured).toBe(true);
    expect(peer.options?.config?.iceServers).toEqual(configured);
    expect(JSON.stringify(client.state)).not.toContain(configured[0].username);
    expect(JSON.stringify(client.state)).not.toContain(configured[0].credential);
  });

  it('recognizes the real local TURN override used by browser integration tests', async () => {
    vi.stubGlobal('location', { hostname: '127.0.0.1' });
    vi.stubGlobal('window', { __NEON_SIGNALING__: { host: '127.0.0.1', config: { iceTransportPolicy: 'relay', iceServers: [{ urls: 'turn:127.0.0.1:3478?transport=tcp', username: 'neon', credential: 'local-unit-relay' }] } } });
    const { client, peer } = await hosting();
    expect(client.state.relayConfigured).toBe(true);
    expect(peer.options?.host).toBe('127.0.0.1');
    expect(peer.options?.config?.iceTransportPolicy).toBe('relay');
  });

  it('reports the final STUN-only local override even when the build contains TURN', async () => {
    vi.stubEnv('VITE_ICE_SERVERS', JSON.stringify(configured));
    vi.stubGlobal('location', { hostname: 'localhost' });
    vi.stubGlobal('window', { __NEON_SIGNALING__: { host: '127.0.0.1', config: { iceServers: [{ urls: 'stun:stun.example.invalid:3478' }] } } });
    const { client } = await hosting();
    expect(client.state.relayConfigured).toBe(false);
  });

  it('rejects invalid build configuration before opening a peer or a pending timer without exposing supplied credentials', async () => {
    const secret = 'invalid-input-credential-that-must-stay-private';
    vi.stubEnv('VITE_ICE_SERVERS', `{"urls":"turns:relay.example.invalid:443","credential":"${secret}"}`);
    const client = new MultiplayerClient(); clients.push(client);
    const result = await client.create('Gospodarz').then(() => null, error => error as Error);
    expect(result).toBeInstanceOf(Error);
    expect(client.state.status).toBe('error');
    expect(transport.Peer.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(result?.message).not.toContain(secret);
    expect(JSON.stringify(client.state)).not.toContain(secret);
  });

  it('explains an initial typed negotiation failure without leaking the underlying transport error', async () => {
    const { client, peer, result } = joining(); peer.openSignaling();
    peer.connections[0].emit('error', { type: 'negotiation-failed', message: 'raw-transport-secret-must-not-be-published' });
    expect((await result)?.message).toMatch(/nie ma skonfigurowanego serwera pośredniczącego TURN/);
    expect(client.state.relayConfigured).toBe(false);
    expect(client.state.message).not.toContain('raw-transport-secret');
  });

  it('identifies a configured relay when initial negotiation fails and keeps established-loss wording separate', async () => {
    vi.stubEnv('VITE_ICE_SERVERS', JSON.stringify(configured));
    const pending = joining(); pending.peer.openSignaling();
    pending.peer.connections[0].emit('error', { type: 'negotiation-failed' });
    expect((await pending.result)?.message).toMatch(/skonfigurowanego serwera TURN/);
    expect(pending.client.state.relayConfigured).toBe(true);
    const established = joining(); established.peer.openSignaling();
    const connection = established.peer.connections[0]; connection.openChannel(); connection.receive(welcome(established.peer));
    expect(await established.result).toBeNull();
    connection.emit('error', { type: 'connection-closed' });
    expect(established.client.state.message).toMatch(/utrzymać połączenia z gospodarzem/);
  });
});

describe('connection phase deadlines', () => {
  it('permits delayed signaling and an 18-second ICE negotiation before a separate hello deadline', async () => {
    const { client, peer, result } = joining();
    await vi.advanceTimersByTimeAsync(9000);
    expect(client.state.message).toMatch(/serwerem pokojów/);
    peer.openSignaling();
    expect(client.state.message).toMatch(/przez sieć/);
    await vi.advanceTimersByTimeAsync(18000);
    // Neither the old 15s overall deadline nor the online heartbeat can kill ICE.
    expect(client.state.status).toBe('connecting');
    const connection = peer.connections[0]; connection.openChannel();
    expect(client.state.message).toMatch(/Dołączanie do pokoju/);
    await vi.advanceTimersByTimeAsync(6500);
    connection.receive(welcome(peer));
    expect(await result).toBeNull();
    expect(client.state.status).toBe('online');
    expect(client.state.snapshot?.members).toHaveLength(2);
  });

  it('reports an unavailable signaling service at its own deadline', async () => {
    const { client, result } = joining();
    await vi.advanceTimersByTimeAsync(10000);
    expect((await result)?.message).toMatch(/Serwer pokojów nie odpowiada/);
    expect(client.state.status).toBe('error');
  });

  it('bounds an unanswered RTC negotiation without confusing it with a missing snapshot', async () => {
    const { client, peer, result } = joining(); peer.openSignaling();
    await vi.advanceTimersByTimeAsync(29999);
    expect(client.state.status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect((await result)?.message).toMatch(/zestawić połączenia między graczami/);
    expect(peer.connections[0].closed).toBe(true);
  });

  it('starts the admission deadline when the data channel opens', async () => {
    const { client, peer, result } = joining(); peer.openSignaling();
    await vi.advanceTimersByTimeAsync(18000);
    peer.connections[0].openChannel();
    await vi.advanceTimersByTimeAsync(6999);
    expect(client.state.status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect((await result)?.message).toMatch(/pokój nie potwierdził dołączenia/);
  });

  it('keeps an incoming connection alive beyond 7 seconds while ICE negotiates', async () => {
    const { client, peer } = await hosting();
    const connection = peer.incoming();
    await vi.advanceTimersByTimeAsync(9000);
    expect(connection.closed).toBe(false);
    connection.openChannel();
    await vi.advanceTimersByTimeAsync(6500);
    connection.receive(hello());
    expect(connection.closed).toBe(false);
    expect(client.state.snapshot?.members).toHaveLength(2);
    expect(connection.sent).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'snapshot' })]));
  });

  it('releases stalled incoming offers and open channels that never send hello', async () => {
    const { peer } = await hosting();
    const offer = peer.incoming('neonc-player-OFFER');
    const silent = peer.incoming('neonc-player-SILENT');
    await vi.advanceTimersByTimeAsync(20000);
    silent.openChannel();
    await vi.advanceTimersByTimeAsync(6500);
    expect(offer.closed).toBe(false); expect(silent.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(silent.closed).toBe(true); expect(offer.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(offer.closed).toBe(true);
  });
});

describe('version, cancellation and independent signaling recovery', () => {
  it('rejects an incompatible host snapshot immediately with an instruction to refresh both games', async () => {
    const { client, peer, result } = joining(); peer.openSignaling();
    const connection = peer.connections[0]; connection.openChannel();
    connection.receive(welcome(peer, ROOM_PROTOCOL - 1));
    expect((await result)?.message).toMatch(/inną wersję gry.*obu osób/);
    expect(client.state.status).toBe('error');
    expect(connection.closed).toBe(true);
  });

  it('cancels pending phases and ignores callbacks from the abandoned peer', async () => {
    const { client, peer, result } = joining(); peer.openSignaling();
    const connection = peer.connections[0];
    await vi.advanceTimersByTimeAsync(9000);
    client.leave();
    expect((await result)?.message).toMatch(/anulowane/);
    connection.openChannel(); connection.receive(welcome(peer)); peer.openSignaling();
    await vi.advanceTimersByTimeAsync(90000);
    expect(client.state.status).toBe('offline'); expect(client.state.snapshot).toBeNull();
    expect(peer.destroyed).toBe(true); expect(peer.reconnectCalls).toBe(0);
  });

  it('preserves the signaling warning through snapshots and retries stalled reconnects with backoff', async () => {
    const { client, peer } = await hosting();
    const connection = peer.incoming(); connection.openChannel(); connection.receive(hello());
    peer.disconnect();
    expect(client.state).toMatchObject({ status: 'online', signaling: 'reconnecting' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(peer.reconnectCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(connection.closed).toBe(false);
    expect(client.state.message).toMatch(/nowe osoby dołączą po przywróceniu/);
    // A wallet change normally clears transient notices. Signaling readiness is
    // independent, so that snapshot must preserve the reconnect warning too.
    client.spend(100);
    expect(client.state.snapshot?.wallet).toBe(1150);
    expect(client.state.message).toMatch(/nowe osoby dołączą po przywróceniu/);
    connection.receive({ type: 'command', command: { type: 'ping' }, seq: 2 });
    await vi.advanceTimersByTimeAsync(3999);
    expect(peer.reconnectCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(peer.reconnectCalls).toBe(2);
    peer.openSignaling();
    expect(client.state).toMatchObject({ status: 'online', signaling: 'online', message: '' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(connection.closed).toBe(false); expect(peer.reconnectCalls).toBe(2);
    client.leave(); await vi.advanceTimersByTimeAsync(90000);
    expect(peer.reconnectCalls).toBe(2);
  });

  it('cancels an in-flight signaling watchdog when the room is left', async () => {
    const { client, peer } = await hosting(); peer.disconnect();
    await vi.advanceTimersByTimeAsync(2000);
    expect(peer.reconnectCalls).toBe(1);
    client.leave();
    await vi.advanceTimersByTimeAsync(90000);
    expect(client.state.status).toBe('offline');
    expect(peer.reconnectCalls).toBe(1);
  });

  it('still detects an unresponsive host after admission completes', async () => {
    const { client, peer, result } = joining(); peer.openSignaling();
    peer.connections[0].openChannel(); peer.connections[0].receive(welcome(peer));
    expect(await result).toBeNull();
    await vi.advanceTimersByTimeAsync(16000);
    expect(client.state.status).toBe('error');
    expect(client.state.message).toMatch(/Gospodarz nie odpowiada/);
  });
});
