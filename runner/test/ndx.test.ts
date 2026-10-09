import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNdx, writeNdx } from '../src/lib/ndx';

const fixture = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');

describe('reading an index', () => {
  it("reads GROMACS's own index of your system (gmx make_ndx -f nvt.tpr)", () => {
    const g = parseNdx(fixture('nvt/index.ndx'));
    expect(g.map(x => [x.name, x.atoms.length])).toEqual([['System', 3242], ['Other', 42], ['SO4', 30], ['Na', 12], ['Water', 3200], ['SOL', 3200], ['non-Water', 42]]);
    expect(g[3].atoms).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]);
  });

  it('reads a name as GROMACS does (its first word), keeps duplicates by position, and atoms in order', () => {
    const g = parseNdx('[ water O ]\n  43   47\n  51\n[ NA ]\n 31\n[ NA ]\n 32\n[ empty ]\n');
    expect(g).toEqual([
      { name: 'water', label: 'water O', atoms: [43, 47, 51] },
      { name: 'NA', label: 'NA', atoms: [31] },
      { name: 'NA', label: 'NA', atoms: [32] },
      { name: 'empty', label: 'empty', atoms: [] },
    ]);
  });
});

describe('writing an index, as GROMACS writes it', () => {
  it('writes the index of your system back byte for byte: width 4, single spaces, 15 per line', () => {
    const text = fixture('nvt/index.ndx');
    expect(writeNdx(parseNdx(text))).toBe(text);
  });

  it('keeps the order and duplicate names, and numbers past 9999 widen the field', () => {
    expect(writeNdx([{ name: 'b', atoms: [9999, 10000, 3] }, { name: 'a', atoms: [7] }, { name: 'b', atoms: [1] }])).toBe('[ b ]\n9999 10000    3\n[ a ]\n   7\n[ b ]\n   1\n');
  });

  it('refuses what GROMACS would read differently: a name with a space, an empty group', () => {
    expect(() => writeNdx([{ name: 'water O', atoms: [1] }])).toThrow('group name "water O": GROMACS would read only its first word');
    expect(() => writeNdx([{ name: 'none', atoms: [] }])).toThrow('group none is empty');
  });
});
