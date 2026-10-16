import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { api, FAKE_GMX, startRunner, type Started } from './helpers';

let running: Started[] = [];
afterEach(() => { for (const r of running) r.proc.kill('SIGTERM'); running = []; });
const start = async () => { const r = await startRunner(); running.push(r); return r; };

describe('starting the runner', () => {
  it('prints a 127.0.0.1 URL with a token, and that URL lets the browser in', async () => {
    const r = await start();
    expect(r.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]{43}$/);
    expect(r.cookie).toMatch(/^gmx-cypher=[\w-]{43}$/);
    expect((await fetch(new URL('/api/state', r.url))).status).toBe(401);
  });

  it('loads the Matrix unchanged through the resolve hook', async () => {
    const { json } = await api<{ name: string; tokens: { t: string }[] }>(await start(), '/api/state');
    expect(json.name).toBe('gmx-cypher');
    expect(json.tokens.map(t => t.t)).toContain('{seq}');
  });

  it('makes a new token at every start', async () => {
    const a = await start(), b = await start();
    expect(new URL(a.url).searchParams.get('token')).not.toBe(new URL(b.url).searchParams.get('token'));
  });
});

describe('gmx in the running server', () => {
  it('reports the configured gmx, and re-checks it when the setting changes', async () => {
    const r = await startRunner(['--gmx', FAKE_GMX]);
    running.push(r);
    const s = await api<{ gmx: { ok: boolean; version: string; path: string } }>(r, '/api/state');
    expect(s.json.gmx).toMatchObject({ ok: true, version: '2025.4-PLUMED_spack', path: FAKE_GMX });
    const c = await api<{ gmx: { ok: boolean; error: string } }>(r, '/api/config', { gmx: '/no/such/gmx' });
    expect(c.json.gmx).toMatchObject({ ok: false, error: '/no/such/gmx: not found' });
    expect(readFileSync(r.home + '/config.json', 'utf8')).toContain('/no/such/gmx');
  });

  it('refuses settings it does not know', async () => {
    const r = await startRunner();
    running.push(r);
    expect((await api(r, '/api/config', { shell: '/bin/sh' })).status).toBe(400);
  });
});
