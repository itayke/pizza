import { readFileSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { TUNING_SAVE_ENDPOINT } from '../src/dev/tuningEndpoint';

const DECIMALS = 3;
const IDENTIFIER = /^\w+$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type Sections = Record<string, Record<string, unknown>>;

/** Dev-only: accepts { SECTION: { key: value } } and rewrites matching `key: value,` lines in the config file. */
export function saveTuningPlugin(configPath: string): Plugin {
  return {
    name: 'save-tuning',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(TUNING_SAVE_ENDPOINT, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            let source = readFileSync(configPath, 'utf8');
            for (const [section, values] of Object.entries(JSON.parse(body) as Sections)) {
              source = rewriteSection(source, section, values);
            }
            writeFileSync(configPath, source);
            res.end('ok');
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

function rewriteSection(source: string, section: string, values: Record<string, unknown>): string {
  if (!IDENTIFIER.test(section)) throw new Error(`Bad section: ${section}`);
  const start = source.indexOf(`export const ${section} = {`);
  if (start < 0) throw new Error(`Unknown section: ${section}`);
  const end = source.indexOf('\n};', start);

  let block = source.slice(start, end);
  for (const [key, value] of Object.entries(values)) {
    const formatted = formatValue(value);
    if (!IDENTIFIER.test(key) || formatted === null) continue;
    block = block.replace(new RegExp(`^(\\s+${key}: )[^,\\n]+,`, 'm'), `$1${formatted},`);
  }
  return source.slice(0, start) + block + source.slice(end);
}

function formatValue(value: unknown): string | null {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(Number(value.toFixed(DECIMALS)));
  if (typeof value === 'string' && HEX_COLOR.test(value)) return `'${value}'`;
  return null;
}
