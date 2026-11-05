// SymBuilder's model (R3a): the build plan's frozen format first, then repeats, method switches, systems and names.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, nameProblem, planProblems, repeatClashes, repeatName, switches, systemsOf, systemsProblems } from '../src/lib/build/plan';

const V1 = JSON.parse(readFileSync(new URL('./fixtures/build/build-plan-v1.json', import.meta.url), 'utf8'));

describe('build plan format', () => {
  it('reads the frozen version 1, which is the default plan', () => {
    expect(planProblems(V1)).toEqual([]);
    expect(V1).toEqual(DEFAULT_PLAN);
  });
  it('refuses a newer version in words, and anything that is not a build plan', () => {
    expect(planProblems({ ...V1, version: 2 })).toEqual(['this build plan was made by a newer gmx-cypher (version 2); this one reads version 1']);
    expect(planProblems({ ...V1, format: 'gmx-cypher run' })[0]).toMatch(/^not a build plan/);
    expect(planProblems(null)).toEqual(['not a build plan: no JSON object']);
    expect(planProblems({ ...V1, stages: V1.stages.slice(1) })[0]).toMatch(/^its stages are not solution builder/);
    expect(planProblems({ ...V1, science: { ...V1.science, maxwarn: '6' } })).toEqual(['science value maxwarn is missing or of another kind']);
  });
  // Science values become paths (inputs/<mdp>, ff/<forcefield>.ff, molecules/<glucose>) and argv (review finding 1),
  // and a value of the wrong kind made the planner throw (finding 4): each is checked, said in words.
  const sc = (patch: object) => planProblems({ ...V1, science: { ...V1.science, ...patch } });
  it.each([
    ['an mdp file outside inputs/', { mdp: { ...V1.science.mdp, min: '../../../../etc/passwd' } }, 'science value mdp.min is not an mdp file name in inputs/: "../../../../etc/passwd"'],
    ['an mdp file that is not .mdp', { mdp: { ...V1.science.mdp, awh: 'awh.txt' } }, 'science value mdp.awh is not an mdp file name in inputs/: "awh.txt"'],
    ['mdp files missing', { mdp: null }, 'science value mdp is missing or of another kind'],
    ['a force field outside ff/', { forcefield: '../../root/.ssh/x' }, 'science value forcefield is not a folder name in ff/: "../../root/.ssh/x"'],
    ['a glucose file outside molecules/', { glucose: { ...V1.science.glucose, file: '/etc/hosts' } }, 'science value glucose.file is not a file name in molecules/: "/etc/hosts"'],
    ['walkers not a list', { walkers: {} }, 'science value walkers is missing or of another kind'],
    ['a walker distance that is not a number', { walkers: [0.4, 'x'] }, 'science value walkers is not a list of distances in nm'],
    ['restraints missing', { restraints: null }, 'science value restraints is missing or of another kind'],
    ['a restraint that is not a define', { restraints: { 'A B': 1 } }, 'science value restraints has "A B", not a define with a number'],
    ['answers per sequence missing', { answersBySequence: null }, 'science value answersBySequence is missing or of another kind'],
    ['answers that are not menu numbers', { answersBySequence: { aaaa: '1; rm' } }, 'science value answersBySequence.aaaa is not menu numbers: "1; rm"'],
    ['an ion that is not a name', { positive: 'NA s' }, 'science value positive is not an ion name: "NA s"'],
    ['a shift of two numbers', { shift: [0, 1] }, 'science value shift is not three numbers'],
    ['a box that is not a number', { box: Number.NaN }, 'science value box is not a number'],
  ])('refuses %s, in words', (_w, patch, why) => {
    expect(sc(patch)).toEqual([why]);
  });

  it('keeps the notebook\'s values and order', () => {
    expect(DEFAULT_PLAN.science).toMatchObject({ ionCharge: 0.75, salt: 0.15, waterMolarity: 55.5, positive: 'NA_s', negative: 'CL_2s', shift: [0, 1.5, 0], box: 7.0, maxwarn: 6, answers: '1 8 0 0' });
    expect(DEFAULT_PLAN.science.walkers).toEqual([0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0]);
    expect(DEFAULT_PLAN.stages[0].tiles.map(t => t.type + (t.mol ? ':' + t.mol : ''))).toEqual(['sequence', 'trjconv:peptide', 'saccharide', 'trjconv:saccharide', 'editconf:saccharide', 'pdb2gmx', 'termini', 'editconf:peptide', 'merge', 'topology', 'solvate', 'genion', 'hmr', 'glucose']);
    expect(DEFAULT_PLAN.stages[0].tiles.find(t => t.type === 'glucose')!.on).toBe(false);
    expect(DEFAULT_PLAN.stages.find(s => s.id === 'walkers')!.on).toBe(false);
  });
});

describe('methods, repeats and systems', () => {
  it.each([['hmr+fast+6', 0, 'hmr+fast+6'], ['hmr+fast+6', 1, 'hmr+fast+6r'], ['hmr+fast+6', 2, 'hmr+fast+6r1'], ['hmr+fast+6', 3, 'hmr+fast+6r2'], ['original', 1, 'originalr']] as const)('%s repeat %i → %s', (m, n, out) => {
    expect(repeatName(m, n)).toBe(out);
  });
  it.each([['hmr+fast+6', true, true], ['hmr+fast+6r', true, true], ['hmr', true, false], ['fast', false, true], ['original+x', false, false]] as const)('%s switches hmr %s, fast %s', (m, hmr, fast) => {
    expect(switches(m)).toEqual({ hmr, fast });
  });
  it('every method × repeat × saccharide × sequence, in the notebook\'s folders, the sequence upper-cased for PyMOL', () => {
    const s = systemsOf({ methods: ['hmr+fast+6'], saccharides: ['o111', 'pg'], sequences: ['aaaaaaaa', 'kwrgargl'], repeats: 1 });
    expect(s).toHaveLength(8);
    expect(s[0]).toEqual({ method: 'hmr+fast+6', saccharide: 'o111', sequence: 'aaaaaaaa', SEQUENCE: 'AAAAAAAA', repeat: 0, dir: 'solutions/hmr+fast+6/o111/aaaaaaaa' });
    expect(s[7].dir).toBe('solutions/hmr+fast+6r/pg/kwrgargl');
  });
  it('a repeat named like another method is one system, built once, and said (review finding 3)', () => {
    const s = { methods: ['hmr+fast+6', 'hmr+fast+6r'], saccharides: ['o111'], sequences: ['aa'], repeats: 1 };
    expect(systemsOf(s).map(x => x.dir)).toEqual(['solutions/hmr+fast+6/o111/aa', 'solutions/hmr+fast+6r/o111/aa', 'solutions/hmr+fast+6rr/o111/aa']);
    expect(repeatClashes(s)).toEqual(['hmr+fast+6r is a method and hmr+fast+6\'s repeat 1: its systems are built once']);
    expect(repeatClashes({ ...s, repeats: 0 })).toEqual([]);
  });
  it.each([
    [{ methods: ['m'], saccharides: ['c'], sequences: ['aa'], repeats: 0 }, []],
    [{ methods: [123], saccharides: ['c'], sequences: ['aa'], repeats: 0 }, ['a method is a name: 123']],
    [{ methods: ['m'], saccharides: ['c'], sequences: ['aa'], repeats: 3e6 }, ['repeats is a whole number from 0 to 9']],
    [{ methods: ['m'], saccharides: 'c', sequences: ['aa'], repeats: 0 }, ['no saccharide list']],
    [{ methods: ['m'], saccharides: ['c'], sequences: ['aa'], repeats: 0, only: [1] }, ['only is a list of cells']],
    [null, ['no systems']],
  ])('systems from the page, checked: %j', (s, out) => {
    expect(systemsProblems(s)).toEqual(out);
  });
  it.each([['method', 'hmr+fast+6', null], ['method', '../etc', 'bad'], ['method', 'a b', 'bad'], ['saccharide', 'o111', null], ['saccharide', 'o/111', 'bad'], ['sequence', 'aaaaaaaa', null], ['sequence', 'aa1', 'bad'], ['sequence', '', 'bad']] as const)('%s %s', (kind, name, out) => {
    expect(nameProblem(kind, name) === null ? null : 'bad').toBe(out);
  });
});
