import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { buildIceConfiguration } from './src/ice-config';

const envDir = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
  // Validate before publishing, without logging the configuration or password.
  buildIceConfiguration(process.env.VITE_ICE_SERVERS ?? env.VITE_ICE_SERVERS);
  return {
    root: 'app', envDir, base: './', server: { fs: { allow: ['..'] } },
    build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
  };
});
