const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';
const MAX_SERVERS = 12;
const MAX_URLS = 12;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const JSON_ERROR = 'VITE_ICE_SERVERS musi zawierać poprawną tablicę JSON z konfiguracją serwerów TURN.';
const SERVER_ERROR = 'Nieprawidłowy serwer w VITE_ICE_SERVERS. Użyj pól urls, username i credential zgodnie z konfiguracją dostawcy TURN.';
const URL_ERROR = 'Nieprawidłowy adres serwera ICE. Użyj stun:, stuns:, turn: lub turns:, prawidłowego hosta i portu 1–65535; dane logowania podaj osobno.';
const CREDENTIAL_ERROR = 'Serwer TURN wymaga niepustych pól username i credential zawierających dane klienta TURN, a nie klucz administracyjny dostawcy.';

function validHost(host: string): boolean {
  if (host.startsWith('[')) {
    if (!/^\[[0-9a-f:.]+\]$/i.test(host) || !host.includes(':')) return false;
    try { return new URL(`http://${host}`).hostname.startsWith('['); } catch { return false; }
  }
  if (host.length > 253) return false;
  const name = host.endsWith('.') ? host.slice(0, -1) : host;
  if (!name || name.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
  if (/^[0-9.]+$/.test(name)) {
    const octets = name.split('.');
    return octets.length === 4 && octets.every(octet => /^(?:0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255);
  }
  return true;
}

function validateUrl(value: unknown): { url: string; relay: boolean } {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value) || CONTROL_CHARACTERS.test(value)) throw new Error(URL_ERROR);
  const parts = /^(stun|stuns|turn|turns):(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i.exec(value);
  if (!parts || !validHost(parts[2])) throw new Error(URL_ERROR);
  if (parts[3] !== undefined && (Number(parts[3]) < 1 || Number(parts[3]) > 65535)) throw new Error(URL_ERROR);
  const relay = /^turns?$/i.test(parts[1]);
  if (!relay && parts[4] !== undefined) throw new Error(URL_ERROR);
  return { url: value, relay };
}

function credential(value: unknown, maximum: number, nonempty = true): value is string {
  return typeof value === 'string' && (!nonempty || value.trim().length > 0) && value.length <= maximum && !CONTROL_CHARACTERS.test(value);
}

/** Build-time and browser validation deliberately never includes supplied values
 * in errors: configuration can contain client TURN passwords. */
export function buildIceConfiguration(raw?: string): { config: RTCConfiguration; relayConfigured: boolean } {
  if (raw === undefined || raw.trim() === '') return {
    config: { iceServers: [{ urls: DEFAULT_STUN_URL }] }, relayConfigured: false,
  };
  if (raw.length > 65536) throw new Error(JSON_ERROR);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(JSON_ERROR); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_SERVERS) throw new Error(JSON_ERROR);
  let relayConfigured = false;
  const servers: RTCIceServer[] = parsed.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(SERVER_ERROR);
    const server = value as Record<string, unknown>;
    if (Object.keys(server).some(key => !['urls', 'username', 'credential', 'credentialType'].includes(key))) throw new Error(SERVER_ERROR);
    if (server.credentialType !== undefined && server.credentialType !== 'password') throw new Error('VITE_ICE_SERVERS obsługuje wyłącznie credentialType: password z danymi klienta TURN.');
    const source = typeof server.urls === 'string' ? [server.urls] : server.urls;
    if (!Array.isArray(source) || source.length < 1 || source.length > MAX_URLS) throw new Error(SERVER_ERROR);
    const urls = source.map(validateUrl);
    const relay = urls.some(url => url.relay);
    if (relay && (!credential(server.username, 512) || !credential(server.credential, 4096))) throw new Error(CREDENTIAL_ERROR);
    if (server.username !== undefined && !credential(server.username, 512, false) || server.credential !== undefined && !credential(server.credential, 4096, false)) throw new Error(CREDENTIAL_ERROR);
    relayConfigured ||= relay;
    return {
      urls: typeof server.urls === 'string' ? urls[0].url : urls.map(url => url.url),
      ...(server.username !== undefined ? { username: server.username as string } : {}),
      ...(server.credential !== undefined ? { credential: server.credential as string } : {}),
    };
  });
  if (!relayConfigured) throw new Error('VITE_ICE_SERVERS musi zawierać przynajmniej jeden serwer turn: lub turns: z danymi klienta TURN.');
  return { config: { iceServers: servers }, relayConfigured };
}
