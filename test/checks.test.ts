import { describe, expect, it } from 'vitest';
import { judgeInputs, judgeSizes } from '../src/lib/checks';

describe('checking inputs before anything runs', () => {
  it.each([
    { case: 'all agree', counts: { structure: 3242, runInput: 3242, trajectory: 3242 }, index: undefined, want: [] },
    { case: 'the structure differs', counts: { structure: 3241, runInput: 3242, trajectory: 3242 }, index: undefined, want: ['the structure has 3241 atoms, the run input 3242'] },
    { case: 'the trajectory holds fewer atoms', counts: { structure: 3242, runInput: 3242, trajectory: 2442 }, index: undefined, want: ['the trajectory has 2442 atoms, the run input 3242'] },
    { case: 'an index from another system', counts: { structure: 3242, runInput: 3242, trajectory: 3242 }, index: { groups: 31, maxAtom: 33584 }, want: ['the index refers to atom 33584; the run input has 3242 atoms'] },
    { case: 'an index that fits', counts: { structure: 3242, runInput: 3242, trajectory: 3242 }, index: { groups: 7, maxAtom: 3242 }, want: [] },
    { case: 'gmx could not tell', counts: { structure: 3242, runInput: null, trajectory: 3242 }, index: undefined, want: ['the run input: gmx did not report an atom count'] },
  ])('$case', ({ counts, index, want }) => expect(judgeInputs(counts, index)).toEqual(want));
});

describe('group sizes as gmx select counts them', () => {
  const groups = [{ name: 'sulfur', count: 6 }, { name: 'water_O', count: 800 }, { name: 'sodium', count: 12 }];
  it.each([
    { case: 'all agree', sizes: [6, 800, 12], want: [] },
    { case: 'one differs', sizes: [6, 799, 12], want: ['water_O: gmx counts 799 atoms, gmx-cypher 800'] },
    { case: 'a group missing', sizes: [6, 800], want: ['gmx select reported 2 groups, gmx-cypher wrote 3'] },
    { case: 'nothing reported', sizes: null, want: ['gmx select reported no sizes'] },
  ])('$case', ({ sizes, want }) => expect(judgeSizes(groups, sizes)).toEqual(want));
});
