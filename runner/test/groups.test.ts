import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atomTable, toRanges } from '../src/lib/atoms';
import { clickStep, groupAtoms, nameProblem, ruleText, shared, type Rule, type Step } from '../src/lib/groups';

const nvt = atomTable(readFileSync(new URL('./fixtures/nvt/nvt.gro', import.meta.url), 'utf8'), 'gro');
const pdb = atomTable(readFileSync(new URL('../../app/test/fixtures/test.pdb', import.meta.url), 'utf8'), 'pdb');
const add = (rule: Rule): Step => ({ op: 'add', rule });

describe('rules → atoms, on your nvt.gro (every atom, virtual sites included)', () => {
  it.each<[Rule, string, string]>([
    [{ kind: 'resname', value: 'SO4' }, 'residue name SO4', '1-30'],
    [{ kind: 'resname', value: 'Na' }, 'residue name Na', '31-42'],
    [{ kind: 'name', value: 'S1' }, 'atom name S1', '5-30:5'],
    [{ kind: 'name', value: 'OW1', resn: 'SOL' }, 'atom name OW1 in every SOL', '43-3239:4'],
    [{ kind: 'name', value: 'MW1' }, 'atom name MW1', '46-3242:4'],
    [{ kind: 'element', value: 'Na' }, 'element Na', '31-42'],
    [{ kind: 'resnr', from: 1, to: 6 }, 'residue numbers 1–6', '1-30'],
    [{ kind: 'resnr', from: 7, to: 7 }, 'residue number 7', '31'],
    [{ kind: 'atoms', atoms: '5, 47' }, 'atoms 5, 47', '5, 47'],
  ])('%j: "%s" → %s', (rule, text, atoms) => {
    expect(ruleText(rule)).toBe(text);
    expect(toRanges(groupAtoms(nvt, [add(rule)]))).toBe(atoms);
  });

  it('counts element O over sulfate and water oxygens: 24 + 800', () => {
    expect(groupAtoms(nvt, [add({ kind: 'element', value: 'O' })])).toHaveLength(824);
  });

  it('applies steps in order: water without its virtual sites', () => {
    const steps: Step[] = [add({ kind: 'resname', value: 'SOL' }), { op: 'remove', rule: { kind: 'name', value: 'MW1' } }];
    expect(groupAtoms(nvt, steps)).toHaveLength(2400);
  });

  it('matches names exactly as the file writes them', () => {
    expect(groupAtoms(nvt, [add({ kind: 'resname', value: 'sol' })])).toHaveLength(0);
  });

  it('on test.pdb: atom names in a protein', () => {
    expect(groupAtoms(pdb, [add({ kind: 'name', value: 'CA', resn: 'GLY' })])).toEqual(pdb.filter(a => a.name === 'CA').map(a => a.nr));
  });
});

describe('clicks', () => {
  it('toggles an atom, takes a residue with shift, and a name in every residue of its name with alt', () => {
    let steps: Step[] = [];
    steps = clickStep(nvt, steps, 47, 'atom');
    steps = clickStep(nvt, steps, 51, 'atom');
    expect(steps).toEqual([{ op: 'add', rule: { kind: 'atoms', atoms: '47, 51' }, note: 'clicked' }]);
    steps = clickStep(nvt, steps, 47, 'atom');
    expect(toRanges(groupAtoms(nvt, steps))).toBe('51');
    steps = clickStep(nvt, [], 3, 'residue');
    expect(steps).toEqual([{ op: 'add', rule: { kind: 'atoms', atoms: '1-5' }, note: 'shift-click on SO4 1' }]);
    steps = clickStep(nvt, [], 5, 'name');
    expect(steps).toEqual([{ op: 'add', rule: { kind: 'name', value: 'S1', resn: 'SO4' } }]);
    expect(groupAtoms(nvt, clickStep(nvt, steps, 10, 'name'))).toEqual([]);
  });
});

describe('group names: what GROMACS can read and the curve label', () => {
  it.each([
    ['water_O', null], ['OW+sugar', null], ['1st.shell', null], ['O3:GLC', null], ['Wat-H', null],
    ['', 'a name is needed'],
    ['water O', 'no spaces: GROMACS reads only the first word of a group name'],
    ['a/b', 'use letters, digits and _ - + . : only'],
    ['x'.repeat(33), 'at most 32 characters'],
    ['SODIUM', 'another group is already called sodium'],
  ])('%s → %s', (name, problem) => expect(nameProblem(name, ['sodium', 'sulfur'])).toBe(problem));
});

describe('overlap', () => {
  it('finds the atoms two groups share', () => {
    expect(shared([5, 10, 15], [1, 2, 3, 4, 5, 10])).toEqual([5, 10]);
    expect(shared([5], [6])).toEqual([]);
  });

  it('on your nvt.gro: sulfur in sulfate shares 6 atoms', () => {
    const s = groupAtoms(nvt, [add({ kind: 'name', value: 'S1' })]), so4 = groupAtoms(nvt, [add({ kind: 'resname', value: 'SO4' })]);
    expect(shared(s, so4)).toEqual([5, 10, 15, 20, 25, 30]);
  });
});
