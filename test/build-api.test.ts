// Building from the page (R5c): the server starts a build of the systems it is sent, in the base folder, one at a
// time, refuses what can't be built, and cancels a build's running step and every system after it. The page follows
// it by events; here the runs are read until the build ends. The fake gmx and python answer (R5b).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN } from '../src/lib/build/plan';
import { apiServer, baseFolder, RUNNER } from './helpers';

const SYSTEMS = { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh', 'cccccccc'], repeats: 0 };
const until = async <T>(f: () => Promise<T | undefined>, ms = 30_000): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 50))) { const v = await f(); if (v !== undefined) return v; }
  throw new Error('waited ' + ms + ' ms');
};

async function server() {
  const s = await apiServer(), base = baseFolder(), allowed = join(base, '..');
  return { s, base, ready: async () => s.call('/api/config', { allow: [allowed], base, python: RUNNER + 'test/fake-python.mjs', buildWait: { every: 1, max: 5 } }) };
}

describe('POST /api/build/start', () => {
  it('refuses with no base folder, then builds every system, one at a time, and keeps the run', async () => {
    const { s, base, ready } = await server();
    const body = { plan: DEFAULT_PLAN, systems: SYSTEMS, ifExists: 'continue', onFailure: 'next' };
    expect(await s.call('/api/build/start', body)).toMatchObject({ status: 409, json: { error: 'no base folder: set it in settings → symbuilder' } });
    expect((await ready()).status).toBe(200);
    expect((await s.call('/api/build/start', { ...body, systems: { ...SYSTEMS, repeats: 99 } })).status).toBe(400);
    const started = await s.call('/api/build/start', body);
    expect(started.json).toMatchObject({ status: 'running', base, systems: [{ dir: 'solutions/hmr+fast+6/o111/hhhhhhhh' }, { dir: 'solutions/hmr+fast+6/o111/cccccccc', status: 'waiting' }] });
    expect(await s.call('/api/build/start', body)).toMatchObject({ status: 409, json: { error: 'a build is running: one at a time' } });
    const run = await until(async () => { const [r] = (await s.call('/api/build/runs')).json; return r.status !== 'running' ? r : undefined; });
    expect(run.systems.map((x: { status: string }) => x.status)).toEqual(['cluster', 'cluster']);
    expect(existsSync(join(base, 'solutions/hmr+fast+6/o111/cccccccc/8.pull/8.pull.tpr'))).toBe(true);
    // A step's log, from the build's own job list.
    const rec = JSON.parse(readFileSync(join(base, 'solutions/hmr+fast+6/o111/hhhhhhhh/build.json'), 'utf8'));
    const genion = rec.steps.find((x: { label: string }) => x.label === 'add salt').job;
    expect((await s.call('/api/build/jobs/' + genion + '/log')).json.text).toContain('Will try to add 30 NA_s ions and 30 CL_2s ions.');
    expect((await s.call('/api/jobs')).json).toEqual([]);
    await s.close();
  }, 60_000);

  it('cancel stops the running step\'s process group and every system after it', async () => {
    const { s, base, ready } = await server();
    await ready();
    process.env.FAKE_GMX_SLOW = '20000';
    try {
      const { json: run } = await s.call('/api/build/start', { plan: DEFAULT_PLAN, systems: SYSTEMS, ifExists: 'continue', onFailure: 'next' });
      await until(async () => { const [r] = (await s.call('/api/build/runs')).json; return r.systems[0].label === 'mdrun 4.minim' && r.systems[0].job ? r : undefined; });
      expect((await s.call('/api/build/runs/' + run.id + '/cancel', {})).status).toBe(200);
      const done = await until(async () => { const [r] = (await s.call('/api/build/runs')).json; return r.status !== 'running' ? r : undefined; });
      expect(done).toMatchObject({ status: 'cancelled', systems: [{ status: 'cancelled', error: 'MIN · mdrun 4.minim: cancelled' }, { status: 'cancelled' }] });
      expect(existsSync(join(base, 'solutions/hmr+fast+6/o111/cccccccc'))).toBe(false);
      expect((await s.call('/api/build/runs/' + run.id + '/cancel', {})).status).toBe(409);
    } finally { delete process.env.FAKE_GMX_SLOW; }
    await s.close();
  }, 60_000);

  it('a retry says what it needs: resume or rebuild, of a failed system of a known build', async () => {
    const { s } = await server();
    expect((await s.call('/api/build/retry', { run: 'b1', dir: 'x', how: 'again' })).status).toBe(400);
    expect(await s.call('/api/build/retry', { run: 'b1', dir: 'solutions/m/c/q', how: 'resume' })).toMatchObject({ status: 409, json: { error: 'no system solutions/m/c/q in build b1' } });
    await s.close();
  });

  it('submits the cluster stages\' scripts when the setting says so, with qq\'s own answer (R7a, T206)', async () => {
    const { s, base, ready } = await server();
    await ready();
    const qq = RUNNER + 'test/fake-qq.mjs';
    expect((await s.call('/api/config', { qq, qqBuild: { profiles: { walkers: 'mc2022' }, submit: true, queue: 'gpu' } })))
      .toMatchObject({ status: 400, json: { error: 'walkers: the walkers run together with mdrun -multidir, which needs an MPI gmx (gmx_mpi): MetaCentrum · GROMACS 2022.3 plumed has gmx' } });
    expect((await s.call('/api/config', { qqBuild: { profiles: {}, submit: true, queue: 'gpu; rm' } })).status).toBe(400);
    expect((await s.call('/api/config', { qq, qqBuild: { profiles: { awh: 'mc2022' }, submit: true, queue: 'gpu' } })).json.config.qqBuild)
      .toEqual({ profiles: { min: 'mc2025', nvt: 'mc2025', npt: 'mc2025', awh: 'mc2022', pull: 'mc2025', walkers: 'lumi' }, submit: true, queue: 'gpu' });
    await s.call('/api/build/start', { plan: DEFAULT_PLAN, systems: { ...SYSTEMS, sequences: ['hhhhhhhh'] }, ifExists: 'continue', onFailure: 'next' });
    const run = await until(async () => { const [r] = (await s.call('/api/build/runs')).json; return r.status !== 'running' ? r : undefined; });
    expect(run.systems[0].notes).toEqual(expect.arrayContaining(['awh: qq job 1500135.robox.cluster.test submitted', 'pull: qq job 1500135.robox.cluster.test submitted']));
    // awh's script is MetaCentrum 2022's, as set; the pull's 2025's.
    expect(readFileSync(join(base, 'scripts/awh/hmr+fast+6_awh_hhhhhhhh.sh'), 'utf8')).toContain('module add gromacs:2022.3-plumed');
    expect(readFileSync(join(base, 'scripts/pull/hmr+fast+6_pull_hhhhhhhh.sh'), 'utf8')).toContain('metamodule add gromacs/2025.4-cuda');
    await s.close();
  }, 60_000);

  it('the wait for mdrun\'s .gro is a setting, checked', async () => {
    const { s } = await server();
    expect((await s.call('/api/config', { buildWait: { every: 0, max: 10 } })).status).toBe(400);
    expect((await s.call('/api/config', { buildWait: { every: 20, max: 10 } })).status).toBe(400);
    expect((await s.call('/api/config', { buildWait: { every: 10, max: 600 } })).json.config.buildWait).toEqual({ every: 10, max: 600 });
    await s.close();
  });
});
