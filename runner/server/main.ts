// Starts gmx-cypher: the server on 127.0.0.1, then the URL with its token (T2, T3).

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { makeApi } from './api';
import { detectGmx } from './gmx';
import { startServer } from './http';
import { loadConfig, saveConfig, stateDir } from './state';

const RUNNER = fileURLToPath(new URL('..', import.meta.url));
const VERSION = JSON.parse(readFileSync(RUNNER + 'package.json', 'utf8')).version as string;

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const dev = args.includes('--dev');
const port = Number(flag('--port') ?? 8765);
const token = randomBytes(32).toString('base64url');

const home = stateDir();
const config = loadConfig(home);
if (flag('--gmx')) { config.gmx = flag('--gmx')!; saveConfig(home, config); }
const gmx = await detectGmx(config.gmx);
const api = makeApi({ home, version: VERSION, config, gmx });

let viteMiddleware: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
const server = await startServer({
  token, port, api,
  dist: RUNNER + 'dist',
  dev: dev ? (req, res) => (viteMiddleware ? viteMiddleware(req, res) : res.writeHead(503).end('starting…')) : undefined,
}).catch((e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? 'Port ' + port + ' is in use; start with --port <another>.' : String(e));
  process.exit(1);
});
if (dev) {
  const { createServer } = await import('vite');
  viteMiddleware = (await createServer({ root: RUNNER, appType: 'spa', server: { middlewareMode: true, hmr: { server } } })).middlewares;
}

const address = server.address();
const actual = typeof address === 'object' && address ? address.port : port;
console.log('gmx-cypher ' + VERSION + (dev ? ' (development)' : '') + ' is running. Open:\n\n  http://127.0.0.1:' + actual + '/?token=' + token + '\n');
console.log(gmx.ok ? 'gmx: ' + gmx.path + ' · ' + gmx.version : 'gmx: ✗ ' + gmx.error);
console.log('Through an SSH tunnel: ssh -L ' + actual + ':127.0.0.1:' + actual + ' <this machine>, then the same address.');

const stop = () => { server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
