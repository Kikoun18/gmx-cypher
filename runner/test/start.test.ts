import { afterEach, describe, expect, it } from 'vitest';
import { api, startRunner, type Started } from './helpers';

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

  it('loads PMF Sequences unchanged through the resolve hook', async () => {
    const { json } = await api<{ name: string; tokens: { t: string }[] }>(await start(), '/api/state');
    expect(json.name).toBe('gmx-cypher');
    expect(json.tokens.map(t => t.t)).toContain('{seq}');
  });

  it('makes a new token at every start', async () => {
    const a = await start(), b = await start();
    expect(new URL(a.url).searchParams.get('token')).not.toBe(new URL(b.url).searchParams.get('token'));
  });
});
