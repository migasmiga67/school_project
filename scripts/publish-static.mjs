import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
await mkdir('assets',{recursive:true});
for(const file of await readdir('assets'))if(/^[\w-]+\.(js|css)$/.test(file))await rm(`assets/${file}`);
await cp('dist/assets','assets',{recursive:true});
await cp('dist/index.html','index.html');
await cp('dist/favicon.svg','favicon.svg');
await writeFile('.nojekyll','');
console.log('Static Pages files ready.');
