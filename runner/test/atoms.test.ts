import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { structFormat, toPdb } from '../../matrix/src/lib/structFile';
import { atomTable, drawnNumbers, fromRanges, toRanges } from '../src/lib/atoms';

const APP = new URL('../../matrix/test/fixtures/', import.meta.url), NVT = new URL('./fixtures/nvt/', import.meta.url);
const read = (base: URL, f: string) => readFileSync(new URL(f, base), 'utf8');
const pdbLines = (pdb: string) => pdb.split('\n').filter(l => /^(ATOM  |HETATM)/.test(l));

/** The k-th drawn atom is the k-th line of toPdb's text, which 3Dmol loads in that order (keepH: true). */
function expectSameAsToPdb(text: string, format: 'gro' | 'pdb') {
  const atoms = atomTable(text, format), drawn = atoms.filter(a => a.drawn), lines = pdbLines(toPdb(text, format).pdb);
  expect(drawn.length).toBe(lines.length);
  drawn.forEach((a, k) => {
    expect(a.name).toBe(lines[k].slice(12, 16).trim());
    if (format === 'gro') expect(Number(lines[k].slice(6, 11))).toBe(a.nr % 100000);
  });
  return atoms;
}

describe('the atom table: every atom with its GROMACS number, and which ones are drawn', () => {
  it.each([['WTA.gro', 152], ['cccccccc.gro', 91], ['mmmmmmmm.gro', 139], ['test.pdb', 58]])('%s: all %i drawn, in toPdb order', (f, n) => {
    const text = read(APP, f), atoms = expectSameAsToPdb(text, structFormat(f, text)!);
    expect(atoms).toHaveLength(n);
    expect(atoms.map(a => a.nr)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  });

  it('your nvt.gro: 3242 atoms, the 800 MW1 virtual sites not drawn, so drawn atom 45 is GROMACS atom 47', () => {
    const atoms = expectSameAsToPdb(read(NVT, 'nvt.gro'), 'gro');
    expect(atoms).toHaveLength(3242);
    expect(atoms.filter(a => !a.drawn).every(a => a.name === 'MW1' && a.elem === 'virtual')).toBe(true);
    const nr = drawnNumbers(atoms);
    expect(nr).toHaveLength(2442);
    expect(nr[44]).toBe(45); // HW2 of water 19
    expect(nr[45]).toBe(47); // OW1 of water 20: past the first left-out site
    expect(atoms[46]).toMatchObject({ nr: 47, name: 'OW1', resn: 'SOL', resi: 20, elem: 'O', drawn: true });
  });

  it('a built structure with a virtual site and an undecided atom keeps every number', () => {
    const gro = ['built', '    5',
      '    1SOL     OW    1   0.000   0.000   0.000', '    1SOL     MW    2   0.010   0.000   0.000',
      '    2UNK    001    3   0.200   0.000   0.000', '    3NA      NA    4   0.400   0.000   0.000',
      '    4ETH     C1    5   0.600   0.000   0.000', '   1.0 1.0 1.0'].join('\n');
    const atoms = expectSameAsToPdb(gro, 'gro');
    expect(atoms.map(a => [a.nr, a.name, a.elem, a.drawn])).toEqual([[1, 'OW', 'O', true], [2, 'MW', 'virtual', false], [3, '001', null, false], [4, 'NA', 'Na', true], [5, 'C1', 'C', true]]);
    expect(drawnNumbers(atoms)).toEqual([1, 4, 5]);
  });

  it('a .gro over 100 000 atoms: the serial wraps, the GROMACS number does not', () => {
    const n = 100_003, rows = Array.from({ length: n }, (_, i) => String((i % 99999) + 1).padStart(5) + 'SOL  '.padEnd(5) + '   OW' + String((i + 1) % 100000).padStart(5) + '   0.000   0.000   0.000');
    const atoms = expectSameAsToPdb(['big', String(n), ...rows, '   9.0 9.0 9.0'].join('\n'), 'gro');
    expect(atoms.slice(-4).map(a => a.nr)).toEqual([100000, 100001, 100002, 100003]);
  });

  it('a .pdb: only the first model, ATOM and HETATM records', () => {
    const pdb = ['MODEL 1', 'ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N',
      'HETATM    2  O   HOH A   2       1.000   0.000   0.000  1.00  0.00           O', 'ENDMDL',
      'MODEL 2', 'ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N', 'ENDMDL'].join('\n');
    expect(expectSameAsToPdb(pdb, 'pdb').map(a => [a.nr, a.name, a.resn, a.resi])).toEqual([[1, 'N', 'GLY', 1], [2, 'O', 'HOH', 2]]);
  });
});

describe('atom numbers as ranges', () => {
  it.each([
    [[5, 10, 15, 20, 25, 30], '5-30:5'],
    [[31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], '31-42'],
    [Array.from({ length: 800 }, (_, i) => 43 + 4 * i), '43-3239:4'],
    [[1, 2, 3, 7], '1-3, 7'],
    [[7, 9], '7, 9'],
    [[], ''],
  ])('%j ↔ %s', (nums, text) => {
    expect(toRanges(nums)).toBe(text);
    expect(fromRanges(text)).toEqual(nums);
  });

  it('reads what a person types: any order, spaces, duplicates', () => {
    expect(fromRanges('10, 1-3,  2 ,5-9:2')).toEqual([1, 2, 3, 5, 7, 9, 10]);
    expect(() => fromRanges('1-x')).toThrow('not an atom number or range: 1-x');
    expect(() => fromRanges('0')).toThrow();
  });
});
