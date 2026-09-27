import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
