import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { saveTuningPlugin } from './tools/saveTuningPlugin';

// Non-default ports; Vite defaults are taken on this host
const DEV_PORT = 7310;
const PREVIEW_PORT = 7311;
const CONFIG_PATH = fileURLToPath(new URL('./src/config.ts', import.meta.url));

export default defineConfig({
  plugins: [saveTuningPlugin(CONFIG_PATH)],
  // Expose on the LAN for tablet testing
  server: { port: DEV_PORT, host: true },
  preview: { port: PREVIEW_PORT, host: true },
});
