import { describe, expect, it } from 'vitest';
import { buildIceConfiguration } from '../src/ice-config';

const server = (changes: Record<string, unknown> = {}) => ({
  urls: 'turns:turn.example.com:443?transport=tcp', username: '1700000000:game-user', credential: 'client-password', ...changes,
});
const configure = (value: unknown) => buildIceConfiguration(JSON.stringify(value));

describe('explicit client TURN configuration', () => {
  it('supports direct connections without claiming that a TURN relay is configured', () => {
    for (const raw of [undefined, '', ' \n ']) {
      const result = buildIceConfiguration(raw);
      expect(result.relayConfigured).toBe(false);
      expect(result.config.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    }
    const first = buildIceConfiguration();
    first.config.iceServers!.push(server());
    expect(buildIceConfiguration().config.iceServers).toHaveLength(1);
  });

  it('preserves provider addresses, transports and exact client credentials', () => {
    const value = [
      { urls: 'stun:stun.example.com:80' },
      server({ urls: ['turn:relay.example.com:80?transport=udp', 'turn:relay.example.com:80?transport=tcp', 'turns:relay.example.com:443?transport=tcp'], credential: ' password with spaces ' }),
    ];
    const result = configure(value);
    expect(result.relayConfigured).toBe(true);
    expect(result.config.iceServers).toEqual(value);
  });

  it('accepts empty optional credentials on a provider STUN entry alongside an authenticated TURN entry', () => {
    const value = [{ urls: 'stun:stun.example.com:80', username: '', credential: '' }, server()];
    const result = configure(value);
    expect(result.relayConfigured).toBe(true);
    expect(result.config.iceServers).toEqual(value);
  });

  it('accepts the provider password credential type without passing legacy metadata to RTC', () => {
    expect(configure([server({ credentialType: 'password' })]).config.iceServers).toEqual([server()]);
  });

  it('rejects unsupported credential types without echoing their value', () => {
    const marker = 'private-unsupported-credential-type';
    expect(() => configure([server({ credentialType: marker })])).toThrow(/credentialType: password/);
    try { configure([server({ credentialType: marker })]); }
    catch (error) { expect((error as Error).message).not.toContain(marker); }
  });

  it.each(['turn:[2001:db8::1]:3478', 'turns:[::ffff:192.0.2.1]:443?transport=tcp', 'TURN:192.0.2.1:3478', 'turn:relay.example.com.:3478'])('accepts valid IPv6, IPv4 and fully qualified relay authorities: %s', url => {
    expect(configure([server({ urls: url })]).relayConfigured).toBe(true);
  });

  it.each([null, {}, [], [null], [1], ['invalid'], Array.from({ length: 13 }, () => server())].map(value => ({ value })))('rejects invalid server arrays without fallback: $value', ({ value }) => {
    expect(() => configure(value)).toThrow(/VITE_ICE_SERVERS/);
  });

  it.each([undefined, null, [], [null], Array.from({ length: 13 }, () => 'turn:relay.example.com:3478')].map(urls => ({ urls })))('rejects invalid url lists: $urls', ({ urls }) => {
    expect(() => configure([server({ urls })])).toThrow();
  });

  it.each([
    'http://relay.example.com:443', 'turn:private-user:private-password@relay.example.com:3478',
    'turn:relay.example.com/path', 'turn:relay.example.com#fragment', 'turn:relay.example.com?other=tcp',
    'turn:relay.example.com:0', 'turn:relay.example.com:65536', 'turn:relay.example.com:999999',
    'turn:[::::]:3478', 'turn:[12345::1]:3478', 'turn:999.1.2.3:3478', 'turn:01.2.3.4:3478',
    'turn:relay..example.com:3478', 'turn:-relay.example.com:3478', 'turn:relay-.example.com:3478',
    'turn:relay.example.com:3478\n', 'turn:relay.example.com:3478?transport=invalid', 'stun:relay.example.com?transport=tcp',
  ])('rejects invalid ICE URI authorities and parameters: %s', urls => {
    expect(() => configure([server({ urls })])).toThrow(/adres serwera ICE/);
  });

  it.each([
    { username: undefined }, { username: '' }, { username: '  ' }, { username: 123 },
    { credential: undefined }, { credential: '' }, { credential: '  ' }, { credential: { secret: 'not-a-password' } },
    { credential: 'line\nbreak' }, { username: 'line\u0000break' },
  ])('requires client credentials on every object containing a TURN url: %j', change => {
    expect(() => configure([server(change)])).toThrow(/username i credential/);
  });

  it('requires relay credentials even when STUN and TURN share one urls list', () => {
    expect(() => configure([{ urls: ['stun:stun.example.com', 'turn:turn.example.com'] }])).toThrow(/username i credential/);
  });

  it('rejects a supplied STUN-only configuration instead of treating it as a relay', () => {
    expect(() => configure([{ urls: 'stun:stun.example.com:3478' }])).toThrow(/turn: lub turns:/);
  });

  it('does not echo JSON contents, credentials, URLs or unknown secret fields in errors', () => {
    const secret = 'private-test-marker-do-not-print';
    const attempts = [
      `{ "credential": "${secret}", invalid json`,
      JSON.stringify([server({ urls: `https://${secret}.example.com` })]),
      JSON.stringify([server({ apiKey: secret })]),
      JSON.stringify([server({ credential: { apiKey: secret } })]),
      secret.repeat(5000),
    ];
    for (const raw of attempts) {
      let failure: unknown;
      try { buildIceConfiguration(raw); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).not.toContain(secret);
      expect((failure as Error).message).not.toContain(raw);
    }
  });
});
