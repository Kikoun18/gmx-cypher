import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, FAKE_GMX, RUNNER, startRunner, tmp, type Started } from './helpers';

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

describe('SIGHUP: the terminal or SSH session closed (R2a, T157)', () => {
  it('keeps the runner going: it says so, still answers when its terminal is gone, and the job ends done with its record', async () => {
    const dir = tmp('nvt');
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const r = await startRunner(['--gmx', FAKE_GMX, '--allow', dir], { FAKE_GMX_SLOW: '150' });
    running.push(r);
    const groups = [
      { role: 'reference', name: 'sulfur', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'name', value: 'S1' } }] },
      { role: 'selection', name: 'water_O', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'name', value: 'OW1', resn: 'SOL' } }] },
    ];
    const started = await api<{ id: string }>(r, '/api/runs', { inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups, options: {} });
    expect(started.status).toBe(200);
    r.proc.kill('SIGHUP');
    await new Promise(res => setTimeout(res, 300));
    expect(r.out()).toContain('SIGHUP: the terminal closed; gmx-cypher keeps running');
    // The terminal is gone: writing to it fails (EPIPE here), and the runner must not die of that.
    r.proc.stdout!.destroy(); r.proc.stderr!.destroy();
    r.proc.kill('SIGHUP');
    let job: { status: string } | undefined;
    for (let i = 0; i < 100 && job?.status !== 'done'; i++) {
      await new Promise(res => setTimeout(res, 100));
      job = (await api<{ id: string; status: string }[]>(r, '/api/jobs')).json.find(j => j.id === started.json.id);
    }
    expect(r.proc.exitCode).toBeNull();
    expect(job?.status).toBe('done');
    expect(existsSync(join(dir, 'rdf/rdf_nvt.run.json'))).toBe(true);
  }, 30_000);
});

