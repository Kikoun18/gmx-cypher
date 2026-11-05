// A built system's PMF (R8c, R8d, question 12): the multiwalker one, from walker 1's energy file. Its numbers are the
// Matrix's own (checked against its curveStats on the real AWH fixture); the summary's report finds walker 1's files,
// offers set-up on them inside the allowed folders only, and reads the newest PMF set-up made there, its file checked
// against its job's record.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { curveStats, ENTROPY } from '../../matrix/src/lib/seq';
import type { Run } from '../../matrix/src/lib/types';
import { lastFrame, pmfNumbers, PMF_FROM, refT } from '../src/lib/build/pmf';
import { DEFAULT_PLAN } from '../src/lib/build/plan';
import { startRun } from '../server/runs';
import { apiServer, baseFolder, RUNNER } from './helpers';

const T20 = readFileSync(RUNNER + 'test/fixtures/awh/out/awh_t20.xvg', 'utf8');
const until = async <T>(f: () => Promise<T | undefined>, ms = 30_000): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 50))) { const v = await f(); if (v !== undefined) return v; }
  throw new Error('waited ' + ms + ' ms');
};

describe('the PMF\'s numbers, the Matrix\'s own', () => {
  it('min, where, and the area, as the Matrix computes a cell from the same curve at the same temperature', () => {
    const rows = T20.split('\n').filter(l => /^\s*[\d.-]/.test(l)).map(l => l.trim().split(/\s+/).map(Number));
    for (const temp of [310.15, 300]) {
      const m = curveStats({ x: rows.map(r => r[0]), y: rows.map(r => r[1]), temp } as unknown as Run, ENTROPY);
      expect(pmfNumbers(T20, temp)).toEqual({ min: m.min, at: m.at, area: m.area, points: rows.length });
    }
    expect(pmfNumbers('@ title "AWH"\n0.3 1\n0.4 0\n', 310.15)).toEqual({ error: 'fewer than four points' });
  });
  it('the temperature from the mdp: its first ref_t, either spelling, comments left out', () => {
    expect(refT('tcoupl = v-rescale\nref_t                   = 310.15  310.15 ; K\n')).toBe(310.15);
    expect(refT('ref-t = 300\n')).toBe(300);
    expect(refT('; ref_t = 280\nnsteps = 10\n')).toBeNull();
  });
  it('a set-up job\'s last frame, the first bias at that time; nothing from a job that is not a finished AWH one', () => {
    const out = (n: string) => ({ kind: 'xvg' as const, path: '/x/awh/' + n, size: 1, sha256: n });
    const r = { format: 'gmx-cypher run' as const, analysis: 'awh', status: 'done' as const, complete: true, record: 'awh_9.multiwalker.run.json', outputs: ['awh_9.multiwalker_t8.xvg', 'awh_9.multiwalker2_t16.xvg', 'awh_9.multiwalker1_t16.xvg'].map(out) };
    expect(lastFrame(r)).toEqual({ name: 'awh_9.multiwalker1_t16.xvg', frame: { suffix: '1_t16.xvg', bias: 1, time: 16 }, sha256: 'awh_9.multiwalker1_t16.xvg' });
    for (const bad of [{ analysis: 'energy' }, { status: 'failed' as const }, { complete: false }, { outputs: [] }]) expect(lastFrame({ ...r, ...bad })).toBeNull();
  });
});

describe('the summary\'s PMF, from a built system', () => {
  it('none until the walkers ran; then set-up on walker 1, inside the allowed folders only; then its PMF\'s numbers', async () => {
    const s = await apiServer(), base = baseFolder(), allowed = join(base, '..');
    await s.call('/api/config', { allow: [allowed], base, python: RUNNER + 'test/fake-python.mjs', buildWait: { every: 1, max: 5 } });
    await s.call('/api/build/start', { plan: DEFAULT_PLAN, systems: { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh'], repeats: 0 }, ifExists: 'continue', onFailure: 'next' });
    const run = await until(async () => { const [r] = (await s.call('/api/build/runs')).json; return r.status !== 'running' ? r : undefined; });
    const report = async () => (await s.call('/api/build/runs/' + run.id + '/report')).json.pmfRows;
    expect(await report()).toEqual([{ name: 'hmr+fast+6/o111/hhhhhhhh', dir: 'solutions/hmr+fast+6/o111/hhhhhhhh', edr: null, tpr: null, refused: null, pmf: null }]);
    // The walkers ran on the cluster: walker 1's energy file and run input (the real AWH test run's), its mdout at 300 K.
    const w1 = join(base, 'solutions/hmr+fast+6/o111/hhhhhhhh', PMF_FROM.folder);
    mkdirSync(w1, { recursive: true });
    copyFileSync(RUNNER + 'test/fixtures/awh/awh.edr', join(w1, '9.multiwalker.edr'));
    copyFileSync(RUNNER + 'test/fixtures/awh/topol.tpr', join(w1, '9.multiwalker.tpr'));
    writeFileSync(join(w1, '9.multiwalker_mdout.mdp'), 'ref_t                   = 300 300\n');
    expect(await report()).toEqual([expect.objectContaining({ edr: join(w1, '9.multiwalker.edr'), tpr: join(w1, '9.multiwalker.tpr'), refused: null, pmf: null })]);
    // Set-up's AWH job on them, as the summary's button fills it: its frames go to 9.multiwalker/1/awh/.
    const { record } = await startRun(s.ctx, { tool: 'awh', inputs: { edr: join(w1, '9.multiwalker.edr'), runInput: join(w1, '9.multiwalker.tpr') }, groups: [], options: { b: '20' } }, [allowed]);
    expect((await record).status).toBe('done');
    const [row] = await report();
    expect(row.pmf).toEqual({
      file: 'solutions/hmr+fast+6/o111/hhhhhhhh/9.multiwalker/1/awh/awh_9.multiwalker_t20.xvg', time: 20, job: expect.any(String), temp: 300, tempFrom: 'ref_t of 9.multiwalker_mdout.mdp',
      numbers: pmfNumbers(T20, 300), problem: null,
    });
    // A file changed after its job: no numbers, said.
    writeFileSync(join(w1, 'awh/awh_9.multiwalker_t20.xvg'), T20 + '# changed by hand\n');
    expect((await report())[0].pmf).toMatchObject({ numbers: null, problem: 'awh_9.multiwalker_t20.xvg changed since its job wrote it' });
    // Outside the allowed folders: not offered, with where to add it.
    await s.call('/api/config', { allow: [RUNNER + 'test/fixtures'] });
    expect((await report())[0].refused).toBe('not offered: ' + join(w1, '9.multiwalker.edr') + ' is outside the allowed folders · add the base folder\'s folder in settings');
    await s.close();
  }, 60_000);
});
