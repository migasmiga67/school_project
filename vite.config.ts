import { defineConfig } from 'vite';
export default defineConfig({root:'app',base:'./',server:{fs:{allow:['..']}},build:{outDir:'../dist',emptyOutDir:true,rollupOptions:{output:{manualChunks:{three:['three']}}}}});
