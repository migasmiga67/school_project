import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const prefix = '/school_project/';
const port = Number(process.env.PORT || 5175);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
await stat(resolve(root, 'index.html')).catch(() => {
  console.error('Brak dist/index.html. Najpierw uruchom npm run build.');
  process.exit(1);
});
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (!path.startsWith(prefix)) { res.writeHead(404).end('Not found'); return; }
    const file = resolve(root, path.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Static build: http://127.0.0.1:${port}${prefix}`));
