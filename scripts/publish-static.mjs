import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';

// Keep a built copy at the repository root for branch-based GitHub Pages.
// Application source lives in app/ and Vite development still uses that source.
await mkdir('assets', { recursive: true });
for (const file of await readdir('assets')) {
  if (/^index-[\w-]+\.(js|css)$/.test(file)) {
    await rm(`assets/${file}`);
  }
}
await cp('dist/assets', 'assets', { recursive: true });
await cp('dist/favicon.svg', 'favicon.svg');
const html = await readFile('dist/index.html', 'utf8');
await writeFile('index.html', html);
await writeFile('.nojekyll', '');
