import { createServer as createHttpServer } from 'node:http';
import { createServer as createTurnServer } from 'turn-server';

// Development/test relay: bind loopback only. Browser TURN traffic uses TCP so
// real WebRTC tests also work when managed browsers disallow direct UDP.
const port = Number(process.env.NEON_TURN_PORT || 3478);
const healthPort = Number(process.env.NEON_TURN_HEALTH_PORT || 9002);
for (const value of [port, healthPort]) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('Invalid local TURN port.');
}
if (port === healthPort) throw new Error('TURN and health ports must differ.');

let ready = false, stopping = false;
const turn = createTurnServer({
  auth: { mechanism: 'long-term', realm: 'neon', credentials: { neon: 'neon-local-test' } },
  relay: { ip: '127.0.0.1', externalIp: '127.0.0.1' },
  allowLoopback: true,
  maxConnections: 32, userQuota: 16, totalQuota: 32,
});
const health = createHttpServer((request, response) => {
  if (request.url !== '/health') { response.writeHead(404); response.end(); return; }
  response.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' });
  response.end(ready ? 'Local TURN/TCP ready\n' : 'Starting local TURN/TCP\n');
});
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true; ready = false;
  const timeout = setTimeout(() => process.exit(exitCode), 2000);
  timeout.unref();
  health.close(() => turn.stop(() => process.exit(exitCode)));
}
function fail(error) { console.error(error.message || String(error)); stop(1); }
turn.on('error', fail);
health.on('error', fail);
turn.on('listening', () => {
  ready = true;
  console.log(`Local TURN/TCP ready at 127.0.0.1:${port}; health http://127.0.0.1:${healthPort}/health`);
});
turn.listen([{ address: '127.0.0.1', port, transport: 'tcp' }]);
health.listen(healthPort, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
