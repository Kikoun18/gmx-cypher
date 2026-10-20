import { mkdirSync, writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/http';
import { tmp } from './helpers';

const TOKEN = 'a'.repeat(43);
let server: Server, port: number;

beforeAll(async () => {
  const parent = tmp('dist'), dist = join(parent, 'dist');
  mkdirSync(dist);
  writeFileSync(join(parent, 'secret.txt'), 'SECRET-OUTSIDE-DIST');
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>gmx-cypher</title>');
  writeFileSync(join(dist, 'app.js'), 'console.log(1)');
  server = await startServer({ token: TOKEN, port: 0, dist, api: async (_req, url) => (url.pathname === '/api/ping' ? { body: { ok: true } } : null) });
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise(r => server.close(r)));

function get(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, path, method, headers: { host: '127.0.0.1:' + port, ...headers } }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    r.on('error', reject);
    r.end();
  });
}
const cookie = { cookie: 'gmx-cypher=' + TOKEN };

describe('the server', () => {
  it('listens on 127.0.0.1 only', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('refuses a request without the token, and says where the URL is', async () => {
    const r = await get('/');
    expect(r.status).toBe(401);
    expect(r.body).toContain('terminal');
    expect((await get('/api/ping')).status).toBe(401);
    expect((await get('/app.js')).status).toBe(401);
  });

  it('refuses a wrong token or cookie', async () => {
    expect((await get('/?token=' + 'b'.repeat(43))).status).toBe(401);
    expect((await get('/?token=short')).status).toBe(401);
    expect((await get('/', { cookie: 'gmx-cypher=' + 'b'.repeat(43) })).status).toBe(401);
  });

  it('trades the token in the URL for a strict cookie and drops it from the address', async () => {
    const r = await get('/?token=' + TOKEN);
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe('/');
    const set = String(r.headers['set-cookie']);
    expect(set).toContain('gmx-cypher=' + TOKEN);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Strict');
  });

  it('serves the GUI and the API to the cookie', async () => {
    expect((await get('/', cookie)).body).toContain('<title>gmx-cypher</title>');
    expect((await get('/app.js', cookie)).body).toBe('console.log(1)');
    expect(JSON.parse((await get('/api/ping', cookie)).body)).toEqual({ ok: true });
    expect((await get('/api/nothing', cookie)).status).toBe(404);
  });

  it('refuses a foreign Host, even with the cookie (DNS rebinding)', async () => {
    expect((await get('/', { ...cookie, host: 'evil.example:' + port })).status).toBe(403);
    expect((await get('/', { ...cookie, host: '127.0.0.1.evil.example' })).status).toBe(403);
  });

  it('accepts local host names on any port, so an SSH tunnel works', async () => {
    for (const host of ['localhost:9000', '127.0.0.1:' + port, '[::1]:8765', 'localhost']) expect((await get('/', { ...cookie, host })).status).toBe(200);
  });

  it('refuses a foreign or null Origin', async () => {
    expect((await get('/api/ping', { ...cookie, origin: 'http://evil.example' }, 'POST')).status).toBe(403);
    expect((await get('/api/ping', { ...cookie, origin: 'null' }, 'POST')).status).toBe(403);
    expect((await get('/api/ping', { ...cookie, origin: 'http://127.0.0.1:' + port })).status).toBe(200);
  });

  it("refuses a page on another local port: the cookie isn't port-bound, so the Origin must be this address", async () => {
    expect((await get('/api/ping', { ...cookie, origin: 'http://127.0.0.1:9999' }, 'POST')).status).toBe(403);
    expect((await get('/api/ping', { ...cookie, origin: 'http://localhost:' + port })).status).toBe(403);
    // Through an SSH tunnel the browser's address is both the Host and the Origin.
    expect((await get('/api/ping', { ...cookie, host: 'localhost:9000', origin: 'http://localhost:9000' }, 'POST')).status).toBe(200);
  });

  it('serves nothing outside the GUI folder', async () => {
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt', '//secret.txt'])
      expect((await get(p, cookie)).body).not.toContain('SECRET');
    expect((await get('/missing.js', cookie)).status).toBe(404);
  });

  it('answers an unknown page with the GUI (single page)', async () => {
    expect((await get('/jobs/x', cookie)).body).toContain('<title>gmx-cypher</title>');
  });
});
