// Failures, retries, repeats and resume (R6), with the fake tools: the notebook's real AWH box error stops a system
// with its hint; resume continues it in its folder at the step that stopped, nothing before rewritten; rebuild moves
// the folder to failed/<sequence>_<stamp>/ with FAILED.txt and builds anew; a folder that exists is continued (if a
// gmx-cypher build made it), skipped, or built beside as a repeat; a walker whose grompp fails (walker 8's real
// pbcatom error) is set aside and rebuilt once from the nearest working walker.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Builder, jobsExec, type BuildRecord } from '../server/build-run';
import { Jobs } from '../server/jobs';
import { DEFAULT_PLAN, type BuildPlan } from '../src/lib/build/plan';
import { baseFolder, FAKE_GMX, RUNNER, tmp } from './helpers';

const ONE = { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh'], repeats: 0 };
const S = 'solutions/hmr+fast+6/o111/hhhhhhhh';
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const opts = (base: string, ifExists: 'continue' | 'skip' | 'repeat' = 'continue') => ({ base, ifExists, onFailure: 'next' as const });

function builder() {
  const home = tmp('home'), jobs = new Jobs(join(home, 'builds/jobs')), { exec, cancel } = jobsExec(jobs);
  return new Builder({ home, version: '0', exec, cancel, tools: () => ({ gmx: FAKE_GMX, python: RUNNER + 'test/fake-python.mjs' }), wait: { every: 20, max: 2000 } });
}
/** The fake grompp fails for this output until the marker file exists (it makes it at the first failure). */
function failOnce(output: string) { process.env.FAKE_GMX_FATAL = output; process.env.FAKE_GMX_FATAL_ONCE = join(tmp('once'), 'failed'); }
afterEach(() => { delete process.env.FAKE_GMX_FATAL; delete process.env.FAKE_GMX_FATAL_ONCE; });

describe('a failed system, again', () => {
  it('stops with the AWH box error and its hint; resume continues at that step, nothing before it rewritten', async () => {
    const base = baseFolder(), b = builder();
    failOnce('7.awh.tpr');
    const first = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    expect(first.systems[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/^AWH · grompp 7\.awh: Fatal error:\nDistance between pull groups/) });
    expect(first.systems[0].notes.at(-1)).toMatch(/^hint: the pull groups are farther apart than 0\.49 times the box: set pull-pbc-ref-prev-step-com = yes/);
    const salted = hash(join(base, S, '3.salted.gro')), top = hash(join(base, S, 'hhhhhhhh.top'));
    const again = b.retry(first.id, S, 'resume');
    expect(() => b.retry(first.id, S, 'resume')).toThrow(/was taken again by build b\w+: retry that one/);
    const second = await again.done;
    expect(second.systems[0]).toMatchObject({ status: 'cluster', attempt: 2 });
    // It keeps its earlier notes (the ions), then says where it continued.
    expect(second.systems[0].notes[0]).toBe('net charge 0.00 e: 30 NA_s and 30 CL_2s');
    expect(second.systems[0].notes.find(n => n.startsWith('continued'))).toMatch(/^continued at step \d+ of \d+: grompp 7\.awh$/);
    expect(b.get(first.id)!.systems[0].retried).toBe(second.id);
    expect([hash(join(base, S, '3.salted.gro')), hash(join(base, S, 'hhhhhhhh.top'))]).toEqual([salted, top]);
    const rec: BuildRecord = JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
    expect(rec.build).toBe(second.id);
    expect(rec.steps.filter(x => x.label === 'grompp 7.awh').map(x => x.status)).toEqual(['failed', 'done']);
    expect(existsSync(join(base, S, '8.pull/8.pull.tpr'))).toBe(true);
    expect(() => b.retry(second.id, S, 'resume')).toThrow('only a failed or cancelled system is retried');
  }, 60_000);

  it('rebuild moves the folder to failed/ with FAILED.txt, never deleting it, and builds anew', async () => {
    const base = baseFolder(), b = builder();
    failOnce('7.awh.tpr');
    const first = await b.start(DEFAULT_PLAN, ONE, opts(base)).done;
    const second = await b.retry(first.id, S, 'rebuild').done;
    expect(second.systems[0]).toMatchObject({ status: 'cluster', attempt: 2, notes: expect.arrayContaining(['the failed folder was moved to solutions/hmr+fast+6/o111/failed/']) });
    const [moved] = readdirSync(join(base, 'solutions/hmr+fast+6/o111/failed'));
    expect(moved).toMatch(/^hhhhhhhh_\d{8}_\d{6}$/);
    const failed = join(base, 'solutions/hmr+fast+6/o111/failed', moved);
    expect(readFileSync(join(failed, 'FAILED.txt'), 'utf8')).toMatch(/^AWH · grompp 7\.awh: Fatal error:/);
    expect(existsSync(join(failed, '7.awh/7.awh.tpr'))).toBe(false);
    expect(JSON.parse(readFileSync(join(failed, 'build.json'), 'utf8')).build).toBe(first.id);
    expect(JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'))).toMatchObject({ build: second.id, status: 'cluster' });
  }, 60_000);
});

describe('a folder that exists', () => {
  it('skip leaves it; continue leaves one no gmx-cypher build made; repeat builds beside it', async () => {
    const base = baseFolder();
    mkdirSync(join(base, S), { recursive: true });
    writeFileSync(join(base, S, 'notes.txt'), 'the notebook built this\n');
    const skip = await builder().start(DEFAULT_PLAN, ONE, opts(base, 'skip')).done;
    expect(skip.systems[0]).toMatchObject({ status: 'skipped', notes: [S + ' exists: it is left as it is'] });
    const cont = await builder().start(DEFAULT_PLAN, ONE, opts(base, 'continue')).done;
    expect(cont.systems[0]).toMatchObject({ status: 'skipped', notes: [S + ' exists, and no gmx-cypher build made it (no build.json of its own): it is left as it is · choose repeat to build beside it'] });
    expect(readdirSync(join(base, S))).toEqual(['notes.txt']);
    const rep = await builder().start(DEFAULT_PLAN, ONE, opts(base, 'repeat')).done;
    expect(rep.systems[0]).toMatchObject({ status: 'cluster', dir: 'solutions/hmr+fast+6r/o111/hhhhhhhh', method: 'hmr+fast+6r', notes: expect.arrayContaining([S + ' exists: built as the repeat hmr+fast+6r beside it']) });
    expect(existsSync(join(base, 'solutions/hmr+fast+6r/o111/hhhhhhhh/8.pull/8.pull.tpr'))).toBe(true);
  }, 60_000);
});

describe('the walkers', () => {
  // The pull's pullx.xvg as the cluster leaves it: constructed here, the notebook's span (0.64 to 3.27 nm over 15001
  // samples, 2 ps apart), rising evenly; its trajectory as a placeholder the fake trjconv does not read.
  const pull = () => '# constructed: the notebook\'s pull span\n@    title "Pull COM"\n' + Array.from({ length: 15001 }, (_, i) => (2 * i).toFixed(1) + '\t' + (0.64 + (3.27 - 0.64) * i / 15000).toFixed(4)).join('\n') + '\n';
  const WALKERS: BuildPlan = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => ({ ...s, on: true, tiles: s.tiles.map(t => ({ ...t, on: t.type !== 'glucose' })) })) };

  it('wait for the pull; then each is prepared, and one that fails is rebuilt once from the nearest working walker', async () => {
    const base = baseFolder(), b = builder();
    const first = await b.start(WALKERS, ONE, opts(base)).done;
    expect(first.systems[0]).toMatchObject({ status: 'cluster', notes: expect.arrayContaining(['waits for its pull: 8.pull/pullx.xvg']) });
    writeFileSync(join(base, S, '8.pull/pullx.xvg'), pull());
    writeFileSync(join(base, S, '8.pull/8.pull.xtc'), 'placeholder: the pull\'s trajectory\n');
    failOnce('8/9.multiwalker.tpr');
    const second = await b.start(WALKERS, ONE, opts(base)).done;
    const s = second.systems[0];
    expect(s.error).toBeUndefined();
    expect(s.status).toBe('cluster');
    expect(s.notes.find(n => n.startsWith('walker 1 starts'))).toBe('walker 1 starts at 0.640 nm, 0.24 nm from its target 0.4 nm');
    expect(s.notes.find(n => n.startsWith('walker 8 failed'))).toMatch(/^walker 8 failed: WALKERS · walker 8: grompp: ERROR 1 \[file .*hmr_multi\.mdp\]:/);
    expect(s.notes.find(n => n.startsWith('walker 8 ('))).toMatch(/^walker 8 \(3 nm\) rebuilt once from walker 7's start \(2\.5 nm\); its failed folder is solutions\/hmr\+fast\+6\/o111\/hhhhhhhh\/9\.multiwalker\/failed\/8_\d{8}_\d{6}$/);
    expect(s.submit.at(-1)).toBe('qq submit -q gpu ' + S + '/9.multiwalker/hmr+fast+6_awh_multi_hhhhhhhh.sh');
    for (let n = 1; n <= 8; n++) expect(existsSync(join(base, S, '9.multiwalker', String(n), '9.multiwalker.tpr'))).toBe(true);
    const [moved] = readdirSync(join(base, S, '9.multiwalker/failed'));
    // grompp writes its mdout before it fails, as the real one does; both stay in the folder moved aside.
    expect(readdirSync(join(base, S, '9.multiwalker/failed', moved)).sort()).toEqual(['9.multiwalker_mdout.mdp', 'start.gro']);
    const rec: BuildRecord = JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
    expect(rec.moved).toEqual([{ from: S + '/9.multiwalker/8', to: S + '/9.multiwalker/failed/' + moved, walker: 8, donor: 7 }]);
    expect(rec.files[S + '/9.multiwalker/failed/' + moved + '/start.gro']).toBeDefined();
  }, 60_000);
});
