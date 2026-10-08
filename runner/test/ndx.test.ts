import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNdx } from '../src/lib/ndx';

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
