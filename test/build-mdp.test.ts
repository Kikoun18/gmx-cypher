// What a stage's mdp sets, read as grompp reads it (T231), and the time step of methods without hmr: your pull.mdp and
// awh_multi.mdp set dt = 0.004 (4 fs, which holds only with the hydrogens' masses repartitioned). The lines below are
// in your files' format; the files themselves stay yours.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mdpValue, stageMdp, timestepProblems } from '../src/lib/build/mdp';
import { refT } from '../src/lib/build/pmf';
import { DEFAULT_PLAN, type BuildPlan } from '../src/lib/build/plan';
import { checkInputs } from '../server/build-check';
import { baseFolder } from './helpers';

const WALKERS: BuildPlan = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => (s.id === 'walkers' ? { ...s, on: true } : s)) };

describe('an mdp value, as grompp reads it', () => {
  it('key = value, comments left out, - and _ the same, the last setting kept', () => {
    const mdp = 'integrator              = md\ndt                      = 0.004\nnsteps                  = 50000000        ; 31250000 ; *0,004 ---> 125 ns\n; dt = 0.001\nref-t                   = 310.15 310.15\n';
    expect(mdpValue(mdp, 'dt')).toBe('0.004');
    expect(mdpValue(mdp, 'nsteps')).toBe('50000000');
    expect(mdpValue(mdp, 'ref_t')).toBe('310.15 310.15');
    expect(mdpValue(mdp, 'tinit')).toBeNull();
    expect(mdpValue('dt = 0.002\ndt = 0.004\n', 'dt')).toBe('0.004');
    expect(refT(mdp)).toBe(310.15);
  });
  it('each stage\'s file for a method: awh\'s apart for hmr, the rest one for every method', () => {
    expect(['nvt', 'npt', 'awh', 'pull', 'walkers', 'min', 'sb'].map(s => stageMdp(DEFAULT_PLAN, s as never, 'hmr+fast+6'))).toEqual(['eq_nvt.mdp', 'eq_npt.mdp', 'awh_hmr.mdp', 'pull.mdp', 'hmr_multi.mdp', null, null]);
    expect(stageMdp(DEFAULT_PLAN, 'awh', 'fast+6')).toBe('awh.mdp');
  });
});

describe('the time step of a method without hmr', () => {
  const DT: Record<string, number> = { 'inputs/eq_nvt.mdp': 0.001, 'inputs/eq_npt.mdp': 0.001, 'inputs/awh.mdp': 0.002, 'inputs/awh_hmr.mdp': 0.004, 'inputs/pull.mdp': 0.004, 'inputs/hmr_multi.mdp': 0.004 };
  it('your pull.mdp and the walkers\' 4 fs, said for fast+6, not for hmr+fast+6; only the stages in the build', () => {
    expect(timestepProblems(WALKERS, ['hmr+fast+6', 'fast+6'], p => DT[p] ?? null)).toEqual([
      'fast+6\'s pull grompps inputs/pull.mdp with dt = 0.004 ps: without hmr, 0.002 ps at most · the plan has one pull mdp for every method',
      'fast+6\'s multiwalker grompps inputs/hmr_multi.mdp with dt = 0.004 ps: without hmr, 0.002 ps at most · the plan has one multiwalker mdp for every method',
    ]);
    expect(timestepProblems(DEFAULT_PLAN, ['fast+6'], p => DT[p] ?? null)).toHaveLength(1);
    expect(timestepProblems(DEFAULT_PLAN, ['fast+6'], p => ({ ...DT, 'inputs/awh.mdp': 0.004 })[p] ?? null)[0]).toBe('fast+6\'s awh grompps inputs/awh.mdp with dt = 0.004 ps: without hmr, 0.002 ps at most · awh\'s mdp for methods without hmr is set apart in the build plan');
    expect(timestepProblems(WALKERS, ['hmr+fast+6'], p => DT[p] ?? null)).toEqual([]);
  });
  it('POST /api/build/check reads each mdp\'s dt from the base folder', () => {
    const base = baseFolder(), systems = (methods: string[]) => ({ methods, saccharides: ['o111'], sequences: ['hhhhhhhh'], repeats: 0 });
    expect(checkInputs(base, DEFAULT_PLAN, systems(['fast+6'])).timestep).toEqual([]);
    writeFileSync(join(base, 'inputs/pull.mdp'), 'integrator = md\ndt                      = 0.004\n');
    expect(checkInputs(base, DEFAULT_PLAN, systems(['hmr+fast+6'])).timestep).toEqual([]);
    expect(checkInputs(base, DEFAULT_PLAN, systems(['hmr+fast+6', 'fast+6'])).timestep).toEqual(['fast+6\'s pull grompps inputs/pull.mdp with dt = 0.004 ps: without hmr, 0.002 ps at most · the plan has one pull mdp for every method']);
  });
});
