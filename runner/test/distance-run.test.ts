import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Group } from '../src/lib/groups';
import { recipeFromRecord, recordProblems } from '../src/lib/record';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx distance (R7) on the test system: through the fake gmx (the real outputs of test/fixtures/distance), or the
// real one with GMX set.
const REAL = !!process.env.GMX;
const atoms = (name: string, tone: 'coral' | 'sky' | 'mint', role: 'reference' | 'selection', value: string): Group => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'atoms', atoms: value } }] });
const groups: Group[] = [atoms('sulfur', 'coral', 'reference', '5-30:5'), atoms('sodium', 'sky', 'selection', '31-36'), atoms('water_O', 'mint', 'selection', '43-63:4')];

async function setup(options: Record<string, string | boolean> = {}, g = groups) {
  const dir = tmp('dist');
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
  const s = await apiServer(REAL ? { gmx: { ok: true, name: 'gmx', path: process.env.GMX, version: '2025.4' } } : { gmx: { ok: true, name: 'gmx', path: FAKE_GMX, version: '2025.4-PLUMED_spack' } });
  const req: RunRequest = { tool: 'distance', inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups: g, options };
  return { dir, s, req, roots: [dir] };
}

describe('a run of gmx distance (R7)', () => {
  it('centres of mass: the averages over time, the index, the averages gmx printed in the record', async () => {
    const { dir, s, req, roots } = await setup();
    const plan = await planRun(s.ctx, req, roots);
    expect(plan.argv).toEqual(['distance', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'distance/distance_nvt.ndx', '-oav', 'distance/distance_nvt.xvg', '-select', 'com of group 0 plus com of group 1', 'com of group 0 plus com of group 2']);
    const { record } = await startRun(s.ctx, req, roots);
    const r = await record;
    expect(r).toMatchObject({ status: 'done', analysis: 'distance', problems: [] });
    expect(r.distances?.map(d => [d.selection, d.samples])).toEqual([['com of group 0 plus com of group 1', 21], ['com of group 0 plus com of group 2', 21]]);
    expect(r.groups.map(g => [g.name, g.count, g.gmxCount])).toEqual([['sulfur', 6, 6], ['sodium', 6, 6], ['water_O', 6, 6]]);
    expect(r.options.find(o => o.flag === 'measure')).toMatchObject({ value: 'com', default: 'com', isDefault: true });
    expect(readdirSync(join(dir, 'distance')).sort()).toEqual(['distance_nvt.ndx', 'distance_nvt.run.json', 'distance_nvt.xvg']);
    expect(recordProblems(JSON.parse(readFileSync(join(dir, 'distance/distance_nvt.run.json'), 'utf8')))).toEqual([]);
    await s.close();
  });

  it('atom pairs, with every distance and the histogram', async () => {
    const { dir, s, req, roots } = await setup({ measure: 'pairs', all: true, hist: true, len: '0.5', binw: '0.05' });
    const { job, record } = await startRun(s.ctx, req, roots);
    const r = await record;
    expect(job.args.slice(-3)).toEqual(['-select', 'group 0 merge group 1', 'group 0 merge group 2']);
    expect(r.outputs.map(o => o.path.split('/').pop())).toEqual(['distance_nvt_all.xvg', 'distance_nvt_hist.xvg', 'distance_nvt.xvg', 'distance_nvt.ndx']);
    expect(r.distances?.map(d => d.samples)).toEqual([126, 126]);
    expect(r.options.find(o => o.flag === 'all')).toMatchObject({ value: true, isDefault: false });
    // Run again says the record it came from, not the first of the other files (review).
    expect(r.record).toBe('distance_nvt.run.json');
    expect(recipeFromRecord(r).inputs.trajectory?.why).toBe('from distance_nvt.run.json');
    expect(readdirSync(join(dir, 'distance'))).toHaveLength(5);
    await s.close();
  });

  it('pairs of unequal sizes are refused before anything runs: gmx would pair them silently', async () => {
    const twelve: Group[] = [groups[0], { role: 'selection', name: 'sodium', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'resname', value: 'Na' } }] }];
    const { dir, s, req, roots } = await setup({ measure: 'pairs' }, twelve);
    await expect(startRun(s.ctx, req, roots)).rejects.toMatchObject({ status: 409, message: 'pairs need as many atoms in sodium as in sulfur: 12 and 6' });
    expect(readdirSync(dir).sort()).toEqual(['nvt.gro', 'nvt.tpr', 'nvt.xtc']);
    await s.close();
  });
});
