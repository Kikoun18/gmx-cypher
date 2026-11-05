// Systems from a connected project (R8a): methods are the rows' groups, saccharides the column labels in lower case
// (the Matrix matches columns without case), sequences the rows' sequences in lower case (the folder spelling);
// "build what the project lacks" is every cell with no run, and nothing else.
import { describe, expect, it } from 'vitest';
import { cellKey, systemsOf } from '../src/lib/build/plan';
import { systemsFromProject, type ProjectLike } from '../src/lib/build/project';

const P: ProjectLike = {
  name: 'innit',
  columns: [{ k: 'c1', label: 'O111' }, { k: 'c2', label: 'pg' }],
  rows: [
    { name: 'AAAAAAAA', seq: 'AAAAAAAA', group: 'hmr+fast+6', runs: { c1: ['a', 'b'], c2: [] } },
    { name: 'HA', seq: 'WRWYCR', group: 'hmr+fast+6', runs: { c2: ['a'] } },
    { name: 'AAAAAAAA', seq: 'AAAAAAAA', group: 'original', runs: {} },
  ],
  settings: { pattern: '{method}_{column}_{seq}_t{time}.xvg', pathPattern: '' },
};

describe('systems from a project', () => {
  it('takes the groups, the column labels and the sequences, each once, in the project\'s order', () => {
    const r = systemsFromProject(P);
    expect(r.systems).toEqual({ methods: ['hmr+fast+6', 'original'], saccharides: ['o111', 'pg'], sequences: ['aaaaaaaa', 'wrwycr'], repeats: 0 });
    expect(r.cells).toBe(6);
    expect(r.skipped).toEqual([]);
  });
  it('the cells without a run, and only those, as systems', () => {
    const r = systemsFromProject(P);
    expect(r.lacking.only).toEqual(['hmr+fast+6/pg/aaaaaaaa', 'hmr+fast+6/o111/wrwycr', 'original/o111/aaaaaaaa', 'original/pg/aaaaaaaa']);
    expect(systemsOf(r.lacking).map(s => s.dir)).toEqual([
      'solutions/hmr+fast+6/o111/wrwycr', 'solutions/hmr+fast+6/pg/aaaaaaaa', 'solutions/original/o111/aaaaaaaa', 'solutions/original/pg/aaaaaaaa']);
    expect(r.lacking.methods).toEqual(['hmr+fast+6', 'original']);
    expect(r.lacking.repeats).toBe(0);
  });
  it('a cell has a run when any row of that group and sequence has one there', () => {
    const twin = { ...P, rows: [...P.rows, { name: 'other', seq: 'aaaaaaaa', group: 'hmr+fast+6', runs: { c2: ['c'] } }] };
    expect(systemsFromProject(twin).lacking.only).not.toContain('hmr+fast+6/pg/aaaaaaaa');
  });
  it('leaves out, in words, what can\'t be a folder: a row with no group or sequence, a column label with a space', () => {
    const r = systemsFromProject({ ...P, columns: [...P.columns, { k: 'c3', label: 'beta glucan' }], rows: [...P.rows, { name: 'x', seq: '', group: 'hmr', runs: {} }, { name: 'y', seq: 'GG', group: '', runs: {} }] });
    expect(r.systems.saccharides).toEqual(['o111', 'pg']);
    expect(r.systems.methods).toEqual(['hmr+fast+6', 'original']);
    expect(r.skipped).toEqual(['column beta glucan: a saccharide is letters, digits and _ -, starting with a letter or digit: "beta glucan"', 'row x: no sequence', 'row y: no group, so no method']);
  });
  it('a project with nothing in it gives nothing', () => {
    expect(systemsFromProject({ ...P, columns: [], rows: [] })).toMatchObject({ systems: { methods: [], saccharides: [], sequences: [] }, lacking: { only: [] }, cells: 0 });
  });
});

describe('a build of some cells only', () => {
  it('systemsOf keeps the cells listed, each with its repeats', () => {
    const s = { methods: ['hmr'], saccharides: ['o111', 'pg'], sequences: ['aa'], repeats: 1 };
    expect(systemsOf({ ...s, only: [cellKey('hmr', 'pg', 'aa'), cellKey('hmrr', 'o111', 'aa')] }).map(x => x.dir)).toEqual(['solutions/hmr/pg/aa', 'solutions/hmrr/pg/aa']);
    expect(systemsOf({ ...s, only: [] })).toEqual([]);
    expect(systemsOf(s)).toHaveLength(4);
  });
});
