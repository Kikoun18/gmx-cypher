import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Cluster } from '../server/cluster';
import { capture } from '../server/gmx';
import { apiServer, RUNNER, tmp } from './helpers';

// The cluster runner (R10a) with fakes that print your samples: qq jobs and gmx-eta -a, on this machine, one at a time.
const QQ = RUNNER + 'test/fake-qq.mjs', ETA = RUNNER + 'test/fake-gmx-eta.mjs';
const env = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
afterEach(() => { for (const k of ['FAKE_QQ_LOG', 'FAKE_QQ_SLOW', 'FAKE_QQ_FAIL']) env(k, undefined); });
const log = () => { const f = join(tmp('qq'), 'log'); writeFileSync(f, ''); env('FAKE_QQ_LOG', f); return () => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); };

describe('reading the cluster (R10a)', () => {
  it('qq jobs and gmx-eta -a, parsed; qq drawn wide; gmx-eta kept with its path and SHA-256', async () => {
    const calls = log(), c = new Cluster(() => ({ qq: QQ, gmxEta: ETA }));
    const r = await c.read(false);
    expect(r.qq.ok && r.qq.table.jobs).toHaveLength(11);
    expect(r.qq).toMatchObject({ ok: true, path: QQ, args: ['jobs'] });
    expect(r.eta).toMatchObject({ ok: true, path: ETA, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(r.eta.ok && r.eta.lines).toHaveLength(17);
    expect(calls()).toEqual([{ args: ['jobs'], columns: '250' }]);
  });

  it('"show finished" runs qq jobs -a; nothing else is ever run', async () => {
    const calls = log(), c = new Cluster(() => ({ qq: QQ, gmxEta: ETA }));
    expect((await c.read(true)).qq).toMatchObject({ ok: true, args: ['jobs', '-a'] });
    expect(calls().map(x => x.args)).toEqual([['jobs', '-a']]);
  });

  it('reads never overlap, and a recent one is reused', async () => {
    const calls = log(), c = new Cluster(() => ({ qq: QQ, gmxEta: ETA }));
    env('FAKE_QQ_SLOW', '300');
    const [a, b] = await Promise.all([c.read(false), c.read(false, 0)]);
    expect(a).toBe(b);
    expect(await c.read(false)).toBe(a);
    expect(calls()).toHaveLength(1);
    await c.read(false, 0);
    expect(calls()).toHaveLength(2);
    // The other list asked for during a read: run after it, never alongside, and never answered with it.
    const [now, finished] = await Promise.all([c.read(false, 0), c.read(true)]);
    expect([now.finished, finished.finished]).toEqual([false, true]);
    expect(calls().map(x => x.args)).toEqual([['jobs'], ['jobs'], ['jobs'], ['jobs', '-a']]);
  });

  it('what went wrong, in words: not on PATH, its own message with the ticket hint, too slow', async () => {
    const missing = await new Cluster(() => ({ qq: 'qq-not-here', gmxEta: 'gmx-eta-not-here' })).read(false);
    expect(missing.qq).toEqual({ ok: false, error: 'qq-not-here is not on PATH: start gmx-cypher from a shell where qq jobs works (after kinit), or set its path in settings' });
    expect(missing.eta).toEqual({ ok: false, error: 'gmx-eta-not-here is not on PATH: the ETA column shows — (set its path in settings)' });
    env('FAKE_QQ_FAIL', '1');
    const failed = await new Cluster(() => ({ qq: QQ, gmxEta: ETA })).read(false);
    expect(failed.qq).toEqual({ ok: false, error: 'qq jobs failed (exit 1): fake qq (invented text): could not authenticate: no valid Kerberos ticket\nyour Kerberos ticket may have expired: run kinit in a terminal, then refresh' });
    // gmx-eta still ran: its column is filled even when qq failed.
    expect(failed.eta.ok).toBe(true);
  });

  it('a tool past its time is stopped with everything it started (review): no program left behind to overlap the next read', async () => {
    const dir = tmp('hang'), script = join(dir, 'hang.mjs'), pidFile = join(dir, 'child.pid');
    // Starts a child that holds the output open, as a tool calling ssh or cat might, then waits.
    writeFileSync(script, "import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';\n"
      + "const c = spawn('sleep', ['30'], { stdio: 'inherit' }); writeFileSync(" + JSON.stringify(pidFile) + ", String(c.pid)); setTimeout(() => {}, 30000);\n");
    const started = Date.now(), r = await capture(process.execPath, [script], { timeoutMs: 500, group: true });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    // Stopped, not running: gone, or a zombie nobody reaps in a container (Linux's /proc says which).
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await new Promise(res => setTimeout(res, 200));
    let state = 'gone';
    try { state = /State:\s+(\S)/.exec(readFileSync('/proc/' + pid + '/status', 'utf8'))![1]; } catch { /* gone, or no /proc */ }
    expect(['gone', 'Z', 'X']).toContain(state);
  });

  it('the API: POST /api/cluster, and the tools set in settings (a name or a path, nothing a shell would read)', async () => {
    const s = await apiServer();
    s.ctx.config = { ...s.ctx.config, qq: QQ, gmxEta: ETA };
    const r = await s.call('/api/cluster', { finished: false });
    expect(r.status).toBe(200);
    expect(r.json.qq.table.counts).toEqual({ R: 9, Q: 2, 'Σ': 11 });
    const refused = { error: 'qq: qq (found on PATH), or the absolute path of a program that exists' };
    for (const qq of ['qq; rm -rf ~', 'rm', 'test/fake-qq.mjs', '/no/such/qq']) expect((await s.call('/api/config', { qq })).json).toEqual(refused);
    expect((await s.call('/api/config', { qq: 'qq' })).status).toBe(200);
    expect((await s.call('/api/config', { gmxEta: ETA })).status).toBe(200);
    await s.close();
  });
});
