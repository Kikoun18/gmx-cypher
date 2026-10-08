// The one HTTP server (T2, T3): 127.0.0.1 only; every request needs the token (in the URL once, then a
// strict cookie); a foreign Host or Origin is refused; then the API, or the GUI's files.

import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export interface Reply { status?: number; body: unknown }
/** null: not an API path it knows; 'handled': it wrote the response itself (streams). */
export type Api = (req: IncomingMessage, url: URL, res: ServerResponse) => Promise<Reply | 'handled' | null>;

export interface ServerOptions {
  token: string;
  port: number;
  api: Api;
  /** The built GUI. */
  dist?: string;
  /** Development: Vite's middleware instead of `dist`. */
  dev?: (req: IncomingMessage, res: ServerResponse) => void;
}

const COOKIE = 'gmx-cypher';
const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Host header naming this machine, on any port (an SSH tunnel may use another). */
export function localHost(host: string | undefined): boolean {
  const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(host || '');
  return !!m && LOCAL.has(m[1].toLowerCase());
}

/** No Origin (same-origin GET, curl) or a local http origin. */
export function localOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try { const u = new URL(origin); return u.protocol === 'http:' && LOCAL.has(u.hostname); } catch { return false; }
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieOf = (header: string | undefined) => (header || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';

export type Gate = { kind: 'ok' } | { kind: 'enter'; location: string } | { kind: 'refuse'; status: 401 | 403; reason: string };

export function gate(req: IncomingMessage, url: URL, token: string): Gate {
  if (!localHost(req.headers.host)) return { kind: 'refuse', status: 403, reason: 'foreign host' };
  if (!localOrigin(req.headers.origin)) return { kind: 'refuse', status: 403, reason: 'foreign origin' };
  const fromUrl = url.searchParams.get('token');
  if (fromUrl != null && same(fromUrl, token)) {
    url.searchParams.delete('token');
    return { kind: 'enter', location: url.pathname + url.search };
  }
  return same(cookieOf(req.headers.cookie), token) ? { kind: 'ok' } : { kind: 'refuse', status: 401, reason: 'no token' };
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export async function readJson<T>(req: IncomingMessage, limit = 16 << 20): Promise<T> {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'request too large');
    parts.push(c as Buffer);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8') || 'null') as T; } catch { throw new HttpError(400, 'not JSON'); }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};

function serveStatic(dist: string, pathname: string, res: ServerResponse) {
  let rel: string;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return; }
  const file = resolve(dist, '.' + rel);
  const inside = file === dist || file.startsWith(dist + sep);
  const stat = inside ? statSync(file, { throwIfNoEntry: false }) : undefined;
  // A path without an extension is a page of the GUI (single page); a missing file is a 404.
  const target = stat?.isFile() ? file : inside && !extname(rel) ? resolve(dist, 'index.html') : null;
  if (!target) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(target)] || 'application/octet-stream', 'cache-control': target.endsWith('.html') ? 'no-store' : 'no-cache' });
  createReadStream(target).pipe(res);
}

const REFUSED = '<!doctype html><meta charset="utf-8"><title>gmx-cypher</title><body style="font-family:monospace;padding:2em">'
  + 'gmx-cypher: open the address printed in the terminal where it was started. It carries the access token.</body>';

export function startServer(o: ServerOptions): Promise<Server> {
  const dist = o.dist && resolve(o.dist);
  const server = createServer(async (req, res) => {
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-content-type-options', 'nosniff');
    const url = new URL('http://local' + (req.url || '/'));
    const g = gate(req, url, o.token);
    if (g.kind === 'refuse') {
      res.writeHead(g.status, { 'content-type': 'text/html; charset=utf-8' }).end(REFUSED);
      return;
    }
    if (g.kind === 'enter') {
      res.writeHead(303, { location: g.location, 'set-cookie': COOKIE + '=' + o.token + '; HttpOnly; SameSite=Strict; Path=/' }).end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        const r = await o.api(req, url, res);
        if (r === 'handled') return;
        if (!r) sendJson(res, 404, { error: 'no such API path: ' + url.pathname });
        else sendJson(res, r.status || 200, r.body);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (!res.headersSent) sendJson(res, status, { error: (e as Error).message || String(e) });
        else res.end();
      }
      return;
    }
    if (o.dev) o.dev(req, res);
    else if (dist) serveStatic(dist, url.pathname, res);
    else res.writeHead(404).end();
  });
  // A websocket upgrade (Vite's hot reload in development) passes the same gate.
  server.prependListener('upgrade', (req, socket) => {
    if (gate(req, new URL('http://local' + (req.url || '/')), o.token).kind !== 'ok') socket.destroy();
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(o.port, '127.0.0.1', () => ok(server));
  });
}
