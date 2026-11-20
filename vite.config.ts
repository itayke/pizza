import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { saveTuningPlugin } from './tools/saveTuningPlugin';
import pkg from './package.json';

// Non-default ports; Vite defaults are taken on this host
const DEV_PORT = 7310;
const PREVIEW_PORT = 7311;
const CONFIG_PATH = fileURLToPath(new URL('./src/config.ts', import.meta.url));
const DIRTY_MARK = '*';
const UNKNOWN_COMMIT = 'nogit';

// Package version plus commit, marked when built from uncommitted changes
function appVersion(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim() !== '';
    return `v${pkg.version} ${hash}${dirty ? DIRTY_MARK : ''}`;
  } catch {
    return `v${pkg.version} ${UNKNOWN_COMMIT}`;
  }
}

export default defineConfig({
  plugins: [saveTuningPlugin(CONFIG_PATH)],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Expose on the LAN for tablet testing
  server: { port: DEV_PORT, host: true },
  preview: { port: PREVIEW_PORT, host: true },
});
