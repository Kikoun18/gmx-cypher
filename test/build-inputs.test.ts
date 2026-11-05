// What a build reads (R4): each system's files in the base folder, by method; the base folder and python in settings;
// the check (stat only) and the read of an mdp or topology file, both inside the base folder and nowhere else.
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputsOf } from '../src/lib/build/inputs';
import { DEFAULT_PLAN, systemsOf, type BuildPlan } from '../src/lib/build/plan';
import { planSystem } from '../src/lib/build/steps';
import { apiServer, RUNNER, tmp } from './helpers';

const ALL: BuildPlan = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => ({ ...s, on: true })) };
const sys = (m: string) => systemsOf({ methods: [m], saccharides: ['o111'], sequences: ['aaaaaaaa'], repeats: 0 })[0];
const FF = 'ff/charmm36s-jul2022-prosECCo75.ff/';

describe('the files a system reads', () => {
  it('hmr+fast+6: the saccharide, the force field and its includes, TIP3PF and its HMR water, an mdp per stage', () => {
    expect(inputsOf(ALL, sys('hmr+fast+6')).map(i => i.path)).toEqual([
      'molecules/saccharides/o111.gro', 'ff/o111-ADD.itp', FF + 'forcefield.itp', 'ff/ADDff.itp', 'ff/ions/iontypes.itp', 'ff/ions/ions.itp',
      'ff/TIP3PF/TIP3PF_orig.itp', 'ff/TIP3PF/TIP3PF_HMR.itp', FF + 'aminoacids.rtp',
      'inputs/minim.mdp', 'inputs/eq_nvt.mdp', 'inputs/eq_npt.mdp', 'inputs/awh_hmr.mdp', 'inputs/pull.mdp', 'inputs/hmr_multi.mdp']);
  });
  it('a method without hmr or fast: TIP3P from the force field, awh.mdp', () => {
    const paths = inputsOf(ALL, sys('original')).map(i => i.path);
    expect(paths).toContain(FF + 'tip3p.itp');
    expect(paths).toContain('inputs/awh.mdp');
    expect(paths.some(p => p.includes('TIP3PF'))).toBe(false);
  });
  it('lists every inputs/ file the planner\'s commands name, for every method', () => {
    for (const m of ['hmr+fast+6', 'hmr', 'fast', 'original']) {
      const named = planSystem(ALL, sys(m), { base: '' }).flatMap(s => s.argv).filter(a => a.startsWith('inputs/'));
      expect(named.filter(a => !inputsOf(ALL, sys(m)).some(i => i.path === a))).toEqual([]);
    }
  });
  it('a stage left out needs no mdp', () => {
    expect(inputsOf(DEFAULT_PLAN, sys('hmr+fast+6')).map(i => i.path)).not.toContain('inputs/hmr_multi.mdp');
  });
});

describe('the base folder, python, and the check', () => {
  const tree = () => {
    const allowed = tmp('sym-allow'), base = join(allowed, 'innit_tests')
    for (const d of ['molecules/saccharides', 'ff/ions', 'ff/TIP3PF', 'ff/charmm36s-jul2022-prosECCo75.ff', 'inputs']) mkdirSync(join(base, d), { recursive: true })
    for (const f of ['molecules/saccharides/o111.gro', 'ff/o111-ADD.itp', FF + 'forcefield.itp', FF + 'aminoacids.rtp', 'ff/ADDff.itp', 'ff/ions/iontypes.itp', 'ff/ions/ions.itp', 'ff/TIP3PF/TIP3PF_orig.itp', 'ff/TIP3PF/TIP3PF_HMR.itp', 'inputs/minim.mdp', 'inputs/eq_nvt.mdp', 'inputs/eq_npt.mdp', 'inputs/awh_hmr.mdp'])
      writeFileSync(join(base, f), 'integrator = steep\n')
    return { allowed, base }
  }
  it('takes a base folder inside an allowed folder, and python by name or path, and refuses the rest', async () => {
    const { allowed, base } = tree(), s = await apiServer()
    expect((await s.call('/api/config', { base })).json).toEqual({ error: 'the base folder must be inside an allowed folder: ' + base });
    await s.call('/api/config', { allow: [allowed] });
    expect((await s.call('/api/config', { base })).json.config.base).toBe(base);
    expect((await s.call('/api/config', { base: join(base, 'nope') })).status).toBe(400);
    expect((await s.call('/api/config', { python: 'python3' })).json.config.python).toBe('python3');
    expect((await s.call('/api/config', { python: 'ruby' })).status).toBe(400);
    expect((await s.call('/api/config', { python: process.execPath })).status).toBe(200);
  });
  it('names, per system, every file it needs that is not there; changes nothing', async () => {
    const { allowed, base } = tree(), s = await apiServer()
    expect((await s.call('/api/build/check', { plan: DEFAULT_PLAN, systems: { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['aaaaaaaa'], repeats: 0 } })).status).toBe(409);
    await s.call('/api/config', { allow: [allowed], base });
    const r = (await s.call('/api/build/check', { plan: DEFAULT_PLAN, systems: { methods: ['hmr+fast+6'], saccharides: ['o111', 'pg'], sequences: ['aaaaaaaa'], repeats: 0 } })).json;
    expect(r.missing).toEqual({
      'solutions/hmr+fast+6/o111/aaaaaaaa': ['inputs/pull.mdp'],
      'solutions/hmr+fast+6/pg/aaaaaaaa': ['molecules/saccharides/pg.gro', 'ff/pg-ADD.itp', 'inputs/pull.mdp'],
    });
    expect(r.files.find((f: { path: string }) => f.path === 'ff/o111-ADD.itp')).toEqual({ path: 'ff/o111-ADD.itp', kind: 'saccharide', what: 'the saccharide\'s topology', found: true });
    expect((await s.call('/api/build/check', { plan: DEFAULT_PLAN, systems: { methods: ['../x'], saccharides: ['o111'], sequences: ['aa'], repeats: 0 } })).status).toBe(400);
  });
  it('reads an mdp or topology file of the base folder, and nothing else', async () => {
    const { allowed, base } = tree(), s = await apiServer()
    await s.call('/api/config', { allow: [allowed], base });
    expect((await s.call('/api/build/text?path=inputs/minim.mdp')).json).toEqual({ text: 'integrator = steep\n' });
    for (const bad of ['../x.mdp', '/etc/passwd', 'molecules/saccharides/o111.gro', 'inputs/none.mdp']) expect((await s.call('/api/build/text?path=' + encodeURIComponent(bad))).status).toBeGreaterThanOrEqual(400);
    symlinkSync(RUNNER + 'package.json', join(base, 'inputs/out.mdp'));
    expect((await s.call('/api/build/text?path=inputs/out.mdp')).status).toBe(403);
  });
});
