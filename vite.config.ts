import { defineConfig } from 'vite';

// Non-default ports; Vite defaults are taken on this host
const DEV_PORT = 7310;
const PREVIEW_PORT = 7311;

export default defineConfig({
  // Expose on the LAN for tablet testing
  server: { port: DEV_PORT, host: true },
  preview: { port: PREVIEW_PORT, host: true },
});
