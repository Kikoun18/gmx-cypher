// One gesture scheme (R8a): what a click means, with its keys, the same on every surface.
import { describe, expect, it } from 'vitest';
import { chartKey, clickScope, legendPick, modsOf, pans, pickInList, scopeAtoms } from '../src/core/gestures';

describe('a list: click, ⌘/Ctrl-click, Shift-click', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  const cases: [string, string[], string | null, string, Parameters<typeof pickInList>[4], string[]][] = [
    ['a click selects one', ['a', 'b'], 'a', 'c', {}, ['c']],
    ['⌘ adds one', ['a'], 'a', 'c', { add: true }, ['a', 'c']],
    ['⌘ removes one', ['a', 'c'], 'a', 'c', { add: true }, ['a']],
    ['⌘ removes the last', ['c'], 'c', 'c', { add: true }, []],
    ['Shift selects the range from the anchor', ['b'], 'b', 'd', { shift: true }, ['b', 'c', 'd']],
    ['upwards too, in list order', ['d'], 'd', 'b', { shift: true }, ['b', 'c', 'd']],
    ['Shift with no anchor selects one', [], null, 'c', { shift: true }, ['c']],
    ['Shift with an anchor no longer listed selects one', ['x'], 'x', 'c', { shift: true }, ['c']],
  ];
  it.each(cases)('%s', (_, selected, anchor, id, mods, want) => {
    expect(pickInList(order, selected, anchor, id, mods)).toEqual(want);
  });

  it('⌘ or Ctrl is "add", whichever the platform has', () => {
    const e = { shiftKey: false, altKey: false, metaKey: false, ctrlKey: false };
    expect(modsOf({ ...e, metaKey: true })).toEqual({ shift: false, alt: false, add: true });
    expect(modsOf({ ...e, ctrlKey: true })).toEqual({ shift: false, alt: false, add: true });
    expect(modsOf({ ...e, shiftKey: true, altKey: true })).toEqual({ shift: true, alt: true, add: false });
  });
});

describe('legends and chips: click, ⌘/Ctrl-click', () => {
  const all = ['a', 'b', 'c'];
  const cases: [string, string[], string, boolean, string[]][] = [
    ['a click shows this one alone', ['a', 'b', 'c'], 'b', false, ['b']],
    ['clicking it again shows all', ['b'], 'b', false, ['a', 'b', 'c']],
    ['a click on another shows that one alone', ['b'], 'c', false, ['c']],
    ['⌘ hides one', ['a', 'b', 'c'], 'b', true, ['a', 'c']],
    ['⌘ shows one again, in its place', ['a', 'c'], 'b', true, ['a', 'b', 'c']],
    ['⌘ can hide the last', ['b'], 'b', true, []],
  ];
  it.each(cases)('%s', (_, shown, key, add, want) => expect(legendPick(all, shown, key, add)).toEqual(want));
});

describe('structures: what a click takes, and what pans', () => {
  const e = { shiftKey: false, altKey: false, metaKey: false, ctrlKey: false };
  it.each([
    ['click: the atom', e, { scope: 'atom', add: false }],
    ['Shift-click: its residue', { ...e, shiftKey: true }, { scope: 'residue', add: false }],
    ['Alt-click: its atom name in every residue of that name', { ...e, altKey: true }, { scope: 'name', add: false }],
    ['⌘-click adds', { ...e, metaKey: true }, { scope: 'atom', add: true }],
    ['Ctrl-click adds', { ...e, ctrlKey: true }, { scope: 'atom', add: true }],
    ['⌘-Shift-click adds the residue', { ...e, metaKey: true, shiftKey: true }, { scope: 'residue', add: true }],
  ] as const)('%s', (_, ev, want) => expect(clickScope(ev)).toEqual(want));

  it('a right or middle drag pans, or a left drag with Space held; Alt no longer does', () => {
    expect([pans(2, false), pans(1, false), pans(0, true), pans(0, false)]).toEqual([true, true, true, false]);
  });

  // Two residues of MET (1 and 2) and a SOL, by local index: N, CA, SD of each MET, then OW.
  const mol = { n: 7, name: ['N', 'CA', 'SD', 'N', 'CA', 'SD', 'OW'], resn: ['MET', 'MET', 'MET', 'MET', 'MET', 'MET', 'SOL'], resnr: [1, 1, 1, 2, 2, 2, 3], molOf: [0, 0, 0, 0, 0, 0, 1] };
  it.each([
    ['atom', 1, [1]],
    ['residue', 1, [0, 1, 2]],
    ['residue', 6, [6]],
    ['name', 2, [2, 5]],
    ['name', 6, [6]],
  ] as const)('%s of atom %i', (scope, k, want) => expect(scopeAtoms(mol, k, scope)).toEqual(want));
});

describe('charts: the keys of a focused chart', () => {
  const k = (key: string, m: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) => chartKey({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...m });
  it('steps, changes curve, marks, draws lines and hides', () => {
    expect([k('ArrowRight'), k('ArrowLeft'), k('ArrowRight', { shiftKey: true }), k('ArrowUp'), k('ArrowDown'), k('Home'), k('End')])
      .toEqual([{ step: 1 }, { step: -1 }, { step: 10 }, { curve: -1 }, { curve: 1 }, { to: 'first' }, { to: 'last' }]);
    expect([k('Enter'), k('Enter', { metaKey: true }), k('Enter', { ctrlKey: true, shiftKey: true }), k('Escape'), k('a')])
      .toEqual(['mark', { line: 'x' }, { line: 'y' }, 'hide', null]);
  });
});
