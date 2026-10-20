import { writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApi, type Ctx } from '../server/api';
import { startServer } from '../server/http';
import { Jobs } from '../server/jobs';
import { DEFAULT_CONFIG } from '../server/state';
import { FAKE_GMX, tmp } from './helpers';

const TOKEN = 't'.repeat(43);
let server: Server, base: string, ctx: Ctx;
beforeAll(async () => {
  const home = tmp('home');
  ctx = { home, version: '0', config: { ...DEFAULT_CONFIG }, gmx: { ok: true, name: 'gmx', path: FAKE_GMX }, jobs: new Jobs(join(home, 'jobs')) };
  server = await startServer({ token: TOKEN, port: 0, api: makeApi(ctx) });
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterAll(() => new Promise(r => server.close(r)));
const headers = { cookie: 'gmx-cypher=' + TOKEN };

function listen(onEvent: (name: string, data: unknown) => boolean) {
  return new Promise<void>((resolve, reject) => {
    const r = request(base + '/api/events', { headers }, res => {
      expect(res.headers['content-type']).toBe('text/event-stream');
      let buf = '';
      res.on('data', d => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const name = /^event: (.+)$/m.exec(chunk)?.[1], data = /^data: (.+)$/m.exec(chunk)?.[1];
          if (name && data && onEvent(name, JSON.parse(data))) { r.destroy(); resolve(); }
        }
      });
    });
    r.on('error', e => (e.message.includes('aborted') || e.message.includes('socket hang up') ? resolve() : reject(e)));
    r.end();
  });
}

describe('jobs over HTTP', () => {
  it('streams a job as it runs: its state, its output, and its end; then lists and shows it', async () => {
    const cwd = tmp('sim');
    writeFileSync(join(cwd, 'g.ndx'), '[ a ]\n 1\n[ b ]\n 2\n');
    const seen: string[] = [];
    let id = '';
    const done = listen((name, d) => {
      const x = d as { id: string; status?: string; s?: string; log?: string };
      if (x.id !== id) return false;
      seen.push(name === 'job' ? 'job:' + x.status : 'out');
      expect(x.log).toBeUndefined();
      return name === 'job' && x.status === 'done';
    });
    await new Promise(r => setTimeout(r, 100));
    id = ctx.jobs.start({ kind: 'rdf', title: 'rdf_x', file: FAKE_GMX, args: ['rdf', '-n', 'g.ndx', '-ref', 'group 0', '-sel', 'group 1', '-o', 'o.xvg'], cwd }).id;
    await done;
    expect(seen).toContain('out');
    expect(seen.at(-1)).toBe('job:done');
    const list = await (await fetch(base + '/api/jobs', { headers })).json();
    expect(list.find((j: { id: string }) => j.id === id)).toMatchObject({ status: 'done', title: 'rdf_x' });
    expect(list[0].log).toBeUndefined();
    // The log from its file (R12a): its tail, and every character with from=0.
    const one = await (await fetch(base + '/api/jobs/' + id, { headers })).json();
    expect(one.log).toBeUndefined();
    const log = await (await fetch(base + '/api/jobs/' + id + '/log?from=0', { headers })).json();
    expect([log.text, log.from, log.size]).toEqual([expect.stringContaining('Analyzed 11 frames'), 0, one.logSize]);
    expect((await fetch(base + '/api/jobs/' + id + '/log?from=x', { headers })).status).toBe(400);
  });

  it('cancels a running job by its id, and refuses an unknown one', async () => {
    const id = ctx.jobs.start({ kind: 'test', title: 'slow', file: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'], cwd: tmp('sim') }).id;
    const r = await fetch(base + '/api/jobs/' + id + '/cancel', { method: 'POST', headers });
    expect(r.status).toBe(200);
    await new Promise(res => setTimeout(res, 300));
    expect(ctx.jobs.get(id)!.status).toBe('cancelled');
    expect((await fetch(base + '/api/jobs/nope/cancel', { method: 'POST', headers })).status).toBe(404);
  });
});
