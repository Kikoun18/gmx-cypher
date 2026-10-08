import { beforeAll, describe, expect, it } from 'vitest';
import { defaultView, elementOf, SOLVENT_CHAIN, structStyle, toPdb, type Look } from '../src/lib/structFile';
import { fixture, text } from './helpers';

// 3Dmol's own parsers (the build the app loads) run in Node with two small stubs.
type Atom3D = { elem: string; bonds: number[]; atom: string; resn: string; hetflag: boolean; x: number };
type Model3D = { addAtoms(a: Atom3D[]): void; selectedAtoms(sel: object): Atom3D[] };
let $3D: { Parsers: Record<string, (s: string, o: object) => Atom3D[][]>; elementColors: { defaultColors: Record<string, number> }; GLModel: new (id: number) => Model3D };
beforeAll(async () => {
  Object.assign(globalThis, { window: globalThis, document: { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, querySelectorAll: () => [], readyState: 'complete' } });
  const m = await import('3dmol');
  $3D = ((m as { default?: unknown }).default || m) as unknown as typeof $3D;
});
const parsePdb = (pdb: string) => $3D.Parsers.PDB(pdb, { keepH: true })[0];
const unknown = (atoms: Atom3D[]) => atoms.filter(a => $3D.elementColors.defaultColors[a.elem] == null).map(a => a.resn + ' ' + a.atom + ' → ' + a.elem);
const multiH = (atoms: Atom3D[]) => atoms.filter(a => a.elem === 'H' && a.bonds.length > 1).length;

describe('elementOf: every atom gets its real element (R1a)', () => {
  it.each([
    // name, residue, pdb element column, element
    ['1HB', 'CYS', '', 'H'], ['3HA', 'GLY', '', 'H'], ['2HB', 'MET', '', 'H'], ['1HE', 'MET', '', 'H'], ['H01', 'CYS', '', 'H'],
    ['NE', 'ARG', '', 'N'], ['CA', 'GLY', '', 'C'], ['CD', 'GLU', '', 'C'], ['SG', 'CYS', '', 'S'], ['SD', 'MET', '', 'S'], ['OG', 'SER', '', 'O'], ['CE', 'MET', '', 'C'],
    ['OXT', 'CYS', '', 'O'],
    ['CA', 'CA', '', 'Ca'], ['NA', 'NA', '', 'Na'], ['NA', 'SOD', '', 'Na'], ['CL', 'CL', '', 'Cl'], ['CLA', 'CLA', '', 'Cl'], ['K', 'K', '', 'K'],
    ['OW', 'SOL', '', 'O'], ['HW1', 'SOL', '', 'H'], ['HW2', 'TIP3', '', 'H'], ['MW', 'SOL', '', 'virtual'], ['LP1', 'TIP5', '', 'virtual'],
    ['FE', 'HEM', '', 'Fe'], ['NA', 'HEM', '', 'N'], ['CL1', 'LIG', '', 'Cl'],
    // .pdb element column: a real element wins, read case-insensitively; a '0' is an O (F50)
    ['CA', 'GLY', 'C', 'C'], ['CL', 'LIG', 'CL', 'Cl'], ['FE', 'HEM', 'FE', 'Fe'], ['X1', 'LIG', 'Se', 'Se'], ['001', 'GLY', '0', 'O'],
    // review (batch 2): any real element in the column wins; more ions; no boron guessed from a name
    ['CD', 'CD', 'CD', 'Cd'], ['HG', 'HG', 'HG', 'Hg'], ['AU1', 'LIG', 'Au', 'Au'],
    ['CU', 'CU', '', 'Cu'], ['NI', 'NI', '', 'Ni'], ['CO', 'CO', '', 'Co'], ['CS', 'CS', '', 'Cs'], ['HG', 'HG', '', 'Hg'], ['LI', 'LI', '', 'Li'], ['MN', 'MN', '', 'Mn'],
    ['BB', 'ALA', '', null],
    // undecided: not drawn, reported
    ['001', 'GLY', '', null], ['X1', 'LIG', '', null],
  ])('%s in %s (column "%s") → %s', (name, resn, col, want) => {
    expect(elementOf(name, resn, col)).toBe(want);
  });
});

describe('toPdb: what 3Dmol reads (R1a)', () => {
  it.each([
    ['cccccccc.gro', 'gro', 91], ['mmmmmmmm.gro', 'gro', 139], ['test.pdb', 'pdb', 58], ['WTA.gro', 'gro', 152],
  ] as const)('%s: every element known to 3Dmol, no hydrogen with two bonds', (f, format, n) => {
    const r = toPdb(text(fixture(f)), format);
    const atoms = parsePdb(r.pdb);
    expect([atoms.length, r.unknown]).toEqual([n, []]);
    expect(unknown(atoms)).toEqual([]);
    expect(multiH(atoms)).toBe(0);
  });
  it('reproduces the cause: 3Dmol reading the files directly guesses unknown elements', () => {
    const direct = (f: string) => $3D.Parsers.GRO(text(fixture(f)), {})[0];
    expect(unknown(direct('cccccccc.gro'))).toHaveLength(16);
    expect(unknown(direct('mmmmmmmm.gro'))).toHaveLength(56);
    expect(unknown($3D.Parsers.PDB(text(fixture('test.pdb')), {})[0])).toEqual(['GLY 001 → 0']);
  });
  it('.gro coordinates come out in Å, in the columns 3Dmol reads', () => {
    const line = toPdb(text(fixture('cccccccc.gro')), 'gro').pdb.split('\n')[0];
    expect([line.substring(12, 16).trim(), line.substring(17, 20), line.substring(22, 26).trim(), +line.substring(30, 38), line.substring(76, 78).trim()]).toEqual(['N', 'CYS', '1', 21.63, 'N']);
  });
  it('GROMACS residue names are mapped for 3Dmol; non-protein residues are HETATM', () => {
    const gro = ['t', '    5', '    1HISE    CA    1   0.000   0.000   0.000', '    2NALA    CA    2   0.300   0.000   0.000', '    3LYN     CA    3   0.600   0.000   0.000', '    4SOL     OW    4   1.000   0.000   0.000', '    5SOL     MW    5   1.010   0.000   0.000', '   1 1 1'].join('\n');
    const r = toPdb(gro, 'gro'), lines = r.pdb.split('\n').filter(l => /^(ATOM|HETATM)/.test(l));
    expect(lines.map(l => l.slice(0, 6).trim() + ' ' + l.substring(17, 20))).toEqual(['ATOM HIS', 'ATOM ALA', 'ATOM LYS', 'HETATM SOL']);
    expect(r.unknown).toEqual([]);
  });
  it('an undecided atom is left out and named', () => {
    const gro = ['t', '    2', '    1GLY      C    1   0.000   0.000   0.000', '    1GLY    001    2   0.120   0.000   0.000', '   1 1 1'].join('\n');
    expect(toPdb(gro, 'gro').unknown).toEqual(['GLY 001']);
  });
  it('.pdb lines keep everything but the element (and residue name or record, where mapped)', () => {
    const src = text(fixture('test.pdb')).split('\n').find(l => l.startsWith('ATOM      2'))!;
    const out = toPdb(text(fixture('test.pdb')), 'pdb').pdb.split('\n').find(l => l.startsWith('ATOM      2'))!;
    expect(out.slice(0, 76)).toBe(src.padEnd(80).slice(0, 76));
  });
});

// --- R1b: style choice ----------------------------------------------------------------------
const gro = (atoms: string[]) => ['t', String(atoms.length).padStart(5), ...atoms, '   1 1 1'].join('\n');
const groAtoms = (f: string) => text(fixture(f)).split('\n').slice(2, 2 + parseInt(text(fixture(f)).split('\n')[1], 10));
const shift = (l: string, dx: number) => l.slice(0, 20) + (parseFloat(l.slice(20, 28)) + dx).toFixed(3).padStart(8) + l.slice(28);
const ligand = 'HETATM  999  C1  LIG B 100      14.000   0.000   0.000  1.00  0.00           C\nHETATM 1000  O1  LIG B 100      15.200   0.000   0.000  1.00  0.00           O';
const cases: [string, string, 'pdb' | 'gro'][] = [
  ['test.pdb (peptide)', text(fixture('test.pdb')), 'pdb'],
  ['pdb protein + HETATM ligand', text(fixture('test.pdb')).replace(/^END\s*$/m, '') + '\n' + ligand + '\nEND\n', 'pdb'],
  ['WTA.gro (sugar)', text(fixture('WTA.gro')), 'gro'],
  ['cccccccc.gro (protein)', text(fixture('cccccccc.gro')), 'gro'],
  ['protein + sugar chain (.gro)', gro([...groAtoms('cccccccc.gro'), ...groAtoms('WTA.gro').map(l => shift(l, 4))]), 'gro'],
];
/** Atoms 3Dmol would leave undrawn: setStyle is applied in order, the last match wins; cartoon draws protein atoms only. Hydrogens hidden, as by default. */
function undrawn(pdb: string, styles: [object, Record<string, unknown>][]) {
  const m = new $3D.GLModel(0);
  m.addAtoms($3D.Parsers.PDB(pdb, {})[0]);
  const final = new Map<Atom3D, Record<string, unknown>>();
  for (const [sel, st] of styles) for (const a of m.selectedAtoms(sel)) final.set(a, st);
  // Sticks and lines draw nothing for an atom without bonds (a lone water O, an ion).
  return m.selectedAtoms({}).filter(a => { const st = final.get(a) || {}; return !(st.sphere || ((st.stick || st.line) && a.bonds.length) || (st.cartoon && !a.hetflag)); });
}

describe('structStyle: no style leaves the canvas empty (R1b)', () => {
  it.each(cases)('%s: every look draws every atom', (_n, src, format) => {
    const r = toPdb(src, format);
    for (const look of ['cartoon', 'stick', 'sphere', 'line'] as Look[]) expect(undrawn(r.pdb, structStyle(r.info, look).styles).map(a => a.resn + ' ' + a.atom)).toEqual([]);
  });
  it.each([
    // structure, protein residues, other residues, cartoon draws a ribbon?, cartoon note
    [0, 8, 0, true, ''], [1, 8, 1, true, ''], [2, 0, 6, false, 'no protein backbone — shown as sticks'], [3, 8, 0, true, ''], [4, 8, 6, true, ''],
  ])('case %s: %s protein and %s other residues', (i, protein, other, ribbon, note) => {
    const r = toPdb(cases[i][1], cases[i][2]), st = structStyle(r.info, 'cartoon');
    expect([r.info.protein, r.info.other, st.styles.some(([, x]) => 'cartoon' in x), st.note]).toEqual([protein, other, ribbon, note]);
  });
  it('the old cartoon selection drew nothing for a .gro sugar (hetflag is never set by the .gro parser)', () => {
    const m = new $3D.GLModel(0);
    m.addAtoms($3D.Parsers.GRO(text(fixture('WTA.gro')), {})[0]);
    expect(m.selectedAtoms({ hetflag: true })).toHaveLength(0);
  });
  it('an empty file says so', () => {
    const r = toPdb('t\n    0\n   1 1 1\n', 'gro');
    expect([r.info.atoms, structStyle(r.info, 'stick')]).toEqual([0, { styles: [], note: 'no atoms in this file' }]);
  });
});

// --- R1c: defaults, hydrogens, water and ions, lines ---------------------------------------------
const protein32 = gro([0, 1, 2, 3].flatMap(k => groAtoms('cccccccc.gro').map(l => String(parseInt(l.slice(0, 5), 10) + 8 * k).padStart(5) + shift(l, 3.6 * k).slice(5))));
const solvated = gro([...groAtoms('cccccccc.gro'), ...Array.from({ length: 300 }, (_, i) => [
  String(100 + i).padStart(5) + 'SOL     OW' + String(i * 3 + 1).padStart(5) + (1 + (i % 10) * 0.31).toFixed(3).padStart(8) + (1 + Math.floor(i / 10) % 10 * 0.31).toFixed(3).padStart(8) + (1 + Math.floor(i / 100) * 0.31).toFixed(3).padStart(8),
  String(100 + i).padStart(5) + 'SOL    HW1' + String(i * 3 + 2).padStart(5) + (1.096 + (i % 10) * 0.31).toFixed(3).padStart(8) + (1 + Math.floor(i / 10) % 10 * 0.31).toFixed(3).padStart(8) + (1 + Math.floor(i / 100) * 0.31).toFixed(3).padStart(8),
  String(100 + i).padStart(5) + 'SOL    HW2' + String(i * 3 + 3).padStart(5) + (0.968 + (i % 10) * 0.31).toFixed(3).padStart(8) + (1.092 + Math.floor(i / 10) % 10 * 0.31).toFixed(3).padStart(8) + (1 + Math.floor(i / 100) * 0.31).toFixed(3).padStart(8),
]).flat(), '  401NA      NA  991   4.000   4.000   4.000']);

describe('defaults and display choices (R1c)', () => {
  it.each([
    // structure, default look, water and ions hidden by default
    ['test.pdb (8 residues)', text(fixture('test.pdb')), 'pdb', 'stick', false],
    ['cccccccc.gro (8 residues)', text(fixture('cccccccc.gro')), 'gro', 'stick', false],
    ['WTA.gro (sugar)', text(fixture('WTA.gro')), 'gro', 'stick', false],
    ['32-residue protein', protein32, 'gro', 'cartoon', false],
    ['peptide in water (> 800 atoms)', solvated, 'gro', 'stick', true],
  ] as const)('%s', (_n, src, format, look, hideSolvent) => {
    expect(defaultView(toPdb(src, format).info)).toEqual({ look, solvent: !hideSolvent });
  });
  // Review (batch 2): the solvent chain was 'W', which a .pdb may use for protein; now one no file uses.
  it('water and ions go to their own chain, so one selection hides them; the rest stays drawn', () => {
    const r = toPdb(solvated, 'gro');
    const st = structStyle(r.info, 'stick', false).styles;
    expect(st.at(-1)).toEqual([{ chain: SOLVENT_CHAIN }, {}]);
    expect(st).toContainEqual([{ bonds: 0 }, { sphere: { scale: 0.3 } }]);
    const m = new $3D.GLModel(0);
    m.addAtoms(parsePdb(r.pdb));
    expect([m.selectedAtoms({ chain: SOLVENT_CHAIN }).length, r.info.water, r.info.ions]).toEqual([901, 300, 1]);
    for (const look of ['cartoon', 'stick', 'sphere', 'line'] as Look[]) expect(undrawn(r.pdb, structStyle(r.info, look, true).styles)).toEqual([]);
  });
  it('a .pdb protein on chain W stays drawn when water and ions are hidden', () => {
    const water = 'HETATM 9999  O   HOH W 999      50.000  50.000  50.000  1.00  0.00           O';
    const src = text(fixture('test.pdb')).split('\n').map(l => (/^(ATOM  |HETATM)/.test(l) ? l.slice(0, 21) + 'W' + l.slice(22) : l)).filter(l => !l.startsWith('END')).concat(water, 'END').join('\n');
    const r = toPdb(src, 'pdb');
    expect(r.info.water).toBe(1);
    expect(undrawn(r.pdb, structStyle(r.info, 'stick', false).styles).map(a => a.resn + ' ' + a.atom)).toEqual(['HOH O']);
  });
  it('lines are drawn as thin sticks', () => {
    expect(structStyle(toPdb(text(fixture('WTA.gro')), 'gro').info, 'line').styles[0]).toEqual([{}, { stick: { radius: 0.06 } }]);
  });
  it('hydrogens: the same in both formats (3Dmol keepH on the PDB text)', () => {
    const count = (f: string, format: 'pdb' | 'gro', keepH: boolean) => $3D.Parsers.PDB(toPdb(text(fixture(f)), format).pdb, { keepH })[0].filter(a => a.elem === 'H').length;
    expect([count('cccccccc.gro', 'gro', false), count('test.pdb', 'pdb', false), count('cccccccc.gro', 'gro', true) > 0, count('test.pdb', 'pdb', true) > 0]).toEqual([0, 0, true, true]);
  });
});
