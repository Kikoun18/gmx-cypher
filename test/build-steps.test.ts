// The planners (R3b), golden against the notebook (solution_builder_seq_5_4.ipynb): for hmr+fast+6 / o111 /
// aaaaaaaa, every gmx command as the notebook's code builds it (split as its shlex.split splits it), with its stdin
// and the folder it runs in. The differences are the decided ones only: pdb2gmx reads the system's .gro where it is
// (T211), the charge check writes to a temporary folder (T205).
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, systemsOf, type BuildPlan } from '../src/lib/build/plan';
import { orderProblems, planSystem } from '../src/lib/build/steps';

const BASE = '/data/innit_tests', INPUTS = BASE + '/inputs', S = 'solutions/hmr+fast+6/o111/aaaaaaaa';
const [SYS] = systemsOf({ methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['aaaaaaaa'], repeats: 0 });
const ALL: BuildPlan = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => ({ ...s, on: true })) };
/** The notebook's sh(): shlex.split, which drops the quotes. */
const shlex = (cmd: string) => (cmd.match(/"[^"]*"|\S+/g) ?? []).map(w => w.replace(/^"|"$/g, ''));
const P = 'aaaaaaaa', C = 'o111', maxwarn = 6;

// [the notebook's command, after {gmx}, as its f-string writes it; its stdin; the folder it runs in]
const NOTEBOOK: [string, string | undefined, string][] = [
  [`trjconv -f ./${P}.pdb -s ./${P}.pdb -o ${P}.gro -center -box 1 1 1`, '0 0\n', S],
  [`trjconv -f ./${C}.gro -s ./${C}.gro -o ${C}.gro -center -box 1 1 1`, '0 0\n', S],
  [`editconf -f ${C}.gro -o ${C}_princ.gro -translate 0 1.5 0 -princ`, '0\n', S],
  // T211: the notebook copies ${P}.gro into ff/ and passes -f ${P}.gro.
  [`pdb2gmx -f ../${S}/${P}.gro -v -ignh -i ../solutions/hmr+fast+6/${C}/${P}/${P}_restraints.itp -p ../solutions/hmr+fast+6/${C}/${P}/${P}.top -o ../solutions/hmr+fast+6/${C}/${P}/pre.gro -ter`, '1\n8\n0\n0\n', 'ff'],
  [`editconf -f pre.gro -o pre_princ.gro -princ`, '0\n', S],
  [`solvate -cp 01.conf.gro -cs -o 2.solvated.gro -p ${P}.top -quiet`, undefined, S],
  [`grompp -f ${INPUTS}/minim.mdp -p ${P}.top -c 2.solvated.gro -r 2.solvated.gro -o 3.pre_salted.tpr -po 3.pre_salted_mdout.mdp -quiet -maxwarn ${maxwarn}`, undefined, S],
  [`genion -s 3.pre_salted.tpr -p ${P}.top -o 3.salted.gro -pname NA_s -nname CL_2s -np {np} -nn {nn} -quiet`, 'SOL\n', S],
  [`grompp -f ${INPUTS}/minim.mdp -p ../${P}.top -c ../3.salted.gro -r ../3.salted.gro -o 4.minim.tpr -po 4.min_mdout.mdp -quiet -maxwarn ${maxwarn}`, undefined, S + '/4.minim'],
  [`mdrun -deffnm 4.minim -v -quiet`, undefined, S + '/4.minim'],
  [`energy -f ./4.minim/4.minim.edr -o visualization/4.potE_minim.xvg -quiet`, 'Potential\n', S],
  [`grompp -f ${INPUTS}/eq_nvt.mdp -p ../${P}.top -c ../4.minim/4.minim.gro -r ../4.minim/4.minim.gro -o 5.eqnvt.tpr -po 5.eqnvt_mdout.mdp -quiet -maxwarn ${maxwarn}`, undefined, S + '/5.eqnvt'],
  [`mdrun -deffnm 5.eqnvt -v -quiet`, undefined, S + '/5.eqnvt'],
  [`grompp -f ${INPUTS}/eq_npt.mdp -p ../${P}.top -c ../5.eqnvt/5.eqnvt.gro -r ../5.eqnvt/5.eqnvt.gro -o 6.eqnpt.tpr -po 6.eqnpt_mdout.mdp -maxwarn ${maxwarn} -quiet`, undefined, S + '/6.eqnpt'],
  [`mdrun -deffnm 6.eqnpt -v -quiet`, undefined, S + '/6.eqnpt'],
  // T205: the notebook writes _charge_check.* in the system folder, then deletes them.
  [`grompp -f ${INPUTS}/minim.mdp -p ${P}.top -c 6.eqnpt/6.eqnpt.gro -r 6.eqnpt/6.eqnpt.gro -o {tmp}/_charge_check.tpr -po {tmp}/_charge_check_mdout.mdp -maxwarn ${maxwarn} -quiet`, undefined, S],
  [`make_ndx -f ../6.eqnpt/6.eqnpt.gro -o index.ndx -quiet`, 'q\n', S + '/7.awh'],
  [`grompp -f ${INPUTS}/awh_hmr.mdp -p ../${P}.top -n index.ndx -c ../6.eqnpt/6.eqnpt.gro -r ../6.eqnpt/6.eqnpt.gro -o 7.awh.tpr -po 7.awh_mdout.mdp -maxwarn ${maxwarn} -quiet`, undefined, S + '/7.awh'],
  [`make_ndx -f 6.eqnpt/6.eqnpt.gro -o 8.pull/index.ndx -quiet`, 'q\n', S],
  [`grompp -f ${INPUTS}/pull.mdp -p ../${P}.top -n index.ndx -c ../6.eqnpt/6.eqnpt.gro -r ../6.eqnpt/6.eqnpt.gro -o 8.pull.tpr -po 8.pull_mdout.mdp -maxwarn ${maxwarn} -quiet`, undefined, S + '/8.pull'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(i => [
    [`trjconv -f "../../8.pull/8.pull.xtc" -s "../../8.pull/8.pull.tpr" -o start.gro -dump {t${i}} -pbc whole -n "../../8.pull/index.ndx" -quiet`, 'System\n', S + '/9.multiwalker/' + i],
    [`grompp -f ${INPUTS}/hmr_multi.mdp -p ../../${P}.top -n "../../8.pull/index.ndx" -c start.gro -r start.gro -o "9.multiwalker.tpr" -po "9.multiwalker_mdout.mdp" -maxwarn ${maxwarn} -quiet`, undefined, S + '/9.multiwalker/' + i],
  ] as [string, string | undefined, string][]),
];

describe('every gmx command of a system, as the notebook runs it', () => {
  const steps = planSystem(ALL, SYS, { base: BASE }).filter(s => s.program === 'gmx');
  it('the same commands, in the same order', () => {
    expect(steps.map(s => s.argv.join(' '))).toEqual(NOTEBOOK.map(([cmd]) => shlex(cmd).join(' ')));
  });
  it.each(NOTEBOOK.map((n, i) => [i, ...n] as const))('%i: %s', (i, cmd, stdin, cwd) => {
    expect(steps[i].argv).toEqual(shlex(cmd));
    expect(steps[i].stdin).toBe(stdin);
    expect(steps[i].cwd).toBe(cwd);
  });
});

describe('what each step reads, writes and replaces', () => {
  const steps = planSystem(ALL, SYS, { base: BASE });
  it('writes only in the system folder and scripts/, never in ff/ (T205)', () => {
    const written = steps.flatMap(s => [...s.writes, ...s.replaces]);
    expect(written.filter(f => !f.startsWith(S + '/') && !f.startsWith('scripts/'))).toEqual([]);
  });
  it('replaces only what an earlier step of the same build wrote (T205)', () => {
    const made = new Set<string>();
    for (const s of steps) {
      for (const r of s.replaces) expect([s.label, r, made.has(r)]).toEqual([s.label, r, true]);
      for (const w of s.writes) made.add(w);
    }
  });
  it('normalises paths: no .. inside a system', () => {
    expect(steps.flatMap(s => [...s.reads, ...s.writes, ...s.replaces]).filter(f => f.includes('..'))).toEqual([]);
  });
  it('fast methods rename the water around grompp and genion; hmr methods add gromologist and its topology', () => {
    expect(steps.filter(s => s.label.startsWith('water named')).map(s => s.label)).toEqual(['water named TIP3F', 'water named SOL', 'water named TIP3F']);
    expect(steps.find(s => s.program === 'python' && s.argv[0] === 'hmr.py')!.argv).toEqual(['hmr.py', P + '.top', P + '_hmr.top', 'POSRES_FC_BB=400', 'POSRES_FC_SC=40', 'DIHRES_FC=4']);
    const [plain] = systemsOf({ methods: ['original'], saccharides: [C], sequences: [P], repeats: 0 });
    const ps = planSystem(ALL, plain, { base: BASE });
    expect(ps.some(s => s.label.startsWith('water named') || s.argv[0] === 'hmr.py')).toBe(false);
    expect(ps.find(s => s.label === 'grompp 7.awh')!.argv[2]).toBe(INPUTS + '/awh.mdp');
    // T212: walkers use hmr_multi.mdp for every method, for now.
    expect(ps.find(s => s.label === 'walker 1: grompp')!.argv[2]).toBe(INPUTS + '/hmr_multi.mdp');
  });
  it('a sequence\'s own pdb2gmx answers, where it has them (T211)', () => {
    const plan = { ...ALL, science: { ...ALL.science, answersBySequence: { [P]: '1 8 1 1' } } };
    expect(planSystem(plan, SYS, { base: BASE }).find(s => s.argv[0] === 'pdb2gmx')!.stdin).toBe('1\n8\n1\n1\n');
  });
  it('a stage or a tile that is off has no steps; the default plan leaves the walkers and glucose out', () => {
    const def = planSystem(DEFAULT_PLAN, SYS, { base: BASE });
    expect(def.some(s => s.stage === 'walkers')).toBe(false);
    expect(def.some(s => s.tile === 'glucose')).toBe(false);
    expect(new Set(def.map(s => s.stage))).toEqual(new Set(['sb', 'min', 'nvt', 'npt', 'awh', 'pull']));
  });
  it('heavy stages get a qq script, in scripts/{stage}/ and beside the step (T213)', () => {
    expect(steps.filter(s => s.label === 'qq script').map(s => s.argv[0])).toEqual([
      'scripts/minim/hmr+fast+6_minim_aaaaaaaa.sh', 'scripts/nvt/hmr+fast+6_nvt_aaaaaaaa.sh', 'scripts/npt/hmr+fast+6_npt_aaaaaaaa.sh',
      'scripts/awh/hmr+fast+6_awh_aaaaaaaa.sh', 'scripts/pull/hmr+fast+6_pull_aaaaaaaa.sh', 'scripts/awh_multi/hmr+fast+6_awh_multi_aaaaaaaa.sh']);
    expect(steps.find(s => s.argv[0] === 'scripts/awh_multi/hmr+fast+6_awh_multi_aaaaaaaa.sh')!.cwd).toBe(S + '/9.multiwalker');
  });
});

describe('the stack\'s order (R3c\'s drag and drop moves tiles)', () => {
  it('the steps follow the tiles, and the notebook\'s order has no problem', () => {
    expect(orderProblems(planSystem(ALL, SYS, { base: BASE }))).toEqual([]);
  });
  it('a tile moved above what it needs is a problem, said in words', () => {
    const sb = ALL.stages[0], tiles = [...sb.tiles], [pdb2gmx] = tiles.splice(tiles.findIndex(t => t.type === 'pdb2gmx'), 1);
    tiles.unshift(pdb2gmx);
    const moved = { ...ALL, stages: [{ ...sb, tiles }, ...ALL.stages.slice(1)] };
    expect(orderProblems(planSystem(moved, SYS, { base: BASE }))).toEqual(['pdb2gmx, inside ff/ reads aaaaaaaa.gro before centre the peptide writes it']);
  });
  it('a stage left out reads what an earlier build left on disk: no problem', () => {
    const later = { ...ALL, stages: ALL.stages.map(s => ({ ...s, on: s.id === 'awh' })) };
    expect(orderProblems(planSystem(later, SYS, { base: BASE }))).toEqual([]);
  });
});
