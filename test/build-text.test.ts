// The texts a build computes (R3b), on real data: a built system's structure (your o111 + mmmmmmmm, the first 249
// atoms of its 9.multiwalker.gro), the topology the notebook printed for o111 + hhhhhhhh, the ion counts of its saved
// build summary, its walker rebuild ("8 (3.0 nm) ← walker 7 (2.5 nm)"), and its qq scripts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCIENCE, systemsOf } from '../src/lib/build/plan';
import { DEFAULT_PROFILES, PROFILES, profileProblem, qqScript } from '../src/lib/build/qq';
import { carbGroup, hmrTopology, ionCounts, mergeGro, moleculetype, nearestWalker, netCharge, pullx, renameWater, topologyText, walkerFrames, waters } from '../src/lib/build/text';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sys = (method: string, c: string, q: string) => systemsOf({ methods: [method], saccharides: [c], sequences: [q], repeats: 0 })[0];

describe('ion counts (prosECCo75, ±0.75 e)', () => {
  it.each([
    // [net charge, waters, -np, -nn, salt pairs]: the spec's example, then the saved summary's 30/30, 38/30, 30/38.
    [-3.75, 10412, 33, 28, 28], [0, 11140, 30, 30, 30], [-6, 11140, 38, 30, 30], [6, 11140, 30, 38, 30], [0, 0, 0, 0, 0],
  ])('net %d e, %d waters → -np %d -nn %d (%d salt pairs), nothing left', (net, w, np, nn, salt) => {
    expect(ionCounts(net, w, SCIENCE)).toEqual({ positive: np, negative: nn, salt, residual: 0 });
  });
  it('says what is left when the charge is not a whole number of 0.75 e', () => {
    expect(ionCounts(-1.55, 11140, SCIENCE).residual).toBeCloseTo(-0.05);
  });
  it('reads grompp\'s net charge, and none when it says nothing', () => {
    expect(netCharge('NOTE 2 [file topol.top]:\n  System has non-zero total charge: -3.750000\n')).toBe(-3.75);
    expect(netCharge('There was 1 NOTE\nThere were 2 WARNINGs\n')).toBe(0);
  });
});

describe('the topology', () => {
  it('is the notebook\'s text, but for the peptide\'s include from the system folder (T205)', () => {
    const notebook = read('./fixtures/build/notebook-topology-o111-hhhhhhhh.top');
    expect(topologyText(sys('hmr+fast+6', 'o111', 'hhhhhhhh'), SCIENCE)).toBe(notebook.replace('#include "../../../../ff/hhhhhhhh.itp"', '#include "hhhhhhhh.itp"'));
  });
  it('takes tip3p from the force field for a method that is not fast', () => {
    expect(topologyText(sys('hmr', 'o111', 'aa'), SCIENCE)).toContain('#include "../../../../ff/charmm36s-jul2022-prosECCo75.ff/tip3p.itp"                                ; fast and slow water');
  });
  it('after gromologist: Protein.itp, CARB.itp and, for fast methods, TIP3PF_HMR', () => {
    const s = sys('hmr+fast+6', 'o111', 'hhhhhhhh'), t = hmrTopology(topologyText(s, SCIENCE), s);
    expect(t).toContain('#include "Protein.itp"\n');
    expect(t).toContain('#include "CARB.itp"\n');
    expect(t).toContain('#include "../../../../ff/TIP3PF/TIP3PF_HMR.itp"');
    expect(t).not.toContain('o111-ADD.itp');
  });
  it('counts and renames the water as the notebook\'s sed does, line by line', () => {
    const top = read('./fixtures/build/notebook-topology-o111-hhhhhhhh.top') + 'SOL         11140\n';
    expect(waters(top)).toBe(11140);
    const fast = renameWater(top, 'TIP3F');
    // re.sub(r"^SOL\s", "TIP3F ") replaces "SOL" and one space; the other eight stay.
    expect(fast.endsWith('TIP3F ' + ' '.repeat(8) + '11140\n')).toBe(true);
    expect(waters(fast)).toBe(11140);
    expect(renameWater(fast, 'SOL').endsWith('SOL   ' + ' '.repeat(8) + '11140\n')).toBe(true);
  });
  it('takes the [ moleculetype ] part, without [ system ] (extract_moleculetypes)', () => {
    expect(moleculetype(read('./fixtures/awh/dumps/topol.top'))).toBe('[ moleculetype ]\nP 1\n[ atoms ]\n1 A 1 P A1 1 0.0 40.0\n');
    expect(moleculetype('[ system ]\nx\n')).toBe('');
  });
});

describe('the merged box', () => {
  // Your built o111 + mmmmmmmm: atoms 1–110 the saccharide, 111–249 the peptide.
  const lines = read('./fixtures/decypher/9.multiwalker.gro').split('\n');
  const gro = (title: string, atoms: string[]) => title + '\n' + atoms.length + '\n' + atoms.join('\n') + '\n   1.00000   1.00000   1.00000\n';
  const renumber = (atoms: string[]) => atoms.map((l, i) => l.slice(0, 15) + String(i + 1).padStart(5) + l.slice(20));
  it('gives back the built system\'s own first 249 atoms: the saccharide first, the peptide\'s residues from 1 again, atoms from 1', () => {
    const carb = renumber(lines.slice(2, 112)), pep = renumber(lines.slice(112, 251));
    const merged = mergeGro(gro('pep', pep), gro('carb', carb), 7.0).split('\n');
    expect(merged[0]).toBe('Combined structure - Carbohydrate + Protein');
    expect(merged[1]).toBe('249');
    expect(merged.slice(2, 251)).toEqual(lines.slice(2, 251));
    expect(merged[251]).toBe('7.00000   7.00000   7.00000');
  });
  it('[ CARB ] is atoms 1…n, fifteen to a line', () => {
    expect(carbGroup(110).split('\n').slice(0, 3)).toEqual(['', '[ CARB ]', '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15']);
    expect(carbGroup(110).trimEnd().split('\n').pop()).toBe('106 107 108 109 110');
    expect(carbGroup(15)).toBe('\n[ CARB ]\n1 2 3 4 5 6 7 8 9 10 11 12 13 14 15\n');
  });
});

describe('the walkers', () => {
  const targets = SCIENCE.walkers;
  it('each starts from the pull\'s frame nearest its distance, and says when that frame is far (> 0.10 nm)', () => {
    const pull = pullx('# gmx mdrun\n@ title "pull"\n0.000 0.81\n100.000 0.95\n200.000 1.48\n300.000 2.02\n400.000 2.49\n500.000 3.01\n');
    const f = walkerFrames(pull, targets);
    expect(f.map(w => w.time)).toEqual([0, 0, 0, 100, 200, 300, 400, 500]);
    expect(f.filter(w => w.far).map(w => w.walker)).toEqual([1, 2]);
  });
  it('a failed walker is rebuilt from the nearest working one by distance: 8 (3.0 nm) ← 7 (2.5 nm), as the notebook did', () => {
    expect(nearestWalker(8, [1, 2, 3, 4, 5, 6, 7], targets)).toBe(7);
    expect(nearestWalker(1, [2, 3], targets)).toBe(2);
    expect(nearestWalker(3, [], targets)).toBeNull();
  });
});

describe('qq scripts (render_qq_script)', () => {
  const s = sys('hmr+fast+6', 'o111', 'aaaaaaaa'), [mc2025, mc2022, lumi] = PROFILES;
  it('awh on MetaCentrum 2025: the notebook\'s script, line for line', () => {
    expect(qqScript('awh', s, mc2025)!.text).toBe(`#!/usr/bin/env -S qq run

# qq job-type continuous

# qq props cl_zero

# qq ncpus 8
# qq ngpus 1
# qq mem 30gb

# qq walltime 23h
# qq loop-end 10


export OMP_NUM_THREADS=8

metamodule add gromacs/2025.4-cuda

gmx_mpi mdrun -ntomp 8 -update gpu -nb gpu -pme gpu -bonded gpu -deffnm 7.awh -cpi 7.awh.cpt -dlb yes -px 7.awh_pullx.xvg -pf 7.awh_pullf.xvg -v -quiet -maxh 22


if [ -f "7.awh.gro" ]; then
    exit "\${QQ_NO_RESUBMIT}"
fi

exit 0
`);
    expect(qqScript('awh', s, mc2025)!.file).toBe('scripts/awh/hmr+fast+6_awh_aaaaaaaa.sh');
    expect(qqScript('awh', s, mc2025)!.submit).toBe('qq submit -q gpu solutions/hmr+fast+6/o111/aaaaaaaa/7.awh/hmr+fast+6_awh_aaaaaaaa.sh');
  });
  it('2022 plumed: gmx, its module, no GPU flags and no -dlb', () => {
    const t = qqScript('awh', s, mc2022)!.text;
    expect(t).toContain('\n\n\nmodule add gromacs:2022.3-plumed\n\ngmx mdrun -deffnm 7.awh -cpi 7.awh.cpt -px 7.awh_pullx.xvg -pf 7.awh_pullf.xvg -v -quiet -maxh 22\n');
  });
  it('min, nvt and npt get their own -deffnm and no pull files (T213)', () => {
    expect(qqScript('min', s, mc2025)!.text).toContain('-deffnm 4.minim -cpi 4.minim.cpt -dlb yes -v -quiet -maxh 22');
    expect(qqScript('npt', s, mc2025)!.text).toContain('if [ -f "6.eqnpt.gro" ]; then');
  });
  it('the pull is resubmitted until 8.pull.gro, like awh (T213)', () => {
    const t = qqScript('pull', s, mc2025)!.text;
    expect(t).toContain('# qq job-type continuous');
    expect(t).toContain('-deffnm 8.pull -cpi 8.pull.cpt -dlb yes -px pullx.xvg -pf pullf.xvg');
    expect(t).toContain('if [ -f "8.pull.gro" ]; then');
  });
  it('the walkers share one bias, so every profile runs them with -multidir (review finding 6)', () => {
    const w = qqScript('walkers', s, mc2025)!;
    expect(w.text).toContain('gmx_mpi mdrun -multidir 1 2 3 4 5 6 7 8 -ntomp 8 -update gpu -nb gpu -pme gpu -bonded gpu -deffnm 9.multiwalker -cpi 9.multiwalker.cpt');
    expect(w.text).toContain('# qq ncpus 64\n# qq ngpus 8\n');
    expect(w.text).toContain('if [ -f "1/9.multiwalker.gro" ]');
  });
  it('LUMI multidir: every walker\'s folder, 7 cores and a GPU each (T213), resubmitted until every walker has its .gro', () => {
    const w = qqScript('walkers', s, lumi)!;
    expect(w.file).toBe('scripts/awh_multi/hmr+fast+6_awh_multi_aaaaaaaa.sh');
    expect(w.text).toContain('# qq ncpus 56\n# qq ngpus 8\n# qq mem 60gb');
    expect(w.text).not.toContain('# qq props');
    expect(w.text).toContain('gmx_mpi mdrun -multidir 1 2 3 4 5 6 7 8 -ntomp 7 -update gpu -nb gpu -bonded gpu -deffnm 9.multiwalker -cpi 9.multiwalker.cpt -dlb yes -px 9.multiwalker_pullx.xvg');
    expect(w.text).toContain('if [ -f "1/9.multiwalker.gro" ] && [ -f "2/9.multiwalker.gro" ]');
    expect(w.submit).toBe('qq submit -q gpu solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/hmr+fast+6_awh_multi_aaaaaaaa.sh');
  });
});

describe('profiles by stage (R7a)', () => {
  it('the notebook\'s: MetaCentrum 2025 for the stages here and awh and the pull, LUMI for the walkers', () => {
    expect(DEFAULT_PROFILES).toEqual({ min: 'mc2025', nvt: 'mc2025', npt: 'mc2025', awh: 'mc2025', pull: 'mc2025', walkers: 'lumi' });
  });
  it.each([
    ['awh', 'mc2022', null],
    ['walkers', 'mc2025', null],
    ['walkers', 'mc2022', 'the walkers run together with mdrun -multidir, which needs an MPI gmx (gmx_mpi): MetaCentrum · GROMACS 2022.3 plumed has gmx'],
    ['pull', 'nope', 'no qq profile "nope": mc2025, mc2022, lumi'],
  ] as const)('%s with %s', (stage, id, why) => {
    expect(profileProblem(stage, id)).toBe(why);
  });
});
