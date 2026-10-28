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
    constructor(readonly id: string) { super(); Peer.instances.push(this); }
    openSignaling() { this.open = true; this.disconnected = false; this.emit('open', this.id); }
    connect(id: string) { const connection = new Connection(id); this.connections.push(connection); return connection; }
    incoming(id = 'neonc-player-FRIEND') { const connection = new Connection(id); this.connections.push(connection); this.emit('connection', connection); return connection; }
    disconnect() { if (this.disconnected) return; this.open = false; this.disconnected = true; this.emit('disconnected'); }
    reconnect() { this.reconnectCalls++; this.disconnected = false; }
    destroy() { this.open = false; this.destroyed = true; this.emit('close'); }
  }
  return { Peer };
});
vi.mock('peerjs', () => ({ Peer: transport.Peer, util: { defaultConfig: { iceServers: [] } } }));

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
  vi.stubGlobal('location', { hostname: 'example.test' });
  vi.stubGlobal('RTCPeerConnection', function () {});
});
afterEach(() => { for (const client of clients) client.leave(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
    expect((await result)?.message).toMatch(/zestawić połączenia z gospodarzem/);
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
