import { PeerServer } from 'peer';

// Local signaling for development and real WebRTC browser tests. Game state
// travels directly between browsers, never through this server.
const port = Number(process.env.NEON_PEER_PORT || 9000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid NEON_PEER_PORT.');
PeerServer({
  host: '127.0.0.1', port, path: '/peerjs', allow_discovery: false,
  concurrent_limit: 64, alive_timeout: 60000,
  corsOptions: { origin: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/ },
}, server => {
  console.log(`Local PeerServer ready at http://127.0.0.1:${port}/peerjs`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}).on('error', error => {
  console.error(error.message); process.exitCode = 1;
});
