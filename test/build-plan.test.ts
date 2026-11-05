// SymBuilder's model (R3a): the build plan's frozen format first, then repeats, method switches, systems and names.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, nameProblem, planProblems, repeatName, switches, systemsOf } from '../src/lib/build/plan';

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
  it.each([['method', 'hmr+fast+6', null], ['method', '../etc', 'bad'], ['method', 'a b', 'bad'], ['saccharide', 'o111', null], ['saccharide', 'o/111', 'bad'], ['sequence', 'aaaaaaaa', null], ['sequence', 'aa1', 'bad'], ['sequence', '', 'bad']] as const)('%s %s', (kind, name, out) => {
    expect(nameProblem(kind, name) === null ? null : 'bad').toBe(out);
  });
});
