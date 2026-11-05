// The batch 5 review's findings, each as the case that showed it: the builder reading the settings as they are now,
// resuming after a step that left part of its output, awh submitted only once its run input exists, a resume after an
// optional output went missing, a malformed or tampered build.json, a link out of the base folder, a stale retry, the
// notes a continued system keeps, and the walkers' frames read again when the pull is there.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Builder, jobsExec, PYTHON_DIR, type BuildRecord } from '../server/build-run';
import { Jobs } from '../server/jobs';
import { DEFAULT_PLAN, type BuildPlan } from '../src/lib/build/plan';
import { apiServer, baseFolder, FAKE_GMX, RUNNER, tmp } from './helpers';

const ONE = { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh'], repeats: 0 };
const S = 'solutions/hmr+fast+6/o111/hhhhhhhh';
const opts = (base: string) => ({ base, ifExists: 'continue' as const, onFailure: 'next' as const });
const WALKERS: BuildPlan = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => ({ ...s, on: true, tiles: s.tiles.map(t => ({ ...t, on: t.type !== 'glucose' })) })) };
function builder(more: Partial<ConstructorParameters<typeof Builder>[0]> = {}) {
  const home = tmp('home'), jobs = new Jobs(join(home, 'builds/jobs')), { exec, cancel } = jobsExec(jobs);
  return new Builder({ home, version: '0', exec, cancel, tools: () => ({ gmx: FAKE_GMX, python: RUNNER + 'test/fake-python.mjs' }), wait: { every: 20, max: 2000 }, ...more });
}
const record = (base: string): BuildRecord => JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
afterEach(() => { for (const k of ['FAKE_GMX_FATAL', 'FAKE_GMX_FATAL_ONCE', 'FAKE_QQ_LOG']) delete process.env[k]; });

describe('the server\'s builder reads the settings as they are now (finding 1)', () => {
  it('gmx set after the start, submit turned off after the start: the builder follows both', async () => {
    const s = await apiServer({ gmx: { ok: false, name: null, path: null } as never }), base = baseFolder();
    await s.call('/api/config', { allow: [join(base, '..')], base, python: RUNNER + 'test/fake-python.mjs', buildWait: { every: 1, max: 5 }, qq: RUNNER + 'test/fake-qq.mjs', qqBuild: { profiles: {}, submit: true, queue: 'gpu' } });
    expect((await s.call('/api/build/start', { plan: DEFAULT_PLAN, systems: ONE })).status).toBe(409);
    // The server's own gmx check, as settings → gmx runs it.
    s.ctx.gmx = { ok: true, name: 'gmx', path: FAKE_GMX } as never;
    await s.call('/api/config', { qqBuild: { profiles: {}, submit: false, queue: 'gpu' } });
    process.env.FAKE_QQ_LOG = join(tmp('qq'), 'log');
    await s.call('/api/build/start', { plan: DEFAULT_PLAN, systems: ONE });
    for (let i = 0; i < 300 && (await s.call('/api/build/runs')).json[0].status === 'running'; i++) await new Promise(r => setTimeout(r, 50));
    expect((await s.call('/api/build/runs')).json[0].systems[0].status).toBe('cluster');
    expect(existsSync(process.env.FAKE_QQ_LOG)).toBe(false);
    await s.close();
  }, 60_000);
});

describe('resume, after what real tools leave', () => {
  it('a grompp that failed after writing its mdout: resume runs it again (finding 2)', async () => {
    const base = baseFolder(), b = builder();
    process.env.FAKE_GMX_FATAL = '7.awh.tpr'; process.env.FAKE_GMX_FATAL_ONCE = join(tmp('once'), 'm');
    const first = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    expect(existsSync(join(base, S, '7.awh/7.awh_mdout.mdp'))).toBe(true);
    expect(record(base).files[S + '/7.awh/7.awh_mdout.mdp']).toBeDefined();
    const second = await b.retry(first.id, S, 'resume').done;
    expect(second.systems[0]).toMatchObject({ status: 'cluster' });
    expect(record(base).backups).toContain(S + '/7.awh/#7.awh_mdout.mdp.1#');
  }, 60_000);

  it('awh is submitted only after its grompp made the run input (finding 3)', async () => {
    const base = baseFolder(), log = join(tmp('qq'), 'log'), b = builder({ submit: () => ({ qq: RUNNER + 'test/fake-qq.mjs', queue: 'gpu' }) });
    process.env.FAKE_QQ_LOG = log; process.env.FAKE_GMX_FATAL = '7.awh.tpr'; process.env.FAKE_GMX_FATAL_ONCE = join(tmp('once'), 'm');
    const run = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    expect(run.systems[0].status).toBe('failed');
    expect(existsSync(log)).toBe(false);
    expect(run.systems[0].notes.some(n => n.includes('submitted'))).toBe(false);
  }, 60_000);

  it('a trajectory gone from an earlier stage is not a reason to run it again; a needed output is, and re-runs over the build\'s own files (finding 4)', async () => {
    const base = baseFolder(), b = builder();
    const first = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    unlinkSync(join(base, S, '5.eqnvt/5.eqnvt.trr'));
    const second = await b.goOn(first.id, S).done;
    expect(second.systems[0]).toMatchObject({ status: 'cluster' });
    expect(second.systems[0].notes.find(n => n.startsWith('continued'))).toMatch(/: walker 1: its start frame$|every step was done before|waits/);
    // A needed output gone: from its step, the steps after it writing over the build's own files.
    unlinkSync(join(base, S, '5.eqnvt/5.eqnvt.tpr'));
    const third = await b.goOn(second.id, S).done;
    expect(third.systems[0].error).toBeUndefined();
    expect(third.systems[0].notes.find(n => n.startsWith('continued'))).toMatch(/: grompp 5\.eqnvt$/);
    expect(existsSync(join(base, S, '5.eqnvt/5.eqnvt.tpr'))).toBe(true);
  }, 90_000);

  it('a build.json that is not a whole gmx-cypher record is not continued, and nothing crashes (finding 5)', async () => {
    const base = baseFolder(), b = builder();
    mkdirSync(join(base, S), { recursive: true });
    writeFileSync(join(base, S, 'build.json'), JSON.stringify({ format: 'gmx-cypher build', version: 1 }));
    const run = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    expect(run.systems[0]).toMatchObject({ status: 'skipped', notes: [expect.stringMatching(/no gmx-cypher build made it/)] });
  }, 30_000);
});

describe('what a build may write (findings 6, 7, 8)', () => {
  it('a link in the base folder that leads out of it: nothing written through it', async () => {
    const base = baseFolder(), out = tmp('outside');
    symlinkSync(out, join(base, 'solutions'));
    const run = await builder().start(DEFAULT_PLAN, ONE, opts(base)).done;
    expect(run.systems[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/solutions is a link: nothing is written through it/) });
    expect(readdirSync(out)).toEqual([]);
  }, 30_000);

  it('a build.json whose names are not names (a sequence with ../) is not gmx-cypher\'s: no retry moves anything', async () => {
    const base = baseFolder(), b = builder();
    process.env.FAKE_GMX_FATAL = '7.awh.tpr';
    const first = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    const rec = record(base);
    writeFileSync(join(base, S, 'build.json'), JSON.stringify({ ...rec, system: { ...rec.system, sequence: '../../../../elsewhere' } }));
    expect(() => b.retry(first.id, S, 'rebuild')).toThrow(/has no build\.json of gmx-cypher's/);
    expect(existsSync(join(base, S))).toBe(true);
  }, 60_000);

  it('a retry of an old build, after a later one built the system again, is refused (finding 8)', async () => {
    const base = baseFolder(), b = builder();
    process.env.FAKE_GMX_FATAL = '7.awh.tpr'; process.env.FAKE_GMX_FATAL_ONCE = join(tmp('once'), 'm');
    const a = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    await b.retry(a.id, S, 'resume').done;
    expect(() => b.retry(a.id, S, 'rebuild')).toThrow(/was taken again by build/);
    expect(existsSync(join(base, 'solutions/hmr+fast+6/o111/failed'))).toBe(false);
  }, 60_000);
});

describe('a continued system (findings 9, 10)', () => {
  it('keeps its notes and submit lines; the walkers\' frames are read when the pull is there, not before', async () => {
    const base = baseFolder(), b = builder();
    const first = await b.start(WALKERS, ONE, opts(base)).done;
    writeFileSync(join(base, S, '8.pull/pullx.xvg'), '# no samples yet\n@    title "Pull COM"\n');
    writeFileSync(join(base, S, '8.pull/8.pull.xtc'), 'placeholder\n');
    const second = await b.goOn(first.id, S).done;
    expect(second.systems[0]).toMatchObject({ status: 'cluster' });
    expect(second.systems[0].notes).toEqual(expect.arrayContaining(['net charge after npt: 0.00 e', 'waits for its pull: 8.pull/pullx.xvg has no distances yet']));
    expect(second.systems[0].submit.slice(0, 2)).toEqual(['qq submit -q gpu ' + S + '/7.awh/hmr+fast+6_awh_hhhhhhhh.sh', 'qq submit -q gpu ' + S + '/8.pull/hmr+fast+6_pull_hhhhhhhh.sh']);
    writeFileSync(join(base, S, '8.pull/pullx.xvg'), Array.from({ length: 301 }, (_, i) => (100 * i) + '\t' + (0.64 + (3.27 - 0.64) * i / 300).toFixed(4)).join('\n') + '\n');
    const third = await b.goOn(second.id, S).done;
    expect(third.systems[0].status).toBe('cluster');
    const dumps = record(base).steps.filter(x => x.label.endsWith('its start frame') && x.status === 'done').map(x => x.argv[x.argv.indexOf('-dump') + 1]);
    expect(dumps).toHaveLength(8);
    expect(dumps.every(t => /^\d+$/.test(t))).toBe(true);
    expect(record(base).notes).toEqual(expect.arrayContaining(['net charge after npt: 0.00 e']));
  }, 90_000);
});

describe('small ones (finding 12)', () => {
  it('the shipped scripts\' folder is a path, not a URL\'s percent-encoded one', () => {
    expect(PYTHON_DIR.endsWith('/server/python/')).toBe(true);
    expect(existsSync(join(PYTHON_DIR, 'build_peptide.py'))).toBe(true);
    rmSync(tmp('x'), { recursive: true });
  });
});
