// One system built end to end (R5b), with the fake gmx and python answering with the notebook's real output
// (test/fake-gmx-build.mjs, test/fake-python.mjs): the system is the notebook's own, hmr+fast+6/o111/hhhhhhhh, so the
// real text names its files. The folder tree has the notebook's names, the ions are counted from grompp's net charge
// and the waters, nothing outside the system's folder (and the scripts) is written, and every file is in build.json.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Builder, jobsExec, type BuildRecord } from '../server/build-run';
import { Jobs } from '../server/jobs';
import { DEFAULT_PLAN } from '../src/lib/build/plan';
import { baseFolder, FAKE_GMX, RUNNER, tmp } from './helpers';

const SYSTEM = { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh'], repeats: 0 };
const S = 'solutions/hmr+fast+6/o111/hhhhhhhh';

function listing(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex'); } };
  walk(dir);
  return out;
}

function builder() {
  const home = tmp('home'), jobs = new Jobs(join(home, 'builds/jobs')), { exec, cancel } = jobsExec(jobs);
  return { jobs, b: new Builder({ home, version: '0', exec, cancel, tools: () => ({ gmx: FAKE_GMX, python: RUNNER + 'test/fake-python.mjs' }), wait: { every: 20, max: 2000 } }) };
}

describe('one system, end to end', () => {
  it('builds it with the notebook\'s names, prepares awh and the pull for the cluster, and writes nothing else', async () => {
    const base = baseFolder(), before = listing(base), { b, jobs } = builder();
    const run = await b.start(DEFAULT_PLAN, SYSTEM, { base, ifExists: 'continue', onFailure: 'next' }).done;
    const s = run.systems[0];
    expect(s.error).toBeUndefined();
    expect(s).toMatchObject({ status: 'cluster', step: s.steps });
    expect(s.submit).toEqual(['qq submit -q gpu ' + S + '/7.awh/hmr+fast+6_awh_hhhhhhhh.sh', 'qq submit -q gpu ' + S + '/8.pull/hmr+fast+6_pull_hhhhhhhh.sh']);
    expect(s.notes).toEqual(['net charge 0.00 e: 30 NA_s and 30 CL_2s', 'net charge after npt: 0.00 e']);
    // The notebook's folder tree.
    expect(Object.keys(listing(join(base, S))).sort()).toEqual([
      '#hhhhhhhh.top.1#', '#hhhhhhhh.top.2#', '#o111.gro.1#', '01.conf.gro', '2.solvated.gro', '3.pre_salted.tpr', '3.pre_salted_mdout.mdp', '3.salted.gro',
      '4.minim/4.min_mdout.mdp', '4.minim/4.minim.edr', '4.minim/4.minim.gro', '4.minim/4.minim.log', '4.minim/4.minim.tpr', '4.minim/hmr+fast+6_minim_hhhhhhhh.sh',
      '5.eqnvt/5.eqnvt.cpt', '5.eqnvt/5.eqnvt.edr', '5.eqnvt/5.eqnvt.gro', '5.eqnvt/5.eqnvt.log', '5.eqnvt/5.eqnvt.tpr', '5.eqnvt/5.eqnvt.trr', '5.eqnvt/5.eqnvt_mdout.mdp', '5.eqnvt/hmr+fast+6_nvt_hhhhhhhh.sh',
      '6.eqnpt/6.eqnpt.cpt', '6.eqnpt/6.eqnpt.edr', '6.eqnpt/6.eqnpt.gro', '6.eqnpt/6.eqnpt.log', '6.eqnpt/6.eqnpt.tpr', '6.eqnpt/6.eqnpt.trr', '6.eqnpt/6.eqnpt_mdout.mdp', '6.eqnpt/hmr+fast+6_npt_hhhhhhhh.sh',
      '7.awh/7.awh.tpr', '7.awh/7.awh_mdout.mdp', '7.awh/hmr+fast+6_awh_hhhhhhhh.sh', '7.awh/index.ndx',
      '8.pull/8.pull.tpr', '8.pull/8.pull_mdout.mdp', '8.pull/hmr+fast+6_pull_hhhhhhhh.sh', '8.pull/index.ndx',
      'CARB.itp', 'Protein.itp', 'build.json', 'hhhhhhhh.gro', 'hhhhhhhh.itp', 'hhhhhhhh.pdb', 'hhhhhhhh.top', 'hhhhhhhh_hmr.top', 'hhhhhhhh_restraints.itp',
      'o111.gro', 'pre.gro', 'visualization/4.potE_minim.xvg', 'visualization/hhhhhhhh.png',
    ]);
    // The peptide's moleculetype includes its position restraints from its own folder: pdb2gmx wrote them from ff/ (T233).
    expect(readFileSync(join(base, S, 'hhhhhhhh.itp'), 'utf8')).toContain('#ifdef POSRES\n#include "./hhhhhhhh_restraints.itp"\n#endif');
    // The topology: gromologist's split files, TIP3PF's HMR water, the waters less the ions, renamed for TIP3PF.
    const top = readFileSync(join(base, S, 'hhhhhhhh.top'), 'utf8');
    expect(top).toContain('#include "Protein.itp"');
    expect(top).toContain('#include "CARB.itp"');
    expect(top).toContain('#include "../../../../ff/TIP3PF/TIP3PF_HMR.itp"');
    expect(top.trim().split('\n').slice(-3).map(l => l.split(/\s+/))).toEqual([['TIP3F', '11080'], ['NA_s', '30'], ['CL_2s', '30']]);
    // [ CARB ] is the saccharide's 110 atoms, appended to make_ndx's index.
    expect(readFileSync(join(base, S, '7.awh/index.ndx'), 'utf8')).toMatch(/\n\[ CARB \]\n1 2 3 4 5 6 7 8 9 10 11 12 13 14 15\n[\s\S]*\n106 107 108 109 110\n$/);
    // Nothing outside the system's folder changed; the scripts are new in scripts/.
    const after = listing(base);
    expect(Object.fromEntries(Object.entries(after).filter(([k]) => !k.startsWith(S + '/') && !k.startsWith('scripts/') && !k.startsWith('logs/')))).toEqual(before);
    // The build summary (R9): the notebook's own line for this system, its warnings per stage counted from the real
    // output (the time is this run's).
    const [log] = Object.keys(after).filter(k => k.startsWith('logs/'));
    expect(log).toMatch(/^logs\/build_summary_\d{8}_\d{4}\.log$/);
    const notebook = readFileSync(new URL('./fixtures/build/notebook/build-summary.txt', import.meta.url), 'utf8').split('\n').at(-3)!;
    const ours = readFileSync(join(base, log), 'utf8').split('\n').find(l => l.startsWith('hmr+fast+6/o111/hhhhhhhh'))!;
    expect(ours.replace(/\d:\d\d:\d\d/, 'T')).toBe(notebook.replace(/\d:\d\d:\d\d/, 'T'));
    expect(JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8')).warnings).toEqual({ SB: 7, MIN: 4, NVT: 4, NPT: 4, AWH: 4, PULL: 3 });
    expect(Object.keys(after).filter(k => k.startsWith('scripts/')).sort()).toEqual(['scripts/awh/hmr+fast+6_awh_hhhhhhhh.sh', 'scripts/minim/hmr+fast+6_minim_hhhhhhhh.sh', 'scripts/npt/hmr+fast+6_npt_hhhhhhhh.sh', 'scripts/nvt/hmr+fast+6_nvt_hhhhhhhh.sh', 'scripts/pull/hmr+fast+6_pull_hhhhhhhh.sh']);
    // The record: every step done, every file there in it with its hash, GROMACS's backups (the saccharide, twice the topology).
    const rec: BuildRecord = JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
    expect(rec.status).toBe('cluster');
    expect(rec.steps.every(x => x.status === 'done')).toBe(true);
    expect(rec.backups).toEqual([S + '/#o111.gro.1#', S + '/#hhhhhhhh.top.1#', S + '/#hhhhhhhh.top.2#']);
    for (const [k, h] of Object.entries(after)) if (k.startsWith(S + '/') && k !== S + '/build.json') expect([k, rec.files[k]?.sha256]).toEqual([k, h]);
    // Each gmx and python step ran as a job of the build's own list, with the real output.
    expect(jobs.list().length).toBe(rec.steps.filter(x => x.program === 'gmx' || x.program === 'python').length);
    const genion = jobs.list().find(j => j.args[0] === 'genion')!;
    expect(genion.args).toEqual(['genion', '-s', '3.pre_salted.tpr', '-p', 'hhhhhhhh.top', '-o', '3.salted.gro', '-pname', 'NA_s', '-nname', 'CL_2s', '-np', '30', '-nn', '30', '-quiet']);
    expect(jobs.logText(genion.id)).toContain('Will try to add 30 NA_s ions and 30 CL_2s ions.');
  }, 60_000);

  it('a fatal error in the real text stops the system at its stage, with that text', async () => {
    const base = baseFolder(), { b } = builder();
    process.env.FAKE_GMX_FATAL = '7.awh.tpr';
    try {
      const run = await b.start(DEFAULT_PLAN, SYSTEM, { base, ifExists: 'continue', onFailure: 'next' }).done;
      expect(run.systems[0]).toMatchObject({ status: 'failed', error: 'AWH · grompp 7.awh: Fatal error:\nDistance between pull groups 1 and 2 (3.657996 nm) is larger than 0.49 times\nthe box size (3.406945).' });
      const rec: BuildRecord = JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
      expect(rec.steps.at(-1)).toMatchObject({ label: 'grompp 7.awh', status: 'failed' });
      expect(rec.steps.some(x => x.stage === 'pull')).toBe(false);
    } finally { delete process.env.FAKE_GMX_FATAL; }
  }, 60_000);

  it('python that fails stops the system with its own last line', async () => {
    const base = baseFolder(), { b } = builder();
    process.env.FAKE_PYTHON_FAIL = 'build_peptide.py';
    try {
      const run = await b.start(DEFAULT_PLAN, SYSTEM, { base, ifExists: 'continue', onFailure: 'next' }).done;
      expect(run.systems[0]).toMatchObject({ status: 'failed', error: 'SB · build the peptide (PyMOL): ModuleNotFoundError: No module named \'pymol\' (exit 1)' });
    } finally { delete process.env.FAKE_PYTHON_FAIL; }
  }, 60_000);
});
